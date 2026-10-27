/**
 * Markup a document needs on screen and nowhere else.
 *
 * Normalization leaves a tree of what the document means: a code block with
 * a title, and later a group of tabs. How that looks depends on who draws
 * it. A host with a title of its own for code (Docusaurus, Nextra, the
 * `docs` profile) is handed the title in its own meta; every other renderer
 * gets a frame with the title above the block. The frame is marked
 * `presentation`, and `withoutPresentation` takes it off again, so a
 * collected library, a dataset and an export hold the meaning only.
 */

import type { Root } from "mdast"
import type { DocumentNode, Host } from "./document.js"
import {
  codeMetaRest,
  formatLineRanges,
  tabData,
  tabsData,
} from "./internal/markers.js"

/**
 * A site's own components for a group of tabs and for one tab, by name or
 * by name and the props they take each value as. The defaults are `group`
 * on the group, and `id`, `label` and `default` on a tab.
 */
export type TabElements = {
  tabs: string | { name: string; group?: string }
  tab:
    string | { name: string; value?: string; label?: string; default?: string }
}

export type PresentationTarget = {
  /** The host the page is drawn by, which decides what it draws itself. */
  host: Host
  /** The page's format, where the host draws the two differently. */
  format?: "md" | "mdx"
  /**
   * Draw tabs with the site's components, on an MDX host; `false` draws
   * cudoc's own tabs. The `docs` host defaults to `Tabs` and `TabsContent`.
   */
  tabElements?: TabElements | false
}

/** The tab components a host draws with unless told otherwise. */
const HOST_TAB_ELEMENTS: Partial<Record<Host, TabElements>> = {
  docs: { tabs: "Tabs", tab: "TabsContent" },
}

/**
 * The component a host draws each paragraph of a table note with, where
 * its own table notes are a component: the `docs` profile's `Footnote`.
 */
const HOST_NOTE_ELEMENTS: Partial<Record<Host, string>> = {
  docs: "Footnote",
}

const COMPONENT_NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/

/** Validates `tabElements`, throwing for anything a page could not name. */
export function resolveTabElements(
  value: unknown,
): TabElements | false | undefined {
  if (value === undefined || value === false) return value
  const valid = (entry: unknown, props: string[]) =>
    typeof entry === "string"
      ? COMPONENT_NAME.test(entry)
      : !!entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        Object.entries(entry).every(([key, name]) =>
          key === "name"
            ? typeof name === "string" && COMPONENT_NAME.test(name)
            : props.includes(key) &&
              typeof name === "string" &&
              /^[A-Za-z_][\w-]*$/.test(name),
        ) &&
        "name" in entry
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "tabs" && key !== "tab") ||
    !valid((value as TabElements).tabs, ["group"]) ||
    !valid((value as TabElements).tab, ["value", "label", "default"])
  )
    throw new TypeError(
      "cudoc: tabElements must name a component for tabs and for tab, each a name or { name, ...props }",
    )
  return value as TabElements
}

/** The meta key a host reads a code block's title from, where it has one. */
const NATIVE_TITLE: Partial<Record<Host, string>> = {
  docusaurus: "title",
  nextra: "filename",
  docs: "filename",
}

/**
 * How a host's own code component reads its meta, where it differs from a
 * space-separated list with quoted values: the `docs` profile splits the
 * meta at commas and each entry at `=`, and shows a quote as written.
 */
const META_STYLE: Partial<Record<Host, { separator: ","; quote: boolean }>> = {
  docs: { separator: ",", quote: false },
}

/**
 * Where the target reads a code block's title from its meta. Nextra runs a
 * `.md` page through rehype-raw, which drops every code block's meta, so
 * such a page is given a frame like any host without a title.
 */
const nativeTitle = (target: PresentationTarget) =>
  target.host === "nextra" && target.format === "md"
    ? undefined
    : NATIVE_TITLE[target.host]

const isPresentation = (node: DocumentNode) =>
  node.data?.cudoc?.presentation === true

/** A code block under a title, for a renderer with no title of its own. */
const codeFrame = (title: string, code: DocumentNode): DocumentNode => ({
  type: "blockquote",
  data: {
    hName: "div",
    hProperties: { className: ["cudoc-code"] },
    cudoc: { kind: "codeFrame", presentation: true },
  },
  children: [
    {
      type: "paragraph",
      data: {
        hName: "div",
        hProperties: { className: ["cudoc-code-title"] },
        cudoc: { kind: "codeTitle", presentation: true },
      },
      children: [{ type: "text", value: title }],
    },
    code,
  ],
})

