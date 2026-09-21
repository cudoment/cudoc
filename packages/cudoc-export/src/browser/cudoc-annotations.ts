/**
 * The review-note runtime a page loads when the site was built with
 * `annotations: true`. It has no dependencies and talks to no server: notes
 * live in the page, in the reader's browser when that is allowed, and in the
 * files the reader downloads. Bundled by esbuild into one classic script.
 */

import {
  ANNOTATION_CONTEXT,
  LIMITS,
  collection,
  mergeAnnotations,
  threads,
  type Annotation,
  type AnnotationCollection,
  type AnnotationScope,
} from "../annotations/model.js"
import {
  blockAt,
  buildTextIndex,
  closestBlock,
  describeBlock,
  describeSelection,
  describeSpan,
  offsetOf,
  rangeFromOffsets,
  resolveTarget,
  type Anchor,
  type Described,
  type TextIndex,
} from "./dom-text.js"
import {
  clearTokenFromLocation,
  decodeToken,
  download,
  embeddedCopy,
  encodeToken,
  parseText,
  readAnnotatedHtml,
  readEmbedded,
  readLocal,
  storageAvailable,
  storageKey,
  tokenFromLocation,
  writeLocal,
} from "./store.js"
import {
  LANGS,
  STRINGS,
  UI_ID,
  Ui,
  type Handlers,
  type Lang,
  type Layout,
  type NoteView,
} from "./ui.js"

const AUTHOR_KEY = "cudoc-annotations:author"
const LANG_KEY = "cudoc-annotations:lang"
const LAYOUT_KEY = "cudoc-annotations:layout"
const LAYOUTS: readonly Layout[] = ["push", "overlay"]
const TOKEN_WARN_CHARS = 16 * 1024
/** How far left of a block the pointer may go before the "+" hides. */
const GUTTER_REACH = 48

type Runtime = {
  create: (exact: string, body: string) => Annotation | undefined
  createOnBlock: (blockId: string, body: string) => Annotation | undefined
  reply: (id: string, body: string) => Annotation | undefined
  list: () => Annotation[]
  anchors: () => Record<string, Anchor["kind"] | "moved">
  load: (text: string) => number
  collection: () => AnnotationCollection
  embeddedCopy: () => string
  token: () => Promise<string>
}

declare global {
  interface Window {
    cudocAnnotations?: Runtime
  }
}

function readPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered; the choice still holds for this page.
  }
}

