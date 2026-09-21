import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import hljs from "highlight.js"
import type { Root as HastRoot, RootContent } from "hast"
import type { DocumentOptions, DocumentNode } from "@cudoment/cudoc/document"
import { visibleHeadingText } from "@cudoment/cudoc/document"
import {
  buildDocuments,
  loadLibrary,
  resolveRoots,
  type SourceRoot,
  type StoredDocument,
} from "@cudoment/cudoc/node/library"
import { resolveDocumentEmbeds } from "@cudoment/cudoc/node/resolve-embed"
import {
  isExternalPath,
  resolveLocalTarget,
} from "@cudoment/cudoc/node/local-target"
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
import {
  resolveTokens,
  type DesignTokens,
  type DesignTokenOverrides,
} from "./design/tokens.js"
import {
  resolvePageOptions,
  type PageOptions,
  type ResolvedPageOptions,
} from "./design/page.js"
import {
  PRINT_STYLESHEET,
  localizeAssets,
  printFileName,
  resolveVolumeOptions,
  volumeId,
  volumePrefix,
  writePrintOutputs,
  type AssetMark,
  type PrintableDocument,
  type ResolvedVolumeOptions,
  type VolumeOptions,
} from "./print.js"
import { imageSize } from "./image-size.js"
import { buildStyles, escapeHtml } from "./design/styles.js"
import {
  ANNOTATION_SCRIPT,
  ANNOTATION_STYLESHEET,
  THEME_SCRIPT,
  annotationRuntimeFiles,
  assignBlockIds,
  documentMetadata,
  injectAnnotationAssets,
  injectThemeScript,
  siteId,
  themeRuntimeFile,
} from "./annotations/site.js"
export { buildStyles, siteStyles } from "./design/styles.js"
export {
  ANNOTATION_SCRIPT,
  ANNOTATION_STYLESHEET,
  CONTENT_SECURITY_POLICY,
  THEME_SCRIPT,
} from "./annotations/site.js"
export {
  ANNOTATION_CONTEXT,
  EMBEDDED_DATA_ID,
  FRAGMENT_KEY,
  parseCollection,
  type Annotation,
  type AnnotationCollection,
} from "./annotations/model.js"
export {
  buildExport,
  type ExportDiagnostic,
  type ExportFormat,
  type ExportGranularity,
  type ExportOptions,
  type ExportResult,
} from "./export.js"
export { type PdfOptions } from "./pdf.js"
export { type DocxComponentRenderer, type DocxWriterOptions } from "./docx.js"
export { type VolumeOptions } from "./print.js"
export {
  designTokens,
  resolveTokens,
  type DesignTokens,
  type DesignTokenOverrides,
} from "./design/tokens.js"
export {
  resolvePageGeometry,
  resolvePageOptions,
  type PageGeometry,
  type PageOptions,
  type ResolvedGeometry,
  type ResolvedPageOptions,
  type RunningText,
} from "./design/page.js"
export type { SiteLinkMode } from "./links.js"

export type SiteOptions = DocumentOptions & {
  /** One directory at the top of the library; the shorthand for `roots: [{ dir }]`. */
  sourceRoot?: string
  /**
   * Where the documents live, each directory under its base. Exactly one of
   * `sourceRoot` and `roots` is given, and with `library` it has to name the
   * roots the library was collected with.
   */
  roots?: SourceRoot[]
  /** Collection-only: files that are not documents. See `buildDocuments`. */
  exclude?: string[]
  /** Collection-only: documents collected but never exported. See `buildDocuments`. */
  private?: string[]
  /**
   * Root-relative path prefixes another application serves on the same
   * host, such as `/sdk`. A link into one stays as written under every policy.
   */
  externalPaths?: string[]
  outDir: string
  title?: string
  navigation?: string[]
  /**
   * A stylesheet appended after the built-in one. Presentation for the HTML
   * output only; use `tokens` for a change every format should follow.
   */
  css?: string
  /** Design token overrides, read by every output format. */
  tokens?: DesignTokenOverrides
  /** Paper, margins, running header and footer, and page-break rules for the paginated outputs. */
  page?: PageOptions
  /** The bound file: its name, cover and contents. */
  volume?: VolumeOptions
  libraryDir?: string
  /** Reuse an existing collected host library without recompiling or writing to it. */
  library?: string
  links?: SiteLinkMode
  /** Deployment URL, including any site base path. Required for links: "host". */
  hostUrl?: string
  /** Additional URL-root asset directories, such as a host's static/ or public/. */
  assetDirs?: string[]
  renderOptions?: RenderOptions
  /**
   * Ship the review-note runtime on every page, so a reader can select text
   * or a block, leave notes and hand them back as a file. Off by default: the
   * default output carries no script.
   */
  annotations?: boolean
  /**
   * Add a header button that cycles the colour scheme through system, light
   * and dark and remembers the choice in the browser. Off by default: without
   * it the stylesheet follows the system setting and no script is loaded.
   */
  themeSwitch?: boolean
}

