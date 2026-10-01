/**
 * The stylesheets a site adds with `css`, and the styles a document writes
 * in raw HTML, with the files they load.
 *
 * A stylesheet is parsed rather than searched, so a `url()` is found where
 * CSS says it is and rewritten in place, keeping the author's text around
 * it. Each `url()` resolves from the stylesheet's own location: in a site the
 * file is copied and the reference follows it, on a standalone page it
 * becomes a `data:` URL. `@import` is refused in both, since its conditions
 * and layers have no faithful flattening; listing each file in `css` says
 * the same thing.
 */

import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { parse, walk } from "css-tree"
import { dataUrl } from "./resources.js"

const REMOTE = /^(?:[a-z][\w+.-]*:|\/\/)/i

export type StylesheetFile = {
  /** The local file a `url()` names, checked by the caller. */
  source: string
  /** Its output name in a site. */
  asset: string
}

export type StylesheetContext = {
  /** What the stylesheet is called in messages. */
  name: string
  /** The directory a relative `url()` resolves from. */
  base: string
  /** Turns a local file into its reference: an output path, or a data URL. */
  local: (source: string, url: string) => string
  /** Called for a remote `url()`; standalone throws, a site keeps it. */
  remote: (url: string) => void
  /** Parse as a declaration list, for a `style` attribute. */
  declarations?: boolean
}

/** A stylesheet's text with every `url()` rewritten for where the page lives. */
export function rewriteStylesheet(
  text: string,
  context: StylesheetContext,
): string {
  const tree = parse(text, {
    positions: true,
    filename: context.name,
    ...(context.declarations ? { context: "declarationList" } : {}),
    onParseError(error) {
      throw new Error(
        `cudoc-export: ${context.name} is not valid CSS: ${error.message}`,
      )
    },
  })
  const edits: { start: number; end: number; text: string }[] = []
  walk(tree, (node) => {
    if (node.type === "Atrule" && node.name.toLowerCase() === "import")
      throw new Error(
        `cudoc-export: ${context.name} uses @import; list each stylesheet in css instead`,
      )
    if (node.type !== "Url" || !node.loc) return
    const url = node.value
    if (!url || url.startsWith("#") || /^data:/i.test(url)) return
    if (REMOTE.test(url)) {
      context.remote(url)
      return
    }
    const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/)!
    let decoded = pathname!
    try {
      decoded = decodeURIComponent(pathname!)
    } catch {
      // Looked up as written.
    }
    const source = path.resolve(context.base, decoded)
    if (!fs.existsSync(source) || !fs.statSync(source).isFile())
      throw new Error(
        `cudoc-export: ${context.name} loads ${url}, which is not a file`,
      )
    const reference = context.local(source, url)
    edits.push({
      start: node.loc.start.offset,
      end: node.loc.end.offset,
      text: `url("${reference.startsWith("data:") ? reference : `${reference}${suffix}`}")`,
    })
  })
  let result = text
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  return result
}

/** Text that cannot end the `<style>` element carrying it, whatever its letter case. */
export const styleText = (css: string): string =>
  css.replace(/<\/(style)/gi, "<\\/$1").replace(/<!--/g, "<\\!--")

/**
 * Text that cannot end the `<script>` element carrying it. `<\/script` reads
 * the same in a string, a template and a regular expression; a `<!--`, which
 * can change how the HTML parser reads the rest of the element, has no such
 * spelling, so a script holding one is refused rather than altered.
 */
export const scriptText = (code: string, name: string): string => {
  if (code.includes("<!--"))
    throw new Error(
      `cudoc-export: ${name} contains <!--, which a page cannot carry inline`,
    )
  return code.replace(/<\/(script)/gi, "<\\/$1")
}

/** A stylesheet's file name in a site's output: its place in `css`, so two `theme.css` never meet. */
export const stylesheetAsset = (file: string, index: number) =>
  `cudoc-css/${index + 1}-${path.basename(file)}`

/** A file a stylesheet loads, named by its content, so one copy serves every stylesheet. */
export const stylesheetFileAsset = (source: string) => {
  const digest = createHash("sha256")
    .update(fs.readFileSync(source))
    .digest("hex")
    .slice(0, 12)
  return `cudoc-css/files/${digest}-${path.basename(source)}`
}

/** A local file a standalone page carries inline. */
export const inlineStylesheetFile = (
  source: string,
  url: string,
  name: string,
) => dataUrl(source, url, name)