function start(): void {
  const main = document.querySelector<HTMLElement>("main[data-cudoc-document]")
  if (!main) return
  const documentId = main.dataset.cudocDocument ?? ""
  const astHash = main.dataset.cudocAstHash ?? ""
  const sourceHash = main.dataset.cudocSourceHash ?? ""
  const site = main.dataset.cudocSite ?? ""
  const generator = main.dataset.cudocGenerator ?? "cudoc-export"
  // The panel speaks English until the reader picks a language; the
  // document's language says nothing about the reader's. Both choices are
  // remembered per browser, not per document.
  let lang: Lang = readPreference(LANG_KEY, LANGS, "en")
  let layout: Layout = readPreference(LAYOUT_KEY, LAYOUTS, "push")
  let t = STRINGS[lang]
  const key = storageKey(site, documentId)
  const storage = storageAvailable()
  const fileStem = documentId.split("/").pop() || "notes"

  let items: Annotation[] = []
  let anchors = new Map<string, Anchor>()
  let active: string | undefined
  let author = ""
  try {
    author = localStorage.getItem(AUTHOR_KEY) ?? ""
  } catch {
    author = ""
  }

  const index: TextIndex = buildTextIndex(
    main,
    (el) => el.tagName === "FOOTER" || el.id === UI_ID,
  )

  const roots = () =>
    items.filter((a) => a.cudoc.document === documentId && !a.cudoc.parent)

  const highlightsSupported =
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight === "function"

  const paint = () => {
    for (const el of Array.from(main.querySelectorAll(".cudoc-ann-marked")))
      el.classList.remove("cudoc-ann-marked")
    if (highlightsSupported) {
      const open = new Highlight()
      const resolved = new Highlight()
      const current = new Highlight()
      for (const note of roots()) {
        const anchor = anchors.get(note.id)
        if (!anchor || anchor.kind === "orphan") continue
        const range = rangeFromOffsets(index, anchor.start, anchor.end)
        if (!range) continue
        if (note.id === active) current.add(range)
        else if (note.cudoc.state === "resolved") resolved.add(range)
        else open.add(range)
      }
      CSS.highlights.set("cudoc-note", open)
      CSS.highlights.set("cudoc-note-resolved", resolved)
      CSS.highlights.set("cudoc-note-active", current)
      return
    }
    // Without the Highlight API the block itself is marked, the one DOM
    // change the runtime makes; a saved copy strips it again.
    for (const note of roots()) {
      const anchor = anchors.get(note.id)
      if (anchor && anchor.kind !== "orphan" && anchor.element)
        anchor.element.classList.add("cudoc-ann-marked")
    }
  }

  const persist = () => {
    if (storage) writeLocal(key, items, generator)
  }

  const view = (): NoteView[] => {
    const byThread = threads(
      items.filter((a) => a.cudoc.document === documentId),
    )
    return byThread.map(({ root, replies }) => ({
      note: root,
      replies,
      anchor: anchors.get(root.id) ?? { kind: "orphan" },
      stale: root.cudoc.astHash !== "" && root.cudoc.astHash !== astHash,
    }))
  }

  const refresh = () => {
    anchors = new Map(
      roots().map((note) => [note.id, resolveTarget(note, index)]),
    )
    paint()
    const notes = view()
    ui.render({
      notes,
      others: items.filter((a) => a.cudoc.document !== documentId).length,
      stale: notes.some((n) => n.stale),
      storage,
      author,
      active,
    })
    persist()
  }

  const now = () => new Date().toISOString()
  const newId = () =>
    `urn:uuid:${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
    }`

  const add = (described: Described, body: string, scope: AnnotationScope) => {
    const created = now()
    const note: Annotation = {
      "@context": ANNOTATION_CONTEXT,
      type: "Annotation",
      id: newId(),
      created,
      modified: created,
      motivation: body ? "commenting" : "highlighting",
      body: body
        ? [
            {
              type: "TextualBody",
              value: body,
              format: "text/plain",
              purpose: "commenting",
            },
          ]
        : [],
      target: { source: documentId, selector: described.selectors },
      cudoc: {
        document: documentId,
        astHash,
        sourceHash,
        block: described.block,
        heading: described.heading,
        scope,
        state: "open",
      },
    }
    if (author) note.creator = { type: "Person", name: author }
    items = mergeAnnotations(items, [note])
    active = note.id
    refresh()
    return note
  }

  const find = (id: string) => items.find((a) => a.id === id)

  const handlers: Handlers = {
    onAuthor: (name) => {
      author = name.slice(0, LIMITS.name)
      try {
        if (author) localStorage.setItem(AUTHOR_KEY, author)
        else localStorage.removeItem(AUTHOR_KEY)
      } catch {
        // Not remembered; the name still goes into notes made now.
      }
    },
    onDownload: () => {
      download(
        `${fileStem}.annotations.json`,
        new Blob([JSON.stringify(collection(items, generator), null, 2)], {
          type: "application/json",
        }),
      )
    },
    onSaveCopy: () => {
      download(
        `${fileStem}.annotated.html`,
        new Blob([embeddedCopy(items, generator, UI_ID)], {
          type: "text/html",
        }),
      )
      ui.notify(t.saveCopyHint)
    },
    onToken: async () => {
      const token = await encodeToken(items, generator)
      // A local page's address is a path on this machine, which the author
      // has no use for and the reader may not want to share: the token
      // alone is what travels.
      const text =
        location.protocol === "file:"
          ? `#cudoc-notes=${token}`
          : `${location.href.split("#")[0]}#cudoc-notes=${token}`
      ui.showToken(
        text,
        `${t.tokenReady} ${t.tokenWarning}${text.length > TOKEN_WARN_CHARS ? ` ${t.tokenTooLong}` : ""}`,
      )
      try {
        await navigator.clipboard.writeText(text)
        ui.notify(t.tokenCopied)
      } catch {
        // The textarea is on screen; copying by hand works everywhere.
      }
    },
    onImport: async (file) => {
      try {
        const text = await file.text()
        const loaded =
          file.name.toLowerCase().endsWith(".html") ||
          text.trimStart().startsWith("<")
            ? readAnnotatedHtml(text)
            : parseText(text)
        items = mergeAnnotations(items, loaded.items)
        refresh()
        ui.notify(t.imported(loaded.items.length))
      } catch (error) {
        ui.notify(
          t.importFailed(
            error instanceof Error ? error.message : String(error),
          ),
        )
      }
    },
    onClearStorage: () => {
      try {
        localStorage.removeItem(key)
      } catch {
        // Nothing stored, nothing to clear.
      }
      ui.notify(t.cleared)
    },
    onSelect: (id) => {
      active = id
      refresh()
      const anchor = anchors.get(id)
      if (anchor && anchor.kind !== "orphan") {
        const range = rangeFromOffsets(index, anchor.start, anchor.end)
        const target = range?.startContainer.parentElement ?? anchor.element
        target?.scrollIntoView({ block: "center", behavior: "smooth" })
      }
    },
    onEdit: (id, body) => {
      const note = find(id)
      if (!note || !body) return
      note.body = [
        {
          type: "TextualBody",
          value: body,
          format: "text/plain",
          purpose: note.cudoc.parent ? "replying" : "commenting",
        },
      ]
      if (note.motivation === "highlighting") note.motivation = "commenting"
      note.modified = now()
      refresh()
    },
    onDelete: (id) => {
      items = items.filter((a) => a.id !== id && a.cudoc.parent !== id)
      if (active === id) active = undefined
      refresh()
    },
    onToggleState: (id) => {
      const note = find(id)
      if (!note) return
      note.cudoc.state = note.cudoc.state === "resolved" ? "open" : "resolved"
      note.modified = now()
      refresh()
    },
    onReply: (id, body) => {
      reply(id, body)
    },
    onLanguage: (next) => {
      if (next === lang) return
      lang = next
      t = STRINGS[lang]
      writePreference(LANG_KEY, lang)
      remount()
    },
    onLayout: (next) => {
      layout = next
      writePreference(LAYOUT_KEY, layout)
    },
  }

  let ui = new Ui(t, lang, layout, handlers)

  // A language change rebuilds the layer; notes and the open state stay.
  const remount = () => {
    const open = ui.isOpen
    ui.destroy()
    ui = new Ui(t, lang, layout, handlers)
    document.body.append(ui.root)
    ui.setOpen(open)
    refresh()
  }

  const reply = (id: string, body: string): Annotation | undefined => {
    const root = find(id)
    if (!root || !body) return undefined
    const created = now()
    const note: Annotation = {
      "@context": ANNOTATION_CONTEXT,
      type: "Annotation",
      id: newId(),
      created,
      modified: created,
      motivation: "replying",
      body: [
        {
          type: "TextualBody",
          value: body,
          format: "text/plain",
          purpose: "replying",
        },
      ],
      target: root.target,
      cudoc: { ...root.cudoc, state: "open", parent: root.id },
    }
    if (author) note.creator = { type: "Person", name: author }
    items = mergeAnnotations(items, [note])
    refresh()
    return note
  }

  document.body.append(ui.root)

  // Selection → floating button → composer.
  let pending: Described | undefined
  const onSelection = () => {
    const described = ui.composerOpen
      ? undefined
      : describeSelection(index, document.getSelection())
    if (!described) {
      pending = undefined
      ui.hideNoteButton()
      return
    }
    pending = described
    const range = document.getSelection()!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      ui.hideNoteButton()
      return
    }
    ui.showNoteButton(rect, () => {
      const target = pending
      if (!target) return
      const rect = range.getBoundingClientRect()
      ui.hideNoteButton()
      ui.composer.open(
        rect,
        "",
        (body) => add(target, body, "text"),
        target.selectors[0]?.type === "TextQuoteSelector"
          ? excerptOf(target)
          : undefined,
      )
    })
  }
  // A click inside the layer (the note button, the composer, the panel)
  // is not a change of selection.
  document.addEventListener("mouseup", (event) => {
    if (ui.root.contains(event.target as Node)) return
    setTimeout(onSelection, 0)
  })
  document.addEventListener("keyup", (event) => {
    if (event.shiftKey || event.key.startsWith("Arrow"))
      setTimeout(onSelection, 0)
  })

  // Hovered block → gutter "+" → composer. The button sits in the margin
  // outside `main`, so the pointer is followed instead of relying on
  // `main`'s leave event, which fires the moment the pointer heads for it.
  let hovered: Element | undefined
  const leaveBlock = () => {
    hovered = undefined
    ui.hideBlockButton()
  }
  main.addEventListener("mouseover", (event) => {
    const block = closestBlock(event.target as Node)
    if (!block || block === hovered) return
    hovered = block
    ui.showBlockButton(block, () => {
      const described = describeBlock(index, block)
      if (!described) return
      ui.hideBlockButton()
      ui.composer.open(
        block.getBoundingClientRect(),
        "",
        (body) => add(described, body, "block"),
        excerptOf(described),
      )
    })
  })
  document.addEventListener("mousemove", (event) => {
    if (!hovered) return
    if (ui.onBlockButton(event.clientX, event.clientY)) return
    const rect = hovered.getBoundingClientRect()
    const near =
      event.clientX >= rect.left - GUTTER_REACH &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top - 12 &&
      event.clientY <= rect.bottom + 12
    if (!near) leaveBlock()
  })
  // Fixed-position pieces drift from their anchors when the page moves:
  // the "+" hides, the note button follows its selection or hides.
  window.addEventListener(
    "scroll",
    () => {
      leaveBlock()
      if (pending) onSelection()
    },
    { passive: true },
  )
  window.addEventListener("resize", () => {
    leaveBlock()
    ui.hideNoteButton()
  })

  // A click on painted text selects the note under it.
  main.addEventListener("click", (event) => {
    if (!anchors.size) return
    const offset = offsetAtPoint(index, event.clientX, event.clientY)
    if (offset < 0) return
    const hit = roots().find((note) => {
      const anchor = anchors.get(note.id)
      return (
        anchor &&
        anchor.kind !== "orphan" &&
        anchor.start <= offset &&
        offset < anchor.end
      )
    })
    if (hit) {
      active = hit.id
      ui.setOpen(true)
      refresh()
    }
  })

  window.addEventListener("beforeprint", () => {
    if (highlightsSupported) CSS.highlights.clear()
  })
  window.addEventListener("afterprint", paint)

  // Notes travel in: the embedded block first, then this browser's copy.
  items = mergeAnnotations(readEmbedded(), readLocal(key))
  refresh()

  // A token in the address is offered, never applied on its own. A token
  // pasted into the address of an open page arrives as a hash change.
  const offerToken = () => {
    const token = tokenFromLocation()
    if (!token) return
    decodeToken(token)
      .then((loaded) => {
        ui.confirmToken(
          loaded.items.length,
          () => {
            items = mergeAnnotations(items, loaded.items)
            refresh()
            ui.setOpen(true)
            clearTokenFromLocation()
          },
          () => clearTokenFromLocation(),
        )
      })
      .catch((error: unknown) => {
        ui.notify(
          t.tokenInvalid(
            error instanceof Error ? error.message : String(error),
          ),
        )
        clearTokenFromLocation()
      })
  }
  offerToken()
  window.addEventListener("hashchange", offerToken)

  // For automation: what the buttons do, callable from a script.
  window.cudocAnnotations = {
    create: (exact, body) => {
      const at = index.text.indexOf(exact)
      if (at < 0) return undefined
      const described = describeSpan(
        index,
        at,
        at + exact.length,
        blockAt(index, at),
      )
      return described ? add(described, body, "text") : undefined
    },
    createOnBlock: (blockId, body) => {
      const block = main.querySelector(
        `[data-cudoc-block="${CSS.escape(blockId)}"]`,
      )
      const described = block ? describeBlock(index, block) : undefined
      return described ? add(described, body, "block") : undefined
    },
    reply,
    list: () => items.map((a) => structuredClone(a)),
    anchors: () =>
      Object.fromEntries(
        [...anchors].map(([id, anchor]) => [
          id,
          anchor.kind === "orphan"
            ? "orphan"
            : anchor.confidence === "moved"
              ? "moved"
              : anchor.kind,
        ]),
      ),
    load: (text) => {
      const loaded = text.trimStart().startsWith("<")
        ? readAnnotatedHtml(text)
        : parseText(text)
      items = mergeAnnotations(items, loaded.items)
      refresh()
      return loaded.items.length
    },
    collection: () => collection(items, generator),
    embeddedCopy: () => embeddedCopy(items, generator, UI_ID),
    token: () => encodeToken(items, generator),
  }
}

const excerptOf = (described: Described): string => {
  const quote = described.selectors.find((s) => s.type === "TextQuoteSelector")
  const text = (quote && quote.type === "TextQuoteSelector" ? quote.exact : "")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text
}

/** The text offset under a point, or -1. */
function offsetAtPoint(index: TextIndex, x: number, y: number): number {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y)
    return position ? offsetOf(index, position.offsetNode, position.offset) : -1
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y)
    return range ? offsetOf(index, range.startContainer, range.startOffset) : -1
  }
  return -1
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start)
else start()