/**
 * What a hyperlink points at under the output's link policy, before any format
 * has decided how to spell it. The site, the print HTML and the Word writer
 * each spell the same target their own way, which is what keeps the policy
 * identical across the three.
 */
export type LinkTarget =
  | { kind: "external"; url: string }
  /** A fragment of the current document. `hosted` is set under the host policy. */
  | { kind: "fragment"; anchor: string; hosted?: string }
  /** Another collected document, with the fragment split out of the suffix. */
  | {
      kind: "document"
      id: string
      anchor: string
      suffix: string
      hosted?: string
    }
  /** A local file: copied to `asset` (root-relative) under the relative policy, or `hosted`. */
  | { kind: "local"; asset?: string; suffix: string; hosted?: string }

/** @internal The paginated formats run inside the same publish transaction. */
export type StagingContext = {
  staging: string
  documents: PrintableDocument[]
  order: string[]
  titles: Map<string, string>
  title: string
  tokens: DesignTokens
  page: ResolvedPageOptions
  /** Resolved volume options, with the cover image as an absolute source path. */
  volume: ResolvedVolumeOptions
  links: SiteLinkMode
  /** Callout types registered at collection, beyond the built-in five. */
  calloutTypes?: string[]
  linkTarget: (url: string, doc: StoredDocument) => LinkTarget
  /** A root-relative output path seen from a document's own file, or from the root. */
  assetLink: (asset: string, from?: StoredDocument) => string
  resolveAsset: (url: string, doc: StoredDocument) => string | null
}

/** @internal */
export type InternalOptions = SiteOptions & {
  afterStaging?: (context: StagingContext) => Promise<void>
}

export type SiteResult = {
  outDir: string
  documentCount: number
  libraryDir: string
}

const COVER_IMAGE_TYPES = ["png", "jpg", "gif", "bmp"]

