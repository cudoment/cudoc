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
import { resolveLocalTarget } from "@cudoment/cudoc/node/local-target"
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
/**
 * The built-in stylesheet for an exported site.
 *
 * Palette: the Knowledge Base/Documentation ramp for light and the Developer
 * Tool/IDE ramp for dark, with three values darkened so that every foreground
 * and surface pair clears WCAG AA (4.5:1 for text, 3:1 for the focus ring).
 * Every colour is a custom property that both themes define, so a site
 * restyles the export by redefining properties rather than rewriting rules.
 */
export const siteStyles = `
:root {
  color-scheme: light dark;

  /* Surfaces, from the page ground up to a raised panel. */
  --canvas: #f8fafc;
  --paper: #ffffff;
  --wash: #f1f5f9;
  --row-alt: #fafbfd;

  /* Text, from primary reading colour down to small labels. */
  --ink: #1e293b;
  --muted: #475569;
  --faint: #5b6b7f;

  /* Lines: --line separates regions, --line-soft separates rows. */
  --line: #e2e8f0;
  --line-soft: #eef2f7;

  /* Accent and status. Each pairs with its own tinted surface. */
  --accent: #1d4ed8;
  --accent-soft: #dbeafe;
  --warn: #b45309;
  --warn-wash: #fef6e7;
  --danger: #b91c1c;
  --danger-wash: #fdeeee;

  /* Syntax highlighting, kept in the same ramp as the body text. */
  --code-keyword: #7c3aed;
  --code-string: #0f766e;
  --code-comment: #5b6b7f;
  --code-number: #b45309;

  /* Type: the browser's own base size is respected and scaled from. */
  --font-sans:
    "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text",
    "Segoe UI", "Apple SD Gothic Neo", Pretendard, "Malgun Gothic", system-ui,
    sans-serif;
  --font-mono:
    "JetBrains Mono", "IBM Plex Mono", ui-monospace, "SF Mono", SFMono-Regular,
    Menlo, Consolas, monospace;
  --text-xs: 0.8125rem;
  --text-sm: 0.875rem;
  --text-base: 0.9375rem;
  --text-lg: 1.0625rem;
  --text-xl: 1.1875rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --leading-body: 1.7;
  --leading-tight: 1.3;

  /* Spacing, on a 4px grid. */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  --radius: 0.375rem;
  --measure: 72ch;
  --head-h: 3.5rem;
  --ease: 160ms cubic-bezier(0.4, 0, 0.2, 1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #0b1120;
    --paper: #0f172a;
    --wash: #1b2336;
    --row-alt: #141d31;
    --ink: #f8fafc;
    --muted: #94a3b8;
    --faint: #8b9ab0;
    --line: #334155;
    --line-soft: #1e293b;
    --accent: #7cb0fb;
    --accent-soft: #1e3252;
    --warn: #fbbf24;
    --warn-wash: #2b2110;
    --danger: #f87171;
    --danger-wash: #2c1618;
    --code-keyword: #c4b5fd;
    --code-string: #5eead4;
    --code-comment: #8b9ab0;
    --code-number: #fcd34d;
  }
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --ease: 1ms linear;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}
html {
  font-family: var(--font-sans);
  font-size: 100%;
  line-height: var(--leading-body);
  color: var(--ink);
  background: var(--canvas);
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
body {
  margin: 0;
  font-size: var(--text-base);
  background: var(--canvas);
}
a {
  color: var(--accent);
  text-decoration: none;
  text-underline-offset: 0.2em;
  overflow-wrap: anywhere;
  transition: color var(--ease);
}
a:hover {
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
.skip {
  position: absolute;
  left: var(--space-4);
  top: -6rem;
  z-index: 6;
  padding: var(--space-3) var(--space-4);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-weight: 600;
}
.skip:focus {
  top: var(--space-2);
}

/* ---------- shell ---------- */
header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  height: var(--head-h);
  padding: 0 var(--space-6);
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.015em;
}
header a {
  color: inherit;
}
header a:hover {
  color: var(--accent);
  text-decoration: none;
}
.layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 58rem) 13rem;
  align-items: start;
  gap: var(--space-8);
  max-width: 90rem;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) 40vh;
}
.sidebar,
.toc {
  position: sticky;
  top: calc(var(--head-h) + var(--space-4));
  max-height: calc(100vh - var(--head-h) - var(--space-8));
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: var(--text-sm);
}
nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
nav li {
  margin: 1px 0;
}
nav a {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-left: 2px solid transparent;
  border-radius: 0 var(--radius) var(--radius) 0;
  color: var(--muted);
  transition:
    background var(--ease),
    color var(--ease);
}
nav a:hover {
  background: var(--wash);
  color: var(--ink);
  text-decoration: none;
}
nav a[aria-current="page"] {
  background: var(--accent-soft);
  border-left-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.nav-title {
  margin: 0 0 var(--space-2);
  padding: 0 var(--space-3);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
}
.toc a {
  padding: var(--space-1) var(--space-3);
  border-left: 2px solid var(--line-soft);
  border-radius: 0;
}
.toc li[data-depth="3"] a {
  padding-left: var(--space-6);
}
.landing {
  max-width: 44rem;
  margin: 0 auto;
  padding: var(--space-12) var(--space-6) 30vh;
}

/* ---------- prose ---------- */
main {
  min-width: 0;
}
main > p,
main > ul,
main > ol,
main > dl,
main > blockquote {
  max-inline-size: var(--measure);
}
.cudoc-callout,
details {
  max-inline-size: calc(var(--measure) + 6ch);
}
h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: var(--leading-tight);
  font-weight: 650;
  text-wrap: balance;
  scroll-margin-top: calc(var(--head-h) + var(--space-2));
}
h1 {
  margin: 0 0 var(--space-4);
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: -0.024em;
}
h2 {
  margin: var(--space-12) 0 var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  font-size: var(--text-2xl);
  letter-spacing: -0.018em;
}
h3 {
  margin: var(--space-8) 0 var(--space-2);
  font-size: var(--text-xl);
  letter-spacing: -0.012em;
}
h4,
h5,
h6 {
  margin: var(--space-6) 0 var(--space-2);
  font-size: var(--text-base);
  color: var(--muted);
}
.header-anchor {
  margin-left: 0.35em;
  color: var(--faint);
  font-weight: 400;
  opacity: 0;
  transition: opacity var(--ease);
}
h1:hover > .header-anchor,
h2:hover > .header-anchor,
h3:hover > .header-anchor,
h4:hover > .header-anchor,
.header-anchor:focus-visible {
  opacity: 1;
}
p {
  margin: 0 0 var(--space-4);
  text-wrap: pretty;
}
ul,
ol {
  margin: 0 0 var(--space-4);
  padding-left: 1.4em;
}
li {
  margin: var(--space-1) 0;
}
li > ul,
li > ol {
  margin: var(--space-1) 0 0;
}
li::marker {
  color: var(--faint);
}
hr {
  height: 0;
  margin: var(--space-8) 0;
  border: 0;
  border-top: 1px solid var(--line);
}
img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
}
strong {
  font-weight: 650;
}
abbr {
  text-underline-offset: 0.25em;
}

/* ---------- code ---------- */
code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  font-variant-ligatures: none;
}
:not(pre) > code {
  padding: 0.1em 0.32em;
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-radius: 0.25em;
  white-space: nowrap;
}
pre {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  overflow-x: auto;
  line-height: 1.6;
  tab-size: 2;
}
pre code {
  white-space: pre;
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-built_in {
  color: var(--code-keyword);
}
.hljs-string,
.hljs-attr,
.hljs-addition {
  color: var(--code-string);
}
.hljs-comment,
.hljs-quote {
  color: var(--code-comment);
  font-style: italic;
}
.hljs-number,
.hljs-literal,
.hljs-title {
  color: var(--code-number);
}

/* ---------- tables ---------- */
table {
  display: block;
  max-width: 100%;
  margin: 0 0 var(--space-4);
  border-collapse: collapse;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
thead th {
  padding: var(--space-2) var(--space-3);
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--faint);
  white-space: nowrap;
}
tbody tr {
  border-bottom: 1px solid var(--line-soft);
  transition: background var(--ease);
}
tbody tr:nth-child(even) {
  background: var(--row-alt);
}
tbody tr:hover {
  background: var(--accent-soft);
}
tbody tr:last-child {
  border-bottom: 0;
}
td {
  padding: var(--space-2) var(--space-3);
  vertical-align: top;
}
td p,
td ul,
td ol {
  margin: var(--space-1) 0;
}
td ul,
td ol {
  padding-left: 1.2em;
}
td > :first-child {
  margin-top: 0;
}
td > :last-child {
  margin-bottom: 0;
}

/* ---------- blocks ---------- */
blockquote {
  margin: var(--space-6) 0;
  padding: 0 var(--space-4);
  border-left: 2px solid var(--line);
  color: var(--muted);
}
blockquote > :last-child {
  margin-bottom: 0;
}
details {
  margin: var(--space-4) 0;
  padding: var(--space-2) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
}
details summary {
  padding: var(--space-1) 0;
  font-weight: 600;
  cursor: pointer;
}
details[open] summary {
  margin-bottom: var(--space-2);
}
.cudoc-badge {
  display: inline-block;
  margin-left: 0.35em;
  padding: 0.1em 0.5em;
  background: var(--accent-soft);
  border-radius: 0.75em;
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
  vertical-align: 0.08em;
}
.cudoc-callout {
  margin: var(--space-6) 0;
  padding: var(--space-3) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
}
.cudoc-callout > :first-child {
  margin-top: 0;
}
.cudoc-callout > :last-child {
  margin-bottom: 0;
}
.cudoc-callout-title {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--ink);
  font-weight: 700;
}
.cudoc-callout-warning,
.cudoc-callout-caution {
  background: var(--warn-wash);
  border-left-color: var(--warn);
}
.cudoc-callout-danger,
.cudoc-callout-error {
  background: var(--danger-wash);
  border-left-color: var(--danger);
}
footer {
  margin-top: var(--space-12);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  color: var(--faint);
  font-size: var(--text-sm);
}

/* ---------- responsive ---------- */
@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: var(--space-6);
  }
  .toc {
    display: none;
  }
}
@media (max-width: 768px) {
  header {
    padding: 0 var(--space-4);
  }
  .layout {
    display: block;
    padding: var(--space-4) var(--space-4) 20vh;
  }
  .landing {
    padding: var(--space-6) var(--space-4) 20vh;
  }
  .sidebar {
    position: static;
    max-height: none;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--line);
  }
  .sidebar ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  nav a {
    min-height: 2.75rem;
    display: flex;
    align-items: center;
  }
  h1 {
    font-size: var(--text-2xl);
  }
  h2 {
    margin-top: var(--space-8);
    font-size: var(--text-xl);
  }
  h3 {
    font-size: var(--text-lg);
  }
}
@media print {
  header,
  .sidebar,
  .toc,
  .skip {
    display: none;
  }
  html,
  body {
    background: #fff;
    color: #000;
    font-size: 10.5pt;
  }
  .layout {
    display: block;
    max-width: none;
    padding: 0;
  }
  main > p,
  main > ul,
  main > ol,
  .cudoc-callout,
  details {
    max-inline-size: none;
  }
  a {
    color: inherit;
    text-decoration: underline;
  }
  pre,
  table {
    overflow: visible;
  }
  h2,
  h3 {
    break-after: avoid;
  }
  pre,
  tr,
  .cudoc-callout,
  details {
    break-inside: avoid;
  }
  thead {
    display: table-header-group;
  }
}
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
      const target = resolveLocalTarget(url, doc.sourcePath, {
        sourceRoot,
        assetDirs,
        withoutBase: targets.withoutBase,
      })
      if (target.kind === "external") return url
      // A link reaching outside every root resolves to nothing, and the error
      // below names the link and the document carrying it, which is what an
      // author needs to fix it.
      if (target.kind === "missing")
        throw new Error(
          `cudoc-html: missing local target ${url} in ${doc.id}; check sourceRoot and assetDirs`,
        )
      const asset = target.relative
      if (reservedOutputs.has(asset.toLowerCase()))
        throw new Error(
          `cudoc-html: asset collides with generated output: ${asset}`,
        )
      const previous = copied.get(asset.toLowerCase())
      if (previous && previous !== fs.realpathSync(target.source))
        throw new Error(
          `cudoc-html: different assets share output path: ${asset}`,
        )
      const destination = safePath(staging, asset)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(target.source, destination)
      copied.set(asset.toLowerCase(), fs.realpathSync(target.source))
      return `${relativeLink(doc.id, asset)}${target.suffix}`
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
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="cudoc.css"></head><body><header>${escape(title)}</header><main class="landing"><h1>${escape(title)}</h1><nav aria-label="Documents"><ul>${order.map((id) => `<li><a href="${escape(documentMap.get(id)!.sourcePath)}">${escape(titles.get(id)!)}</a></li>`).join("")}</ul></nav></main></body></html>`,
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