/** A group of tabs drawn by the site's own components. */
const tabsAsElements = (group: DocumentNode, elements: TabElements) => {
  const own =
    typeof elements.tabs === "string" ? { name: elements.tabs } : elements.tabs
  const each =
    typeof elements.tab === "string" ? { name: elements.tab } : elements.tab
  const key = group.data!.cudoc!.group
  group.data = {
    ...group.data,
    hName: own.name,
    hProperties: key ? { [own.group ?? "group"]: key } : {},
    cudoc: { ...group.data!.cudoc!, presentation: true },
  }
  for (const member of group.children ?? []) {
    const cudoc = member.data!.cudoc!
    member.data = {
      ...member.data,
      hName: each.name,
      hProperties: {
        [each.value ?? "id"]: cudoc.value,
        [each.label ?? "label"]: cudoc.title,
        ...(cudoc.default ? { [each.default ?? "default"]: true } : {}),
      },
    }
  }
}

/**
 * A group of tabs as radio buttons the stylesheet turns into tabs, with no
 * script: a radio and its label before each tab. No radio is checked to
 * begin with, which React would hold fixed; the stylesheet shows the
 * default tab until one is.
 */
const tabsAsRadios = (group: DocumentNode, name: string) => {
  const members = group.children ?? []
  const chosen = Math.max(
    0,
    members.findIndex((member) => member.data?.cudoc?.default),
  )
  group.children = members.flatMap((member, index) => {
    const id = `${name}-${index}`
    return [
      {
        type: "paragraph",
        data: {
          hName: "input",
          hProperties: {
            type: "radio",
            name,
            id,
            className: [
              "cudoc-tab-input",
              ...(index === chosen ? ["cudoc-tab-default"] : []),
            ],
          },
          cudoc: { kind: "tabInput", presentation: true },
        },
        children: [],
      },
      {
        type: "paragraph",
        data: {
          hName: "label",
          hProperties: { htmlFor: id, className: ["cudoc-tab-label"] },
          cudoc: { kind: "tabLabel", presentation: true },
        },
        children: [{ type: "text", value: member.data!.cudoc!.title ?? "" }],
      },
      member,
    ]
  })
}

/**
 * A table note drawn as the site's own notes, one component a paragraph,
 * inside the note's own element.
 */
const noteAsElements = (note: DocumentNode, element: string) => {
  note.data = {
    ...note.data,
    cudoc: { ...note.data!.cudoc!, presentation: true },
    cudocNoteElement: element,
  }
  for (const paragraph of note.children ?? [])
    if (paragraph.type === "paragraph")
      paragraph.data = { ...paragraph.data, hName: element }
}

/** Whether a group of tabs was drawn already. */
const presentedTabs = (group: DocumentNode) =>
  group.data?.cudoc?.presentation === true ||
  (group.children ?? []).some(isPresentation)

/** The radio group names a tree already uses, as numbers. */
const usedTabNames = (tree: DocumentNode): number => {
  let highest = 0
  const visit = (node: DocumentNode) => {
    const name = node.data?.hProperties?.name
    const match =
      node.data?.cudoc?.kind === "tabInput" && typeof name === "string"
        ? name.match(/^cudoc-tabs-(\d+)$/)
        : null
    if (match) highest = Math.max(highest, Number(match[1]))
    node.children?.forEach(visit)
  }
  visit(tree)
  return highest
}

/**
 * Adds what the target draws on screen. It runs on a tree normalization
 * produced and may run again after more content is spliced in: a block
 * already framed, and a group of tabs already drawn, is left as it is.
 */
