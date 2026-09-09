import fs from "node:fs"
import path from "node:path"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import hljs from "highlight.js"
import type { Root as HastRoot, RootContent } from "hast"
import type { DocumentOptions, DocumentNode } from "@cudoment/cudoc/document"
import { nodeText, visibleHeadingText } from "@cudoment/cudoc/document"
import {
  buildDocuments,
  loadLibrary,
  type StoredDocument,
} from "@cudoment/cudoc/node/library"
import { resolveDocumentEmbeds } from "@cudoment/cudoc/node/resolve-embed"
import { renderDocument, type RenderOptions } from "@cudoment/cudoc/render"
import {
  publishDirectory,
  safePath,
  posix,
  realPath,
  contained,
} from "@cudoment/cudoc/node/storage"
import {
  createTargets,
  deploymentUrl,
  hostedRoute,
  rewritePageLinks,
  externalUrl,
  type SiteLinkMode,
} from "./links.js"
import { preparedDocument } from "./library.js"
export type { SiteLinkMode } from "./links.js"

export type SiteOptions = DocumentOptions & {
  sourceRoot: string
  outDir: string
  title?: string
  navigation?: string[]
  css?: string
  libraryDir?: string
  /** Reuse an existing collected host library without recompiling or writing to it. */
  library?: string
  links?: SiteLinkMode
  /** Deployment URL, including any site base path. Required for links: "host". */
  hostUrl?: string
  /** Additional URL-root asset directories, such as a host's static/ or public/. */
  assetDirs?: string[]
  renderOptions?: RenderOptions
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  )
export const siteStyles = `
:root{color-scheme:light;--ink:#172033;--muted:#526176;--line:#d6dee9;--paper:#fff;--wash:#f4f7fb;--accent:#174ea6;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.65;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}body{margin:0}a{color:var(--accent);text-underline-offset:.2em;overflow-wrap:anywhere}a:hover{text-decoration-thickness:2px}:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.skip{position:absolute;left:1rem;top:-5rem;background:white;padding:.7rem;z-index:3}.skip:focus{top:1rem}
header{border-bottom:1px solid var(--line);padding:1rem 2rem;font-weight:700}header a{color:inherit;text-decoration:none}.layout{display:grid;grid-template-columns:16rem minmax(0,52rem) 14rem;max-width:90rem;margin:auto;gap:2.5rem;padding:2rem}nav{font-size:.9rem}nav ul{list-style:none;padding:0}nav li{margin:.25rem 0}nav a{display:block;padding:.55rem .65rem;border-radius:.35rem;text-decoration:none}nav a[aria-current=page]{background:#e9f0fc;font-weight:650}nav a:hover{background:var(--wash)}.nav-title{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}main{min-width:0}h1,h2,h3,h4,h5,h6{line-height:1.3;scroll-margin-top:1rem}h1{font-size:2.25rem;letter-spacing:-.025em}h2{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line)}p,ul,ol{margin:1rem 0}img{max-width:100%;height:auto}pre{background:var(--wash);border:1px solid var(--line);padding:1rem;overflow:auto;border-radius:.4rem}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.875em}p code,li code{background:var(--wash);padding:.1em .25em;border-radius:.2em}table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;margin:1.25rem 0}th,td{border:1px solid var(--line);padding:.65rem .8rem;text-align:left;vertical-align:top}th{background:var(--wash)}td p,td ul,td ol{margin:.3rem 0}blockquote{border-left:3px solid var(--line);padding:.1rem 1rem;margin:1.3rem 0;color:var(--muted)}.cudoc-badge{display:inline-block;background:#e9f0fc;color:#174ea6;font-size:.75em;padding:.05em .5em;border-radius:.3em;margin-left:.3em;font-weight:600}.cudoc-callout{border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--wash);padding:.25rem 1rem;margin:1.5rem 0;border-radius:.35rem}.cudoc-callout-title{font-weight:700}.cudoc-callout-warning,.cudoc-callout-caution{border-left-color:#936000;background:#fff8e6}.cudoc-callout-danger{border-left-color:#aa2020}.hljs-keyword,.hljs-selector-tag{color:#7a269e}.hljs-string,.hljs-attr{color:#0a6851}.hljs-comment{color:#526176}.hljs-number,.hljs-literal{color:#8d3900}footer{border-top:1px solid var(--line);margin-top:3rem;padding-top:1rem;color:var(--muted);font-size:.85rem}.toc a{padding:.35rem 0}.toc li[data-depth="3"]{padding-left:1rem}
@media(max-width:1100px){.layout{grid-template-columns:13rem minmax(0,1fr);gap:2rem}.toc{display:none}}@media(max-width:700px){header{padding:1rem}.layout{display:block;padding:1rem}.sidebar{border-bottom:1px solid var(--line);padding-bottom:1rem}.sidebar ul{display:flex;flex-wrap:wrap;gap:.25rem}h1{font-size:1.8rem}nav a{min-height:44px}main{padding-top:1rem}}@media print{header,.sidebar,.toc,.skip{display:none}.layout{display:block;padding:0}a{color:inherit}pre,table{overflow:visible}.cudoc-callout{break-inside:avoid}}
`

