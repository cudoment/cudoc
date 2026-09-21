/**
 * The review-note layer: a toggle, a side panel, a floating "note" button, a
 * gutter button on the hovered block, a composer and a few messages. Every
 * piece of text a reader or a file supplies goes through `textContent`;
 * nothing here parses HTML.
 */

import type { Annotation } from "../annotations/model.js"
import type { Anchor } from "./dom-text.js"

export const UI_ID = "cudoc-annotations"

export type Lang = "ko" | "en"
export const LANGS: readonly Lang[] = ["en", "ko"]

/** Whether the open panel covers the page or the page makes room for it. */
export type Layout = "push" | "overlay"

export const STRINGS = {
  ko: {
    toggle: "메모",
    panelTitle: "메모",
    note: "메모",
    noteOn: "메모 대상",
    writeNote: "메모를 입력하세요…",
    blockNote: "이 블록 전체에 메모",
    author: "작성자 이름",
    authorHint: "선택 사항이며 메모 파일에 기록됩니다.",
    body: "메모 내용",
    save: "저장",
    cancel: "취소",
    copyToken: "공유 토큰 복사",
    tokenWarning: "토큰에는 메모 본문과 이름이 그대로 들어 있습니다.",
    tokenReady:
      "아래 토큰을 복사해 전달하세요. 받는 쪽은 자기 사본의 주소 끝에 붙여 열거나 cudoc-export annotations --token 에 넘길 수 있습니다.",
    tokenCopied: "토큰을 복사했습니다.",
    tokenTooLong:
      "토큰이 매우 깁니다. 대신 JSON 파일을 전달하는 쪽이 안전합니다.",
    clearStorage: "저장된 메모 모두 지우기",
    cleared:
      "이 브라우저에 저장된 메모를 지웠습니다. 파일로 내려받은 메모는 그대로입니다.",
    more: "더 보기",
    download: "메모 내려받기 (JSON)",
    saveCopy: "메모 내장 사본 저장",
    saveCopyHint:
      "사본은 원본과 같은 폴더에 두어야 스타일과 메모 기능이 열립니다.",
    importFile: "메모 불러오기 (.json, .html)",
    imported: (n: number) => `메모 ${n}개를 불러왔습니다.`,
    importFailed: (why: string) => `불러오지 못했습니다: ${why}`,
    storageOff:
      "이 브라우저는 로컬 파일의 저장을 허용하지 않습니다. 떠나기 전에 메모를 내려받으세요.",
    empty: "아직 메모가 없습니다. 글자를 선택하거나 블록 왼쪽의 + 를 누르세요.",
    others: (n: number) =>
      `다른 문서의 메모 ${n}개는 이 페이지에 표시하지 않지만 내려받기에는 포함됩니다.`,
    stale: "이 메모는 문서의 다른 버전에서 작성되었습니다.",
    staleBanner:
      "메모 일부가 이 문서의 다른 버전에서 작성되었습니다. 위치가 어긋났을 수 있습니다.",
    orphan: "위치를 찾지 못함",
    moved: "위치 불확실",
    block: "블록",
    resolved: "해결됨",
    open: "열림",
    resolve: "해결",
    reopen: "다시 열기",
    edit: "수정",
    remove: "삭제",
    reply: "답글",
    goTo: "이동",
    tokenPrompt: (n: number) =>
      `이 주소에는 검증되지 않은 메모 ${n}개가 들어 있습니다. 불러올까요?`,
    tokenSource: "출처: 링크, 검증되지 않음",
    accept: "불러오기",
    reject: "무시",
    tokenInvalid: (why: string) => `주소의 메모를 읽지 못했습니다: ${why}`,
    close: "닫기",
    quote: "인용",
    language: "언어",
    layout: "패널 배치",
    layoutPush: "본문을 좁힘",
    layoutOverlay: "본문 위에 겹침",
  },
  en: {
    toggle: "Notes",
    panelTitle: "Notes",
    note: "Note",
    noteOn: "Note on",
    writeNote: "Write a note…",
    blockNote: "Note on this whole block",
    author: "Your name",
    authorHint: "Optional; written into the notes file.",
    body: "Note text",
    save: "Save",
    cancel: "Cancel",
    copyToken: "Copy share token",
    tokenWarning: "The token carries the note text and names as they are.",
    tokenReady:
      "Copy the token below and pass it on. The recipient appends it to the address of their own copy, or gives it to cudoc-export annotations --token.",
    tokenCopied: "Token copied.",
    tokenTooLong:
      "The token is very long. A JSON file is the safer way to hand these over.",
    clearStorage: "Clear all stored notes",
    cleared:
      "Cleared the notes this browser stored. Downloaded files are untouched.",
    more: "More",
    download: "Download notes (JSON)",
    saveCopy: "Save a copy with notes",
    saveCopyHint:
      "Keep the copy in the same folder as the original so its styles and notes load.",
    importFile: "Load notes (.json, .html)",
    imported: (n: number) => `Loaded ${n} notes.`,
    importFailed: (why: string) => `Could not load: ${why}`,
    storageOff:
      "This browser does not let a local file store anything. Download your notes before leaving.",
    empty: "No notes yet. Select text, or press + beside a block.",
    others: (n: number) =>
      `${n} notes on other documents are not shown here but are included in the download.`,
    stale: "This note was written on a different version of the document.",
    staleBanner:
      "Some notes were written on a different version of this document; their positions may be off.",
    orphan: "Not found",
    moved: "Position uncertain",
    block: "Block",
    resolved: "Resolved",
    open: "Open",
    resolve: "Resolve",
    reopen: "Reopen",
    edit: "Edit",
    remove: "Delete",
    reply: "Reply",
    goTo: "Go to",
    tokenPrompt: (n: number) =>
      `This address carries ${n} unverified notes. Load them?`,
    tokenSource: "Source: link, unverified",
    accept: "Load",
    reject: "Ignore",
    tokenInvalid: (why: string) =>
      `Could not read the notes in the address: ${why}`,
    close: "Close",
    quote: "Quote",
    language: "Language",
    layout: "Panel placement",
    layoutPush: "Narrow the page",
    layoutOverlay: "Cover the page",
  },
} as const