export function presentDocument(tree: Root, target: PresentationTarget): void {
  const native = nativeTitle(target)
  // A Nextra `.md` page goes through rehype-raw, which lower-cases an
  // element name, so a component cannot be named there.
  const elements =
    target.tabElements === false ||
    (target.host === "nextra" && target.format === "md")
      ? undefined
      : (target.tabElements ?? HOST_TAB_ELEMENTS[target.host])
  // Element names, like the tab components, cannot be given on a Nextra
  // `.md` page.
  const noteElement =
    target.host === "nextra" && target.format === "md"
      ? undefined
      : HOST_NOTE_ELEMENTS[target.host]
  let names = usedTabNames(tree as unknown as DocumentNode)
  const visit = (node: DocumentNode) => {
    if (!node.children) return
    if (node.data?.cudoc?.kind === "tabs" && !presentedTabs(node)) {
      if (elements) tabsAsElements(node, elements)
      else tabsAsRadios(node, `cudoc-tabs-${++names}`)
    }
    if (
      noteElement &&
      node.data?.cudoc?.kind === "tableNote" &&
      !isPresentation(node)
    )
      noteAsElements(node, noteElement)
    node.children = node.children.map((child) => {
      if (child.type !== "code" || child.data?.cudoc?.kind !== "code") {
        if (!(isPresentation(child) && child.data?.cudoc?.kind === "codeFrame"))
          visit(child)
        return child
      }
      const { title, lines } = child.data.cudoc as {
        title?: string
        lines?: number[]
      }
      // The meta as written, kept for `withoutPresentation`; a second run
      // starts from it again rather than from its own output.
      if (!("cudocMeta" in child.data))
        child.data.cudocMeta =
          typeof child.meta === "string" ? child.meta : null
      const written = child.data.cudocMeta as string | null
      const style = META_STYLE[target.host]
      const rest = codeMetaRest(
        written ?? "",
        { title, lines },
        style?.separator,
      )
      // The quote the title does not hold, as the hosts read either; none
      // where the host shows a quote, unless the title holds its separator.
      const quote =
        style && !style.quote && !title?.includes(style.separator)
          ? ""
          : title?.includes('"')
            ? "'"
            : '"'
      const meta = [
        native && title ? `${native}=${quote}${title}${quote}` : "",
        lines?.length ? formatLineRanges(lines) : "",
        rest,
      ]
        .filter(Boolean)
        .join(style?.separator ?? " ")
      child.meta = meta || null
      return title && !native ? codeFrame(title, child) : child
    })
  }
  visit(tree as unknown as DocumentNode)
}

/**
 * The tree with everything `presentDocument` added taken off again: a frame
 * gives way to the block it holds, a tab's radio and label go, and tabs and
 * a table note drawn by a site's components are a group of tabs and a note
 * again. Collection stores what
 * this leaves.
 */
export function withoutPresentation<Tree extends Root>(tree: Tree): Tree {
  const visit = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.flatMap((child) => {
      // Tabs drawn by the site's components keep their place; only their
      // element names and props were changed.
      const cudoc = child.data?.cudoc
      if (cudoc?.kind === "tabs" && cudoc.presentation) {
        child.data = { ...child.data, ...tabsData(cudoc.group) }
        for (const member of child.children ?? []) {
          const own = member.data?.cudoc
          if (own?.kind === "tab")
            member.data = {
              ...member.data,
              ...tabData(own.title ?? "", own.value ?? "", own.default),
            }
        }
        visit(child)
        return [child]
      }
      // A note drawn as the site's notes keeps its place too.
      if (cudoc?.kind === "tableNote" && cudoc.presentation) {
        const element = child.data!.cudocNoteElement
        const { presentation: _drawn, ...semantic } = cudoc
        const { cudocNoteElement: _element, ...data } = child.data!
        child.data = { ...data, cudoc: semantic }
        for (const paragraph of child.children ?? []) {
          if (!paragraph.data || paragraph.data.hName !== element) continue
          const { hName: _name, ...rest } = paragraph.data
          if (Object.keys(rest).length) paragraph.data = rest
          else delete paragraph.data
        }
        visit(child)
        return [child]
      }
      if (!isPresentation(child)) {
        visit(child)
        return [child]
      }
      // A frame gives way to what it holds; a tab's radio and label, which
      // hold only their own words, go altogether.
      if (cudoc?.kind !== "codeFrame") return []
      const kept = (child.children ?? []).filter(
        (grandchild) => !isPresentation(grandchild),
      )
      kept.forEach(visit)
      return kept
    })
  }
  visit(tree as unknown as DocumentNode)
  // Each code block's meta as it was written.
  const restore = (node: DocumentNode) => {
    if (node.data && "cudocMeta" in node.data) {
      node.meta = node.data.cudocMeta as string | null
      delete node.data.cudocMeta
    }
    node.children?.forEach(restore)
  }
  restore(tree as unknown as DocumentNode)
  return tree
}