export function buildSite({
  sourceRoot,
  outDir,
  title = "Documentation",
  navigation,
  css,
  libraryDir = path.join(path.dirname(outDir), ".cudoc", "documents"),
  library: existingLibrary,
  links = "relative",
  hostUrl,
  assetDirs = [],
  renderOptions,
  ...options
}: SiteOptions) {
  const deployment = deploymentUrl(links, hostUrl)
  if (
    existingLibrary !== undefined &&
    (typeof existingLibrary !== "string" || !existingLibrary)
  )
    throw new Error("cudoc-html: library must be a collected library directory")
  if (
    !Array.isArray(assetDirs) ||
    assetDirs.some((dir) => typeof dir !== "string" || !dir)
  )
    throw new Error("cudoc-html: assetDirs must contain directory paths")
  libraryDir = existingLibrary ?? libraryDir
  const output = realPath(outDir)
  for (const input of [sourceRoot, libraryDir, ...assetDirs]) {
    const resolved = realPath(input)
    if (contained(resolved, output) || contained(output, resolved))
      throw new Error(
        "cudoc-html: site output overlaps source, library or asset directory",
      )
  }
  if (existingLibrary && Object.keys(options).length)
    throw new Error(
      "cudoc-html: syntax/compiler options belong to collection when reusing a library",
    )
  const library = existingLibrary
    ? loadLibrary(existingLibrary, undefined, sourceRoot)
    : buildDocuments({
        ...options,
        host: "html",
        sourceRoot,
        outDir: libraryDir,
      })
  const targets = createTargets(library, deployment)
  const ids = library.documents.map((d) => d.id)
  if (!ids.length) throw new Error("cudoc-html: no documents found")
  for (const id of navigation ?? [])
    if (!ids.includes(id))
      throw new Error(`cudoc-html: unknown navigation document ${id}`)
  const order = [...new Set([...(navigation ?? []), ...ids])]
  const titles = new Map(
    library.documents.map((doc) => [
      doc.id,
      String(
        doc.frontmatter.title ??
          nodeText(
            (doc.tree.children.find((n) => n.type === "heading") ?? {
              type: "text",
              value: doc.id,
            }) as unknown as DocumentNode,
          ),
      ),
    ]),
  )
  const documentMap = new Map(library.documents.map((doc) => [doc.id, doc]))
  const outputPath = (id: string) => `${id}.html`
  const relativeLink = (from: string, to: string) =>
    posix(path.posix.relative(path.posix.dirname(outputPath(from)), to)) ||
    path.posix.basename(to)
  const reservedOutputs = new Set([
    "cudoc.css",
    "index.html",
    ...ids.map((id) => outputPath(id).toLowerCase()),
  ])
  publishDirectory(sourceRoot, outDir, (staging) => {
    const copied = new Map<string, string>()
    const copyAsset = (url: string, doc: StoredDocument): string => {
      if (/^(?:#|[a-z][\w+.-]*:|\/\/)/i.test(url)) return url
      const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/)!
      const decoded = decodeURIComponent(pathname)
      const relative = path.posix.normalize(
        decoded.startsWith("/")
          ? decoded.slice(1)
          : path.posix.join(path.posix.dirname(doc.sourcePath), decoded),
      )
      const rootPath = targets
        .withoutBase(decoded.startsWith("/") ? decoded : `/${relative}`)
        .replace(/^\//, "")
      const candidates = [
        { root: sourceRoot, relative },
        ...assetDirs.map((root) => ({ root, relative: rootPath })),
      ]
      for (const candidate of candidates) {
        const source = safePath(candidate.root, candidate.relative)
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue
        const asset = candidate.relative
        if (reservedOutputs.has(asset.toLowerCase()))
          throw new Error(
            `cudoc-html: asset collides with generated output: ${asset}`,
          )
        const previous = copied.get(asset.toLowerCase())
        if (previous && previous !== fs.realpathSync(source))
          throw new Error(
            `cudoc-html: different assets share output path: ${asset}`,
          )
        const destination = safePath(staging, asset)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(source, destination)
        copied.set(asset.toLowerCase(), fs.realpathSync(source))
        return `${relativeLink(doc.id, asset)}${suffix}`
      }
      throw new Error(
        `cudoc-html: missing local target ${url} in ${doc.id}; check sourceRoot and assetDirs`,
      )
    }
    const writePage = (page: string, doc: StoredDocument) => {
      const tree = fromHtml(page)
      rewritePageLinks(tree, links, (url) => {
        if (links === "relative" && url.startsWith("#")) return url
        const target = targets.find(url, doc)
        if (links === "host") {
          if (target.document)
            return `${hostedRoute(target.document.route, deployment!)}${target.suffix}`
          if (url.startsWith("/")) return hostedRoute(url, deployment!)
          return new URL(url, hostedRoute(doc.route, deployment!)).href
        }
        return target.document
          ? `${relativeLink(doc.id, outputPath(target.document.id))}${target.suffix}`
          : copyAsset(url, doc)
      })
      const output = safePath(staging, outputPath(doc.id))
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, toHtml(tree))
    }
    fs.writeFileSync(
      path.join(staging, "cudoc.css"),
      siteStyles + (css ? `\n${fs.readFileSync(css, "utf8")}` : ""),
    )
    for (const doc of library.documents) {
      const tree = existingLibrary
        ? preparedDocument(doc, libraryDir)
        : resolveDocumentEmbeds(library, doc.id)
      const html = renderDocument(tree, {
        highlight(code, language) {
          const value =
            language && hljs.getLanguage(language)
              ? hljs.highlight(code, { language }).value
              : escape(code)
          return `<pre><code class="hljs${language ? ` language-${escape(language)}` : ""}">${value}</code></pre>`
        },
        ...renderOptions,
      })
      const hast = fromHtml(html, { fragment: true })
      const rewrite = (node: HastRoot | RootContent) => {
        if (node.type === "element") {
          // Hyperlinks are handled on the complete page; keep rendering resources local.
          for (const key of [
            "src",
            ...(node.tagName === "link" ? ["href"] : []),
          ]) {
            const url = node.properties[key]
            if (typeof url === "string" && !externalUrl(url))
              node.properties[key] = copyAsset(url, doc)
          }
        }
        if ("children" in node) node.children.forEach(rewrite)
      }
      rewrite(hast)
      const headings: DocumentNode[] = []
      const collect = (node: DocumentNode) => {
        if (node.type === "heading" && node.depth! > 1) headings.push(node)
        node.children?.forEach(collect)
      }
      collect(tree as unknown as DocumentNode)
      const nav = order
        .map(
          (id) =>
            `<li><a href="${escape(relativeLink(doc.id, documentMap.get(id)!.sourcePath))}"${id === doc.id ? ' aria-current="page"' : ""}>${escape(titles.get(id)!)}</a></li>`,
        )
        .join("")
      const toc = headings
        .map(
          (node) =>
            `<li data-depth="${node.depth}"><a href="#${escape(String(node.data?.hProperties?.id ?? ""))}">${escape(visibleHeadingText(node))}</a></li>`,
        )
        .join("")
      const page = `<!doctype html><html lang="${escape(String(doc.frontmatter.lang ?? "en"))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(titles.get(doc.id)!)} · ${escape(title)}</title><link rel="stylesheet" href="${escape(relativeLink(doc.id, "cudoc.css"))}"></head><body>${links === "relative" ? '<a class="skip" href="#main-content">Skip to content</a>' : ""}<header><a href="${escape(relativeLink(doc.id, documentMap.get(order[0])!.sourcePath))}">${escape(title)}</a></header><div class="layout"><nav class="sidebar" aria-label="Documents"><p class="nav-title">Documents</p><ul>${nav}</ul></nav><main id="main-content">${toHtml(hast)}<footer>${escape(title)}</footer></main><nav class="toc" aria-label="On this page"><p class="nav-title">On this page</p><ul>${toc}</ul></nav></div></body></html>`
      writePage(page, doc)
    }
    if (!documentMap.has("index")) {
      const index = {
        ...library.documents[0],
        id: "index",
        sourcePath: "index.md",
        route: "/",
      }
      writePage(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="cudoc.css"></head><body><header>${escape(title)}</header><main style="max-width:60rem;margin:2rem auto;padding:1rem"><h1>${escape(title)}</h1><nav aria-label="Documents"><ul>${order.map((id) => `<li><a href="${escape(documentMap.get(id)!.sourcePath)}">${escape(titles.get(id)!)}</a></li>`).join("")}</ul></nav></main></body></html>`,
        index,
      )
    }
  })
  return {
    outDir: path.resolve(outDir),
    documentCount: library.documents.length,
    libraryDir: path.resolve(libraryDir),
  }
}