const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", ko: "한국어" }

export type Strings = (typeof STRINGS)[Lang]

type Props = {
  className?: string
  text?: string
  title?: string
  type?: string
  hidden?: boolean
  attrs?: Record<string, string>
}

/** Builds an element; text goes in as a text node, never as markup. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (props.className) element.className = props.className
  if (props.title) element.title = props.title
  if (props.type) element.setAttribute("type", props.type)
  if (props.hidden) element.hidden = true
  for (const [name, value] of Object.entries(props.attrs ?? {}))
    element.setAttribute(name, value)
  if (props.text !== undefined) element.textContent = props.text
  for (const child of children)
    element.append(
      typeof child === "string" ? document.createTextNode(child) : child,
    )
  return element
}

/** Stroke paths on a 24-unit grid, one icon per action. */
const ICONS = {
  bubble: ["M4 4h16v11H9l-5 4z"],
  plus: ["M12 5v14", "M5 12h14"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  push: ["M3 5h18v14H3z", "M15 5v14"],
  overlay: ["M3 5h12v10H3z", "M9 9h12v10H9z"],
  link: [
    "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5",
    "M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5",
  ],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
  download: ["M12 4v12", "M7 11l5 5 5-5", "M4 20h16"],
  copy: ["M6 3h9l4 4v14H6z", "M15 3v4h4", "M9 13h6", "M9 17h6"],
  upload: ["M12 20V8", "M7 13l5-5 5 5", "M4 4h16"],
  goto: ["M5 12h14", "M13 6l6 6-6 6"],
  reply: ["M9 17l-5-5 5-5", "M4 12h9a6 6 0 0 1 6 6v1"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"],
  check: ["M5 12l5 5L20 7"],
  reopen: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
} as const

type IconName = keyof typeof ICONS

/** An icon built as DOM rather than parsed from markup. */
function icon(name: IconName): SVGElement {
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  for (const d of ICONS[name]) {
    const path = document.createElementNS(NS, "path")
    path.setAttribute("d", d)
    svg.append(path)
  }
  return svg
}

export type NoteView = {
  note: Annotation
  anchor: Anchor
  replies: Annotation[]
  stale: boolean
}

export type View = {
  notes: NoteView[]
  others: number
  stale: boolean
  storage: boolean
  author: string
  active?: string
}

export type Handlers = {
  onAuthor: (name: string) => void
  onDownload: () => void
  onSaveCopy: () => void
  onToken: () => void
  onImport: (file: File) => void
  onClearStorage: () => void
  onSelect: (id: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onToggleState: (id: string) => void
  onReply: (id: string, body: string) => void
  onLanguage: (lang: Lang) => void
  onLayout: (layout: Layout) => void
}

export type Composer = {
  open: (
    rect: DOMRect,
    initial: string,
    onSave: (body: string) => void,
    label?: string,
  ) => void
  close: () => void
}

const PUSH_CLASS = "cudoc-ann-push"
const COMPOSER_WIDTH = 352

export class Ui {
  readonly root: HTMLElement
  private readonly panel: HTMLElement
  private readonly list: HTMLElement
  private readonly toggle: HTMLButtonElement
  private readonly count: HTMLElement
  private readonly noteButton: HTMLButtonElement
  private readonly blockButton: HTMLButtonElement
  private readonly message: HTMLElement
  private readonly banner: HTMLElement
  private readonly tokenBar: HTMLElement
  private readonly tokenBox: HTMLElement
  private readonly authorInput: HTMLInputElement
  private readonly layoutButton: HTMLButtonElement
  private readonly composerRoot: HTMLElement
  private readonly composerText: HTMLTextAreaElement
  private readonly composerEyebrow: HTMLElement
  private readonly composerQuote: HTMLElement
  private composerSave: ((body: string) => void) | undefined
  private messageTimer: number | undefined
  private opened = false
  private layout: Layout

  constructor(
    private readonly t: Strings,
    lang: Lang,
    layout: Layout,
    private readonly handlers: Handlers,
  ) {
    this.layout = layout

    // Every control is one of these three shapes, so the panel reads as one
    // toolbar rather than a collection of differently sized buttons.
    const button = (
      text: string,
      className: string,
      onClick: () => void,
      options: { icon?: IconName; title?: string } = {},
    ) => {
      const el = h("button", {
        className: `cudoc-ann-button ${className}`,
        type: "button",
        title: options.title,
      })
      if (options.icon) el.append(icon(options.icon))
      el.append(document.createTextNode(text))
      el.addEventListener("click", onClick)
      return el
    }
    const iconButton = (
      name: IconName,
      label: string,
      className: string,
      onClick: () => void,
    ) => {
      const el = h("button", {
        className: `cudoc-ann-button cudoc-ann-icon ${className}`,
        type: "button",
        title: label,
        attrs: { "aria-label": label },
      })
      el.append(icon(name))
      el.addEventListener("click", onClick)
      return el
    }

    this.count = h("span", { className: "cudoc-ann-count", hidden: true })
    this.toggle = h(
      "button",
      {
        className: "cudoc-ann-toggle",
        type: "button",
        title: t.toggle,
        attrs: {
          "aria-label": t.toggle,
          "aria-expanded": "false",
          "aria-controls": `${UI_ID}-panel`,
        },
      },
      [icon("bubble"), this.count],
    )
    this.toggle.addEventListener("click", () => this.setOpen(!this.opened))

    // The name is written into every note made from now on; it is read on
    // every keystroke so a half-typed name is never lost to a re-render.
    this.authorInput = h("input", {
      className: "cudoc-ann-author",
      type: "text",
      attrs: {
        id: `${UI_ID}-author`,
        placeholder: t.author,
        maxlength: "200",
        autocomplete: "name",
      },
    })
    this.authorInput.addEventListener("input", () =>
      handlers.onAuthor(this.authorInput.value.trim()),
    )
    const authorField = h("div", { className: "cudoc-ann-field" }, [
      h("label", { text: t.author, attrs: { for: `${UI_ID}-author` } }),
      this.authorInput,
      h("small", { text: t.authorHint }),
    ])

    const fileInput = h("input", {
      type: "file",
      className: "cudoc-ann-file",
      attrs: { accept: ".json,.html,application/json,text/html" },
    })
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0]
      if (file) handlers.onImport(file)
      fileInput.value = ""
    })
    const importLabel = h(
      "label",
      { className: "cudoc-ann-button cudoc-ann-import" },
      [icon("upload"), t.importFile, fileInput],
    )

    this.tokenBox = h("div", { className: "cudoc-ann-token", hidden: true })
    // The two actions a reader reaches for sit in front; the file actions
    // stay one click away, because a large set of notes travels as a file.
    const actions = h("div", { className: "cudoc-ann-actions" }, [
      button(t.copyToken, "cudoc-ann-tokenbutton", handlers.onToken, {
        icon: "link",
        title: t.tokenWarning,
      }),
      button(t.clearStorage, "cudoc-ann-clear", handlers.onClearStorage, {
        icon: "trash",
      }),
    ])
    const more = h("details", { className: "cudoc-ann-more" }, [
      h("summary", { text: t.more }),
      h("div", { className: "cudoc-ann-actions" }, [
        button(t.download, "cudoc-ann-download", handlers.onDownload, {
          icon: "download",
        }),
        button(t.saveCopy, "cudoc-ann-copy", handlers.onSaveCopy, {
          icon: "copy",
          title: t.saveCopyHint,
        }),
        importLabel,
      ]),
    ])

    const languageSelect = h("select", {
      className: "cudoc-ann-lang",
      attrs: { "aria-label": t.language, title: t.language },
    })
    for (const code of LANGS) {
      const option = h("option", { text: LANGUAGE_NAMES[code] })
      option.value = code
      option.selected = code === lang
      languageSelect.append(option)
    }
    languageSelect.addEventListener("change", () =>
      handlers.onLanguage(languageSelect.value as Lang),
    )
    this.layoutButton = iconButton("push", t.layout, "cudoc-ann-layout", () => {
      this.setLayout(this.layout === "push" ? "overlay" : "push")
      handlers.onLayout(this.layout)
    })
    const close = iconButton("close", t.close, "cudoc-ann-close", () =>
      this.setOpen(false),
    )

    this.banner = h("p", { className: "cudoc-ann-banner", hidden: true })
    this.list = h("ol", { className: "cudoc-ann-list" })
    this.panel = h(
      "section",
      {
        className: "cudoc-ann-panel",
        hidden: true,
        attrs: { id: `${UI_ID}-panel`, "aria-label": t.panelTitle },
      },
      [
        h("div", { className: "cudoc-ann-head" }, [
          h("h2", { className: "cudoc-ann-title", text: t.panelTitle }),
          h("div", { className: "cudoc-ann-tools" }, [
            languageSelect,
            this.layoutButton,
            close,
          ]),
        ]),
        authorField,
        actions,
        more,
        this.tokenBox,
        this.banner,
        this.list,
      ],
    )

    this.noteButton = h(
      "button",
      {
        className: "cudoc-ann-button cudoc-ann-float",
        type: "button",
        hidden: true,
      },
      [icon("bubble"), t.note],
    )
    this.blockButton = h(
      "button",
      {
        className: "cudoc-ann-button cudoc-ann-icon cudoc-ann-gutter",
        type: "button",
        title: t.blockNote,
        hidden: true,
        attrs: { "aria-label": t.blockNote },
      },
      [icon("plus")],
    )
    this.message = h("p", {
      className: "cudoc-ann-message",
      hidden: true,
      attrs: { role: "status" },
    })
    this.tokenBar = h("div", {
      className: "cudoc-ann-tokenbar",
      hidden: true,
      attrs: { role: "dialog" },
    })

    this.composerText = h("textarea", {
      className: "cudoc-ann-text",
      attrs: {
        rows: "4",
        "aria-label": t.body,
        placeholder: t.writeNote,
        maxlength: "10240",
      },
    })
    this.composerEyebrow = h("p", {
      className: "cudoc-ann-eyebrow",
      text: t.noteOn,
    })
    this.composerQuote = h("blockquote", { className: "cudoc-ann-quote" })
    this.composerRoot = h(
      "div",
      {
        className: "cudoc-ann-composer",
        hidden: true,
        attrs: { role: "dialog", "aria-label": t.note },
      },
      [
        this.composerEyebrow,
        this.composerQuote,
        this.composerText,
        h("div", { className: "cudoc-ann-row cudoc-ann-end" }, [
          button(t.cancel, "cudoc-ann-cancel", () => this.closeComposer()),
          button(t.save, "cudoc-ann-primary", () => this.saveComposer()),
        ]),
      ],
    )
    this.composerText.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeComposer()
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
        this.saveComposer()
    })

    this.root = h("div", { className: "cudoc-ann", attrs: { id: UI_ID } }, [
      this.tokenBar,
      this.toggle,
      this.panel,
      this.noteButton,
      this.blockButton,
      this.composerRoot,
      this.message,
    ])
    this.root.addEventListener("dragover", (event) => event.preventDefault())
    this.root.addEventListener("drop", (event) => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (file) handlers.onImport(file)
    })
    this.setLayout(layout)
  }

  get isOpen(): boolean {
    return this.opened
  }

  setOpen(open: boolean): void {
    this.opened = open
    this.panel.hidden = !open
    this.toggle.setAttribute("aria-expanded", String(open))
    this.applyLayout()
    // The page may have moved under them.
    this.hideNoteButton()
    this.hideBlockButton()
  }

  get composerOpen(): boolean {
    return !this.composerRoot.hidden
  }

  /** The right edge floating pieces may reach: the open panel's left side. */
  private rightLimit(): number {
    return this.opened && this.layout === "overlay"
      ? this.panel.getBoundingClientRect().left
      : window.innerWidth
  }

  /** Push mode makes the page narrower while the panel is open. */
  setLayout(layout: Layout): void {
    this.layout = layout
    const t = this.t
    const label = `${t.layout}: ${layout === "push" ? t.layoutPush : t.layoutOverlay}`
    this.layoutButton.replaceChildren(
      icon(layout === "push" ? "push" : "overlay"),
    )
    this.layoutButton.title = label
    this.layoutButton.setAttribute("aria-label", label)
    this.applyLayout()
  }

  private applyLayout(): void {
    document.documentElement.classList.toggle(
      PUSH_CLASS,
      this.opened && this.layout === "push",
    )
  }

  /** Removes the layer and its effect on the page, before a rebuild. */
  destroy(): void {
    document.documentElement.classList.remove(PUSH_CLASS)
    this.root.remove()
  }

  /** The floating button next to a selection. */
  showNoteButton(rect: DOMRect, onClick: () => void): void {
    this.noteButton.hidden = false
    this.noteButton.style.left = `${Math.max(8, Math.min(rect.right, this.rightLimit() - 104))}px`
    this.noteButton.style.top = `${rect.bottom + 6}px`
    this.noteButton.onclick = onClick
  }

  hideNoteButton(): void {
    this.noteButton.hidden = true
  }

  /**
   * The "+" in the gutter of the hovered block, centred on its first line of
   * text rather than on the box edge, so it reads as belonging to the text.
   */
  showBlockButton(block: Element, onClick: () => void): void {
    const rect = block.getBoundingClientRect()
    const probe = block.matches("tr")
      ? (block.querySelector("th, td") ?? block)
      : block
    const style = getComputedStyle(probe)
    const line =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 24
    const inset =
      (parseFloat(style.borderTopWidth) || 0) +
      (parseFloat(style.paddingTop) || 0)
    this.blockButton.hidden = false
    const size = this.blockButton.offsetHeight || 24
    this.blockButton.style.left = `${Math.max(4, rect.left - size - 8)}px`
    this.blockButton.style.top = `${rect.top + inset + (line - size) / 2}px`
    this.blockButton.onclick = onClick
  }

  hideBlockButton(): void {
    this.blockButton.hidden = true
  }

  /** Whether a point lies on the gutter button. */
  onBlockButton(x: number, y: number): boolean {
    if (this.blockButton.hidden) return false
    const rect = this.blockButton.getBoundingClientRect()
    return (
      x >= rect.left - 4 &&
      x <= rect.right + 4 &&
      y >= rect.top - 4 &&
      y <= rect.bottom + 4
    )
  }

  get composer(): Composer {
    return {
      open: (rect, initial, onSave, label) => {
        this.composerSave = onSave
        this.composerText.value = initial
        this.composerQuote.textContent = label ?? ""
        this.composerQuote.hidden = !label
        this.composerEyebrow.hidden = !label
        this.composerRoot.hidden = false
        this.composerRoot.style.left = `${Math.max(8, Math.min(rect.left, this.rightLimit() - COMPOSER_WIDTH - 8))}px`
        this.composerRoot.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 240))}px`
        this.composerText.focus()
      },
      close: () => this.closeComposer(),
    }
  }

  private saveComposer(): void {
    const body = this.composerText.value.trim()
    const save = this.composerSave
    this.closeComposer()
    if (save) save(body)
  }

  private closeComposer(): void {
    this.composerRoot.hidden = true
    this.composerSave = undefined
    // The selection the note was about has served its purpose; leaving it
    // would bring the note button straight back.
    this.hideNoteButton()
    this.hideBlockButton()
    document.getSelection()?.removeAllRanges()
  }

  notify(text: string): void {
    this.message.textContent = text
    this.message.hidden = false
    if (this.messageTimer) window.clearTimeout(this.messageTimer)
    this.messageTimer = window.setTimeout(() => {
      this.message.hidden = true
    }, 4000)
  }

  /** A token to copy by hand, shown until the panel is next re-rendered. */
  showToken(text: string, hint: string): void {
    this.tokenBox.replaceChildren(
      h("p", { text: hint }),
      h("textarea", {
        className: "cudoc-ann-tokentext",
        attrs: { readonly: "", rows: "3", "aria-label": this.t.copyToken },
        text,
      }),
    )
    this.tokenBox.hidden = false
    this.setOpen(true)
  }

  /** The bar asking whether to load notes found in the address. */
  confirmToken(
    count: number,
    onAccept: () => void,
    onReject: () => void,
  ): void {
    const accept = h("button", {
      className: "cudoc-ann-button cudoc-ann-primary",
      type: "button",
      text: this.t.accept,
    })
    const reject = h("button", {
      className: "cudoc-ann-button",
      type: "button",
      text: this.t.reject,
    })
    accept.addEventListener("click", () => {
      this.tokenBar.hidden = true
      onAccept()
    })
    reject.addEventListener("click", () => {
      this.tokenBar.hidden = true
      onReject()
    })
    this.tokenBar.replaceChildren(
      h("p", { text: this.t.tokenPrompt(count) }),
      h("p", { className: "cudoc-ann-source", text: this.t.tokenSource }),
      h("div", { className: "cudoc-ann-row" }, [accept, reject]),
    )
    this.tokenBar.hidden = false
  }

  render(view: View): void {
    const t = this.t
    this.count.hidden = view.notes.length === 0
    this.count.textContent = String(view.notes.length)
    this.toggle.setAttribute(
      "aria-label",
      view.notes.length ? `${t.toggle} (${view.notes.length})` : t.toggle,
    )
    if (
      document.activeElement !== this.authorInput &&
      this.authorInput.value !== view.author
    )
      this.authorInput.value = view.author
    this.tokenBox.hidden = true
    const banners: string[] = []
    if (!view.storage) banners.push(t.storageOff)
    if (view.stale) banners.push(t.staleBanner)
    this.banner.hidden = banners.length === 0
    this.banner.textContent = banners.join(" ")
    const items: HTMLElement[] = []
    if (!view.notes.length)
      items.push(h("li", { className: "cudoc-ann-empty", text: t.empty }))
    for (const entry of view.notes)
      items.push(this.renderNote(entry, view.active))
    if (view.others)
      items.push(
        h("li", { className: "cudoc-ann-others", text: t.others(view.others) }),
      )
    this.list.replaceChildren(...items)
  }

  private renderNote(entry: NoteView, active?: string): HTMLElement {
    const t = this.t
    const { note, anchor, replies } = entry
    const state = note.cudoc.state
    const quote = note.target.selector.find(
      (s) => s.type === "TextQuoteSelector",
    )
    const pill = (text: string, tone?: "open" | "warn") =>
      h("span", {
        className: `cudoc-ann-pill${tone ? ` cudoc-ann-pill-${tone}` : ""}`,
        text,
      })
    const badges = h("span", { className: "cudoc-ann-badges" }, [
      state === "resolved" ? pill(t.resolved) : pill(t.open, "open"),
    ])
    if (note.cudoc.scope === "block") badges.append(pill(t.block))
    if (anchor.kind === "orphan") badges.append(pill(t.orphan, "warn"))
    else if (anchor.confidence === "moved") badges.append(pill(t.moved, "warn"))
    const item = h("li", {
      className: `cudoc-ann-item${note.id === active ? " cudoc-ann-active" : ""}${state === "resolved" ? " cudoc-ann-resolved" : ""}`,
      attrs: { "data-id": note.id },
    })
    item.append(
      h("div", { className: "cudoc-ann-meta" }, [
        badges,
        h("span", {
          className: "cudoc-ann-who",
          text: describeAuthor(note),
          title: describeAuthor(note),
        }),
      ]),
    )
    if (entry.stale)
      item.append(h("p", { className: "cudoc-ann-stale", text: t.stale }))
    if (quote && quote.type === "TextQuoteSelector")
      item.append(
        h("blockquote", {
          className: "cudoc-ann-excerpt",
          text: excerpt(quote.exact),
          title: t.quote,
        }),
      )
    item.append(h("p", { className: "cudoc-ann-body", text: bodyOf(note) }))
    for (const reply of replies)
      item.append(
        h("div", { className: "cudoc-ann-reply" }, [
          h("span", {
            className: "cudoc-ann-who",
            text: describeAuthor(reply),
          }),
          h("p", { className: "cudoc-ann-body", text: bodyOf(reply) }),
        ]),
      )
    const action = (name: IconName, label: string, onClick: () => void) => {
      const button = h("button", {
        className: "cudoc-ann-button cudoc-ann-icon cudoc-ann-ghost",
        type: "button",
        title: label,
        attrs: { "aria-label": label },
      })
      button.append(icon(name))
      button.addEventListener("click", (event) => {
        event.stopPropagation()
        onClick()
      })
      return button
    }
    const tools = h("div", { className: "cudoc-ann-tools cudoc-ann-itemtools" })
    if (anchor.kind !== "orphan")
      tools.append(
        action("goto", t.goTo, () => this.handlers.onSelect(note.id)),
      )
    tools.append(
      action("reply", t.reply, () =>
        this.inlineEditor(item, "", (body) =>
          this.handlers.onReply(note.id, body),
        ),
      ),
      action("edit", t.edit, () =>
        this.inlineEditor(item, bodyOf(note), (body) =>
          this.handlers.onEdit(note.id, body),
        ),
      ),
      state === "resolved"
        ? action("reopen", t.reopen, () => this.handlers.onToggleState(note.id))
        : action("check", t.resolve, () =>
            this.handlers.onToggleState(note.id),
          ),
      action("trash", t.remove, () => this.handlers.onDelete(note.id)),
    )
    item.append(tools)
    item.addEventListener("click", () => {
      if (anchor.kind !== "orphan") this.handlers.onSelect(note.id)
    })
    return item
  }

  /** A textarea inside a list item, for edits and replies. */
  private inlineEditor(
    item: HTMLElement,
    initial: string,
    onSave: (body: string) => void,
  ): void {
    item.querySelector(".cudoc-ann-inline")?.remove()
    const text = h("textarea", {
      className: "cudoc-ann-text",
      attrs: {
        rows: "3",
        "aria-label": this.t.body,
        placeholder: this.t.writeNote,
        maxlength: "10240",
      },
    })
    text.value = initial
    const save = h("button", {
      className: "cudoc-ann-button cudoc-ann-primary",
      type: "button",
      text: this.t.save,
    })
    const cancel = h("button", {
      className: "cudoc-ann-button",
      type: "button",
      text: this.t.cancel,
    })
    const editor = h("div", { className: "cudoc-ann-inline" }, [
      text,
      h("div", { className: "cudoc-ann-row cudoc-ann-end" }, [cancel, save]),
    ])
    editor.addEventListener("click", (event) => event.stopPropagation())
    save.addEventListener("click", () => {
      const body = text.value.trim()
      editor.remove()
      if (body) onSave(body)
    })
    cancel.addEventListener("click", () => editor.remove())
    item.append(editor)
    text.focus()
  }
}

const bodyOf = (note: Annotation): string =>
  note.body.map((b) => b.value).join("\n")

/** "Name · 2026-09-17 09:12Z": the minute is enough to order a thread. */
const describeAuthor = (note: Annotation): string => {
  const when = `${note.modified.slice(0, 16).replace("T", " ")}Z`
  return note.creator ? `${note.creator.name} · ${when}` : when
}

/** One line of the quoted text: block boundaries become spaces. */
const excerpt = (raw: string): string => {
  const text = raw.replace(/\s+/g, " ").trim()
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text
}