export function buildSite(options: SiteOptions): SiteResult
/** @internal Returns a promise exactly when the staging hook is asynchronous. */
export function buildSite(options: InternalOptions): Promise<SiteResult>
export function buildSite({
  sourceRoot,
  roots: givenRoots,
  externalPaths = [],
  outDir,
  title = "Documentation",
  navigation,
  css,
  tokens,
  page: pageOptions,
  volume: volumeOptions,
  afterStaging,
  libraryDir = path.join(path.dirname(outDir), ".cudoc", "documents"),
  library: existingLibrary,
  links = "relative",
  hostUrl,
  assetDirs = [],
  renderOptions,
  annotations = false,
  themeSwitch = false,
  ...options
}: InternalOptions) {
  const deployment = deploymentUrl(links, hostUrl)
  if (typeof annotations !== "boolean")
    throw new Error("cudoc-export: annotations must be true or false")
  if (typeof themeSwitch !== "boolean")
    throw new Error("cudoc-export: themeSwitch must be true or false")
  if (
    !Array.isArray(externalPaths) ||
    externalPaths.some((prefix) => typeof prefix !== "string" || !prefix)
  )
    throw new Error("cudoc-export: externalPaths must contain path prefixes")
  const roots = resolveRoots({ sourceRoot, roots: givenRoots })
  if (
    existingLibrary !== undefined &&
    (typeof existingLibrary !== "string" || !existingLibrary)
  )
    throw new Error(
      "cudoc-export: library must be a collected library directory",
    )
  if (
    !Array.isArray(assetDirs) ||
    assetDirs.some((dir) => typeof dir !== "string" || !dir)
  )
    throw new Error("cudoc-export: assetDirs must contain directory paths")
  libraryDir = existingLibrary ?? libraryDir
  const output = realPath(outDir)
  for (const input of [
    ...roots.map((root) => root.dir),
    libraryDir,
    ...assetDirs,
  ]) {
    const resolved = realPath(input)
    if (contained(resolved, output) || contained(output, resolved))
      throw new Error(
        "cudoc-export: site output overlaps source, library or asset directory",
      )
  }
  if (existingLibrary && Object.keys(options).length)
    throw new Error(
      "cudoc-export: syntax/compiler options belong to collection when reusing a library",
    )
  const page = resolvePageOptions(pageOptions)
  const resolvedTokens = resolveTokens(tokens)
  const library = existingLibrary
    ? loadLibrary(existingLibrary, undefined, roots)
    : buildDocuments({
        ...options,
        host: "html",
        roots,
        outDir: libraryDir,
      })
  // Private documents stay in the library, so an embed can still copy from
  // one, and are absent from everything the site is made of.
  const exported = library.documents.filter((doc) => !doc.private)
  const targets = createTargets(library, deployment)
  const localRoots = {
    roots,
    assetDirs,
    withoutBase: targets.withoutBase,
    externalPaths,
  }
  const ids = exported.map((d) => d.id)
  if (!ids.length) throw new Error("cudoc-export: no documents found")
  for (const id of navigation ?? [])
    if (!ids.includes(id))
      throw new Error(`cudoc-export: unknown navigation document ${id}`)
  const order = [...new Set([...(navigation ?? []), ...ids])]
  const volume = resolveVolumeOptions(volumeOptions, ids)
  // The cover image is validated before anything is written: every format
  // has to be able to carry it, and Word takes only these four rasters.
  let cover: { source: string; name: string } | undefined
  if (volume.cover && volume.cover.image) {
    const source = path.resolve(volume.cover.image)
    if (!fs.existsSync(source))
      throw new Error(
        `cudoc-export: volume.cover.image not found: ${volume.cover.image}`,
      )
    const size = imageSize(fs.readFileSync(source))
    if (!size)
      throw new Error(
        `cudoc-export: volume.cover.image must be a PNG, JPEG, GIF or BMP file so every format can carry it: ${volume.cover.image}`,
      )
    cover = { source, name: `cudoc-cover.${size.type}` }
    volume.cover = { image: source }
  }
  const titles = new Map(
    exported.map((doc) => [
      doc.id,
      String(
        doc.frontmatter.title ??
          // A badge is decoration on the heading, not part of the document's
          // name, so it must not reach a page title or a running header.
          visibleHeadingText(
            (doc.tree.children.find((n) => n.type === "heading") ?? {
              type: "text",
              value: doc.id,
            }) as unknown as DocumentNode,
          ),
      ),
    ]),
  )
  const documentMap = new Map(exported.map((doc) => [doc.id, doc]))
  const outputPath = (id: string) => `${id}.html`
  const relativeLink = (from: string, to: string) =>
    posix(path.posix.relative(path.posix.dirname(outputPath(from)), to)) ||
    path.posix.basename(to)
  const assetLink = (asset: string, from?: StoredDocument) =>
    from ? relativeLink(from.id, asset) : asset
  // Every file a build can write, so a copied asset can never land on one.
  const reservedOutputs = new Set(
    [
      "cudoc.css",
      "index.html",
      ".cudoc-output",
      ANNOTATION_SCRIPT,
      ANNOTATION_STYLESHEET,
      THEME_SCRIPT,
      PRINT_STYLESHEET,
      ...COVER_IMAGE_TYPES.map((type) => `cudoc-cover.${type}`),
      ...ids.flatMap((id) => [
        outputPath(id),
        printFileName(id),
        `${id}.pdf`,
        `${id}.docx`,
      ]),
      printFileName(volume.fileName),
      `${volume.fileName}.pdf`,
      `${volume.fileName}.docx`,
    ].map((name) => name.toLowerCase()),
  )
  const printable: PrintableDocument[] = []
  // The runtime is looked up before anything is written, so a package built
  // without it fails here rather than after the site is on disk.
  const runtime = annotations ? annotationRuntimeFiles() : undefined
  const theme = themeSwitch ? themeRuntimeFile() : undefined
  const generator = `cudoc-export ${
    (createRequire(import.meta.url)("../package.json") as { version: string })
      .version
  }`
  const site = siteId(title, order)
  const published = publishDirectory(
    roots.map((root) => root.dir),
    outDir,
    (staging) => {
      const copied = new Map<string, string>()
      /**
       * Copies a local file into the output and returns its root-relative path,
       * or null for a URL that turns out to be external after all.
       */
      const copyAsset = (
        url: string,
        doc: StoredDocument,
      ): { asset: string; suffix: string } | null => {
        const target = resolveLocalTarget(url, doc.sourcePath, localRoots)
        if (target.kind === "external") return null
        // A link reaching outside every root resolves to nothing, and the error
        // below names the link and the document carrying it, which is what an
        // author needs to fix it.
        if (target.kind === "missing")
          throw new Error(
            `cudoc-export: missing local target ${url} in ${doc.id}; check the collection roots and assetDirs`,
          )
        const asset = target.relative
        if (reservedOutputs.has(asset.toLowerCase()))
          throw new Error(
            `cudoc-export: asset collides with generated output: ${asset}`,
          )
        const previous = copied.get(asset.toLowerCase())
        if (previous && previous !== fs.realpathSync(target.source))
          throw new Error(
            `cudoc-export: different assets share output path: ${asset}`,
          )
        const destination = safePath(staging, asset)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(target.source, destination)
        copied.set(asset.toLowerCase(), fs.realpathSync(target.source))
        return { asset, suffix: target.suffix }
      }
      const fragmentOf = (suffix: string) => {
        const hash = suffix.indexOf("#")
        return hash === -1 ? "" : suffix.slice(hash + 1)
      }
      const linkTarget = (url: string, doc: StoredDocument): LinkTarget => {
        if (externalUrl(url) || isExternalPath(url, externalPaths))
          return { kind: "external", url }
        const hosted = links === "host"
        if (url.startsWith("#"))
          return {
            kind: "fragment",
            anchor: url.slice(1),
            ...(hosted
              ? { hosted: `${hostedRoute(doc.route, deployment!)}${url}` }
              : {}),
          }
        const target = targets.find(url, doc)
        // The page is on the host but not in this output: a relative link
        // would point at nothing, and copying the source would publish it.
        if (target.document?.private && !hosted)
          throw new Error(
            `cudoc-export: ${doc.id} links to private document ${target.document.id}, which is not exported`,
          )
        if (target.document)
          return {
            kind: "document",
            id: target.document.id,
            anchor: fragmentOf(target.suffix),
            suffix: target.suffix,
            ...(hosted
              ? {
                  hosted: `${hostedRoute(target.document.route, deployment!)}${target.suffix}`,
                }
              : {}),
          }
        if (hosted)
          return {
            kind: "local",
            suffix: "",
            hosted: url.startsWith("/")
              ? hostedRoute(url, deployment!)
              : new URL(url, hostedRoute(doc.route, deployment!)).href,
          }
        // Under hyperlink removal nothing is resolved or copied for a link.
        if (links === "none") return { kind: "local", suffix: "" }
        const copied = copyAsset(url, doc)
        return copied ? { kind: "local", ...copied } : { kind: "external", url }
      }
      /** The site's spelling of a target: pages beside pages, from the document's directory. */
      const siteLink = (url: string, doc: StoredDocument): string => {
        const target = linkTarget(url, doc)
        switch (target.kind) {
          case "external":
            return target.url
          case "fragment":
            return target.hosted ?? `#${target.anchor}`
          case "document":
            return (
              target.hosted ??
              `${relativeLink(doc.id, outputPath(target.id))}${target.suffix}`
            )
          case "local":
            return (
              target.hosted ??
              (target.asset
                ? `${relativeLink(doc.id, target.asset)}${target.suffix}`
                : url)
            )
        }
      }
      /**
       * The print HTML's spelling. Inside the volume every collected document is
       * present, so a link to one becomes a fragment; in a per-document file it
       * names the sibling PDF, without a fragment, as the Word file names the
       * sibling `.docx`. A fragment stays in the file under every policy: the
       * target is on a later page, not on a website.
       */
      const printLink = (
        url: string,
        doc: StoredDocument,
        bound: boolean,
      ): string => {
        const target = linkTarget(url, doc)
        switch (target.kind) {
          case "external":
            return target.url
          case "fragment":
            return bound
              ? `#${volumePrefix(doc.id)}${target.anchor}`
              : `#${target.anchor}`
          case "document":
            if (bound)
              return `#${volumeId(target.id)}${target.anchor ? `-${target.anchor}` : ""}`
            return target.hosted ?? relativeLink(doc.id, `${target.id}.pdf`)
          case "local":
            return (
              target.hosted ??
              (target.asset
                ? `${bound ? target.asset : relativeLink(doc.id, target.asset)}${target.suffix}`
                : url)
            )
        }
      }
      const writePage = (page: string, doc: StoredDocument) => {
        const tree = fromHtml(page)
        rewritePageLinks(tree, links, (url) => siteLink(url, doc))
        // After the link rewrite, so the policy never touches these two tags.
        if (runtime)
          injectAnnotationAssets(tree, {
            script: relativeLink(doc.id, ANNOTATION_SCRIPT),
            stylesheet: relativeLink(doc.id, ANNOTATION_STYLESHEET),
          })
        if (theme) injectThemeScript(tree, relativeLink(doc.id, THEME_SCRIPT))
        const output = safePath(staging, outputPath(doc.id))
        fs.mkdirSync(path.dirname(output), { recursive: true })
        fs.writeFileSync(output, toHtml(tree))
      }
      fs.writeFileSync(
        path.join(staging, "cudoc.css"),
        buildStyles(resolvedTokens) +
          (css ? `\n${fs.readFileSync(css, "utf8")}` : ""),
      )
      if (cover) fs.copyFileSync(cover.source, path.join(staging, cover.name))
      if (runtime) {
        fs.copyFileSync(runtime.script, path.join(staging, ANNOTATION_SCRIPT))
        fs.copyFileSync(
          runtime.stylesheet,
          path.join(staging, ANNOTATION_STYLESHEET),
        )
      }
      if (theme) fs.copyFileSync(theme, path.join(staging, THEME_SCRIPT))
      for (const doc of exported) {
        const tree = existingLibrary
          ? preparedDocument(doc, libraryDir)
          : resolveDocumentEmbeds(library, doc.id)
        const html = renderDocument(tree, {
          highlight(code, language) {
            const value =
              language && hljs.getLanguage(language)
                ? hljs.highlight(code, { language }).value
                : escapeHtml(code)
            return `<pre><code class="hljs${language ? ` language-${escapeHtml(language)}` : ""}">${value}</code></pre>`
          },
          ...renderOptions,
        })
        const hast = fromHtml(html, { fragment: true })
        const rewrite = (node: HastRoot | RootContent) => {
          if (node.type === "element") {
            // Hyperlinks are handled on the complete page; keep rendering
            // resources local. The path is recorded root-relative and marked,
            // so each output re-expresses it from its own location.
            for (const key of [
              "src",
              ...(node.tagName === "link" ? ["href"] : []),
            ]) {
              const url = node.properties[key]
              if (typeof url !== "string" || externalUrl(url)) continue
              const copied = copyAsset(url, doc)
              if (!copied) continue
              const mark: AssetMark = { key, ...copied }
              node.properties[key] = `${mark.asset}${mark.suffix}`
              node.data = { ...node.data, cudocAsset: mark } as typeof node.data
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
              `<li><a href="${escapeHtml(relativeLink(doc.id, documentMap.get(id)!.sourcePath))}"${id === doc.id ? ' aria-current="page"' : ""}>${escapeHtml(titles.get(id)!)}</a></li>`,
          )
          .join("")
        const toc = headings
          .map(
            (node) =>
              `<li data-depth="${node.depth}"><a href="#${escapeHtml(String(node.data?.hProperties?.id ?? ""))}">${escapeHtml(visibleHeadingText(node))}</a></li>`,
          )
          .join("")
        const body = structuredClone(hast)
        localizeAssets(body, (asset) => relativeLink(doc.id, asset))
        // Block ids and the version pins go on the site page only; the shared
        // `hast` feeds the print outputs, which stay as they were.
        if (annotations) assignBlockIds(body)
        const metadata = documentMetadata(doc)
        const mainAttributes = annotations
          ? ` data-cudoc-document="${escapeHtml(doc.id)}" data-cudoc-ast-hash="${metadata.astHash}" data-cudoc-source-hash="${metadata.sourceHash}" data-cudoc-site="${site}" data-cudoc-generator="${escapeHtml(generator)}"`
          : ""
        const page = `<!doctype html><html lang="${escapeHtml(String(doc.frontmatter.lang ?? "en"))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titles.get(doc.id)!)} · ${escapeHtml(title)}</title><link rel="stylesheet" href="${escapeHtml(relativeLink(doc.id, "cudoc.css"))}"></head><body>${links === "relative" ? '<a class="skip" href="#main-content">Skip to content</a>' : ""}<header><a href="${escapeHtml(relativeLink(doc.id, documentMap.get(order[0])!.sourcePath))}">${escapeHtml(title)}</a></header><div class="layout"><nav class="sidebar" aria-label="Documents"><p class="nav-title">Documents</p><ul>${nav}</ul></nav><main id="main-content"${mainAttributes}>${toHtml(body)}<footer>${escapeHtml(title)}</footer></main><nav class="toc" aria-label="On this page"><p class="nav-title">On this page</p><ul>${toc}</ul></nav></div></body></html>`
        writePage(page, doc)
        printable.push({ doc, tree, hast, headings })
      }
      if (!documentMap.has("index")) {
        const index = {
          ...exported[0],
          id: "index",
          sourcePath: "index.md",
          route: "/",
        }
        writePage(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="cudoc.css"></head><body><header>${escapeHtml(title)}</header><main class="landing"><h1>${escapeHtml(title)}</h1><nav aria-label="Documents"><ul>${order.map((id) => `<li><a href="${escapeHtml(documentMap.get(id)!.sourcePath)}">${escapeHtml(titles.get(id)!)}</a></li>`).join("")}</ul></nav></main></body></html>`,
          index,
        )
      }
      writePrintOutputs({
        staging,
        documents: printable,
        title,
        order,
        titles,
        tokens: resolvedTokens,
        page,
        links,
        volume,
        coverImage: cover?.name,
        assetLink,
        resolveLink: printLink,
      })
      if (afterStaging)
        return afterStaging({
          staging,
          documents: printable,
          order,
          titles,
          title,
          tokens: resolvedTokens,
          page,
          volume,
          links,
          calloutTypes: library.options.calloutTypes,
          linkTarget,
          assetLink,
          resolveAsset: (url, doc) => {
            const target = resolveLocalTarget(url, doc.sourcePath, localRoots)
            return target.kind === "resolved" ? target.source : null
          },
        })
      return undefined
    },
  )
  const result: SiteResult = {
    outDir: path.resolve(outDir),
    documentCount: exported.length,
    libraryDir: path.resolve(libraryDir),
  }
  // The publish is asynchronous exactly when the staging hook is, and the
  // caller must not see the output directory before it has been committed.
  return (
    (published as unknown as Promise<void> | undefined)?.then
      ? (published as unknown as Promise<void>).then(() => result)
      : result
  ) as SiteResult & Promise<SiteResult>
}
