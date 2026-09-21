/**
 * What the site builder adds to a page for its two opt-in scripts: for
 * `annotations`, the block ids notes anchor to, the runtime's two files and
 * the tags that load them; for `themeSwitch`, the theme script. Everything
 * here runs in Node at build time; the scripts themselves are under
 * `src/browser/`, bundled by esbuild into `dist/browser/`.
 */

import fs from "node:fs"
import { fileURLToPath } from "node:url"
import type { Root as HastRoot, Element, RootContent } from "hast"
import type { StoredDocument } from "@cudoment/cudoc/node/library"
import { hash } from "@cudoment/cudoc/node/storage"
import { normalizeText } from "./core.js"

export const ANNOTATION_SCRIPT = "cudoc-annotations.js"
export const ANNOTATION_STYLESHEET = "cudoc-annotations.css"
export const THEME_SCRIPT = "cudoc-theme.js"

/**
 * Defence in depth for a page that runs a script: no plugins, no `<base>`
 * hijack, no form posts, no network. Only origin-free directives, because
 * `'self'` does not match the opaque origin a `file://` page has in some
 * browsers and would take the stylesheet down with it.
 */
export const CONTENT_SECURITY_POLICY =
  "object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'"

/** The elements a note can be attached to as a whole. */
const BLOCK_TAGS = new Set([
  "p",
  "li",
  "tr",
  "pre",
  "blockquote",
  "dt",
  "dd",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
])

const isHeading = (node: Element) => /^h[1-6]$/.test(node.tagName)

const hasClass = (node: Element, name: string) => {
  const className = node.properties.className
  return Array.isArray(className) && className.includes(name)
}

const textOf = (node: RootContent | HastRoot): string => {
  if (node.type === "text") return node.value
  if (node.type === "element" && ["script", "style"].includes(node.tagName))
    return ""
  return "children" in node ? node.children.map(textOf).join("") : ""
}

/**
 * The directory holding the built browser files: beside this module's
 * compiled location and, for a checkout running the sources under vitest,
 * the package's `dist`.
 */
function builtDirectory(files: string[], what: string): string {
  const candidates = ["../browser/", "../../dist/browser/"].map((dir) =>
    fileURLToPath(new URL(dir, import.meta.url)),
  )
  for (const dir of candidates)
    if (files.every((file) => fs.existsSync(`${dir}${file}`))) return dir
  throw new Error(
    `cudoc-export: ${what} not built; run npm run build --workspace packages/cudoc-export`,
  )
}

/** Locates the review-note runtime the package ships. */
export function annotationRuntimeFiles(): {
  script: string
  stylesheet: string
} {
  const dir = builtDirectory(
    [ANNOTATION_SCRIPT, ANNOTATION_STYLESHEET],
    "annotation runtime",
  )
  return {
    script: `${dir}${ANNOTATION_SCRIPT}`,
    stylesheet: `${dir}${ANNOTATION_STYLESHEET}`,
  }
}

/** Locates the theme switch script the package ships. */
export function themeRuntimeFile(): string {
  return `${builtDirectory([THEME_SCRIPT], "theme switch script")}${THEME_SCRIPT}`
}

/**
 * Gives every block a stable id: the nearest heading's id, a colon, and the
 * first eight hex digits of the hash of the block's collapsed text, with
 * `~2`, `~3` … when the same text repeats inside one section. Content
 * hashes survive a paragraph inserted or moved anywhere else, which is what
 * a review provokes; an edited block gets a new id, and the quote search
 * takes over for notes on it.
 */
export function assignBlockIds(body: HastRoot): void {
  let heading = ""
  const seen = new Map<string, number>()
  const walk = (node: HastRoot | RootContent) => {
    if (node.type === "element") {
      if (isHeading(node) && typeof node.properties.id === "string")
        heading = node.properties.id
      if (
        BLOCK_TAGS.has(node.tagName) ||
        (node.tagName === "aside" && hasClass(node, "cudoc-callout"))
      ) {
        const key = `${heading}:${hash(normalizeText(textOf(node)).text).slice(0, 8)}`
        const count = (seen.get(key) ?? 0) + 1
        seen.set(key, count)
        node.properties.dataCudocBlock = count === 1 ? key : `${key}~${count}`
      }
    }
    if ("children" in node) node.children.forEach(walk)
  }
  walk(body)
}

/** The version pins a note file carries about the document it was made on. */
export function documentMetadata(doc: StoredDocument): {
  astHash: string
  sourceHash: string
} {
  // The stored tree, before embeds are expanded, is what the manifest
  // hashes, so the page and the CLI agree on the version.
  return {
    astHash: hash(JSON.stringify(doc.tree)),
    sourceHash: doc.source.hash,
  }
}

/** Namespaces browser storage so two exports on one machine do not mix. */
export const siteId = (title: string, order: readonly string[]): string =>
  hash([title, ...order].join("\0")).slice(0, 16)

const findElement = (
  node: HastRoot | RootContent,
  tagName: string,
): Element | undefined => {
  if (node.type === "element" && node.tagName === tagName) return node
  if (!("children" in node)) return undefined
  for (const child of node.children) {
    const found = findElement(child, tagName)
    if (found) return found
  }
  return undefined
}

/**
 * Adds the policy, the stylesheet and the script to a complete page. The
 * script tag is a classic one: a module script is refused over `file://`.
 */
/** Adds the policy meta right after the charset, once per page. */
function ensurePolicy(head: Element): void {
  const present = head.children.some(
    (child) =>
      child.type === "element" &&
      child.tagName === "meta" &&
      Array.isArray(child.properties.httpEquiv) &&
      child.properties.httpEquiv.includes("Content-Security-Policy"),
  )
  if (present) return
  const charset = head.children.findIndex(
    (child) =>
      child.type === "element" &&
      child.tagName === "meta" &&
      child.properties.charSet !== undefined,
  )
  head.children.splice(charset + 1, 0, {
    type: "element",
    tagName: "meta",
    properties: {
      httpEquiv: ["Content-Security-Policy"],
      content: CONTENT_SECURITY_POLICY,
    },
    children: [],
  })
}

/**
 * Loads the theme script from the end of `<head>`, without `defer`: it must
 * set `data-theme` before the body paints, and it is a few hundred bytes.
 */
export function injectThemeScript(page: HastRoot, href: string): void {
  const head = findElement(page, "head")
  if (!head) throw new Error("cudoc-export: page has no head for the theme")
  ensurePolicy(head)
  head.children.push({
    type: "element",
    tagName: "script",
    properties: { src: href },
    children: [],
  })
}

export function injectAnnotationAssets(
  page: HastRoot,
  hrefs: { script: string; stylesheet: string },
): void {
  const head = findElement(page, "head")
  const body = findElement(page, "body")
  if (!head || !body)
    throw new Error("cudoc-export: page has no head or body to annotate")
  ensurePolicy(head)
  head.children.push({
    type: "element",
    tagName: "link",
    properties: { rel: ["stylesheet"], href: hrefs.stylesheet },
    children: [],
  })
  body.children.push({
    type: "element",
    tagName: "script",
    properties: { defer: true, src: hrefs.script },
    children: [],
  })
}
