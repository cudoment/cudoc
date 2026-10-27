import type { Image, Root } from "mdast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"
import {
  lowerNativeElements,
  type CapturedImage,
} from "@cudoment/cudoc/document"
import type { CompiledDocument } from "@cudoment/cudoc/markdown"
import { frontmatterOf } from "@cudoment/cudoc/query"
import { importedNames, importedNamesFromSource } from "@cudoment/cudoc/mdx"
import { withoutPresentation } from "@cudoment/cudoc/present"

export type CompilerCaptureOptions = {
  /**
   * Path prefixes the host resolves by itself, each with the prefix an image
   * is recorded under instead. Docusaurus reads `@site/static/img/logo.png`
   * from the site directory and serves it at `/img/logo.png`, an address the
   * check and the export resolve through their asset directories, so a
   * Docusaurus collector passes `{ "@site/static/": "/" }`. The longest
   * matching prefix wins; the host's own page is not changed. Only images
   * are recorded this way: a link keeps the path it was written with.
   */
  aliases?: Record<string, string>
}

/**
 * The front matter a host parsed itself and left on the file, as Docusaurus
 * leaves `frontMatter`, when it holds anything. A collector that hands the
 * host none, or a host that parses none, leaves the tree's own to be read.
 */
const hostFrontmatter = (data: Record<string, unknown>) => {
  const given = data.frontMatter ?? data.frontmatter
  return given &&
    typeof given === "object" &&
    !Array.isArray(given) &&
    Object.keys(given).length
    ? (given as Record<string, unknown>)
    : undefined
}

/**
 * Capture remark's final tree at the start of rehype, after native host plugins.
 *
 * `capture.remark` also notes every Markdown image as it stands then. A host
 * plugin that runs later may turn one into a component of its own, as
 * Docusaurus turns each into an `<img>` requiring the file; it rewrites the
 * node in place, so the note still finds it, and the captured component keeps
 * the image as `data.cudocImage` for everything that renders the stored tree
 * without the host.
 */
export function createCompilerCapture(options: CompilerCaptureOptions = {}) {
  const given = options.aliases === undefined ? {} : options.aliases
  if (
    typeof given !== "object" ||
    given === null ||
    Array.isArray(given) ||
    Object.entries(given).some(
      ([prefix, value]) => !prefix || typeof value !== "string",
    )
  )
    throw new TypeError(
      "cudoc: capture aliases must map path prefixes to strings",
    )
  const aliases = Object.entries(given).sort(([a], [b]) => b.length - a.length)
  const portable = (url: string) => {
    const alias = aliases.find(([prefix]) => url.startsWith(prefix))
    return alias ? `${alias[1]}${url.slice(alias[0].length)}` : url
  }
  let current: Root | undefined
  let written: Root["children"] = []
  let result: CompiledDocument | undefined
  const images = new Map<object, CapturedImage>()
  const remark: Plugin<[], Root> = () => (tree) => {
    current = tree
    // Kept now: a host plugin that runs later may turn the node into
    // something else, as Nextra turns it into a `metadata` export. It is
    // parsed only when the host leaves no front matter of its own.
    written = tree.children.filter((node) => node.type === "yaml")
    images.clear()
    visit(tree, "image", (node: Image) => {
      images.set(node, {
        url: portable(node.url),
        alt: node.alt ?? null,
        title: node.title ?? null,
      })
    })
  }
  const rehype: Plugin = () => (_tree, file) => {
    if (!current)
      throw new Error("cudoc: install capture.remark before capture.rehype")
    for (const [node, image] of images) {
      const replaced = node as { type: string; data?: Record<string, unknown> }
      if (replaced.type !== "image")
        replaced.data = { ...replaced.data, cudocImage: image }
    }
    const tree = structuredClone(current)
    // An image the host kept is recorded under the same address.
    if (aliases.length)
      visit(tree, "image", (node: Image) => {
        node.url = portable(node.url)
      })
    // Markup cudoc added for the screen is not part of the document. Taken
    // off first: what it wrapped is lowered with the rest.
    withoutPresentation(tree)
    lowerNativeElements(tree)
    // A host may have hoisted the ESM out of the tree already, so the source
    // is read as well; the two agree when both are present.
    const imports = [
      ...new Set([
        ...importedNames(tree),
        ...(file.extname === ".mdx"
          ? importedNamesFromSource(String(file.value))
          : []),
      ]),
    ]
    tree.children = tree.children.filter(
      (n) => !["yaml", "mdxjsEsm"].includes(n.type),
    )
    result = {
      tree,
      frontmatter:
        hostFrontmatter(file.data as Record<string, unknown>) ??
        frontmatterOf({ type: "root", children: written }),
      diagnostics: [],
      ...(imports.length ? { imports } : {}),
    }
  }
  return {
    remark,
    rehype,
    read(): CompiledDocument {
      if (!result)
        throw new Error(
          "cudoc: host compilation did not reach the capture stage",
        )
      return result
    },
  }
}
