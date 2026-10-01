import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import hljs from "highlight.js"
import type { Root as HastRoot, RootContent, Element } from "hast"
import type { DocumentOptions, DocumentNode } from "@cudoment/cudoc/document"
import { visibleHeadingText } from "@cudoment/cudoc/document"
import {
  buildDocuments,
  loadLibrary,
  resolveRoots,
  sourceFileOf,
  type BuildDocumentsOptions,
  type SourceRoot,
  type StoredDocument,
} from "@cudoment/cudoc/node/library"
import { resolveDocumentEmbeds } from "@cudoment/cudoc/node/resolve-embed"
import { isExternalPath, parseSrcSet } from "@cudoment/cudoc/node/local-target"
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
  decodeComponent,
  deploymentUrl,
  hostedRoute,
  rewritePageLinks,
  externalUrl,
  type RewrittenLink,
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
  srcSetCandidate,
  urlPath,
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
  inlineAnnotationAssets,
  inlineThemeScript,
  siteId,
  themeRuntimeFile,
} from "./annotations/site.js"
import { LIMITS } from "./annotations/model.js"
import {
  builtInStrings,
  resolveLocales,
  type LocaleOption,
  type UiStrings,
} from "./locales.js"
import type {
  NavEntry,
  NavigationDiagnostic,
  NavigationOption,
  NavigationTitle,
} from "./navigation.js"
import { planOutput, type HtmlMode, type OmittedDocument } from "./plan.js"
import { createResources, dataUrl, fileIdentity, within } from "./resources.js"
import {
  rewriteStylesheet,
  scriptText,
  styleText,
  stylesheetAsset,
  stylesheetFileAsset,
} from "./stylesheets.js"
import {
  renderLanding,
  renderShell,
  type ShellLanguage,
  type ShellLink,
  type ShellNavItem,
} from "./design/shell.js"
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
  type PageLength,
  type PageOptions,
  type ResolvedGeometry,
  type ResolvedPageOptions,
  type RunningText,
} from "./design/page.js"
export type { SiteLinkMode } from "./links.js"
export type { HtmlMode, OmittedDocument } from "./plan.js"
export type { LocaleOption, UiStrings } from "./locales.js"
export type {
  NavigationDiagnostic,
  NavigationItem,
  NavigationOption,
  NavigationSpec,
  NavigationTitle,
} from "./navigation.js"

/**
 * The attributes that load a rendering resource, by element: an image, a
 * video's poster, an embedded object, a stylesheet, an SVG image. Hyperlinks
 * are not among them; the link policy owns those.
 */
const assetAttributes = (tagName: string): string[] => [
  "src",
  ...(tagName === "video" ? ["poster"] : []),
  ...(tagName === "object" ? ["data"] : []),
  ...(tagName === "link" ? ["href"] : []),
  ...(["image", "use", "feImage"].includes(tagName)
    ? ["href", "xLinkHref"]
    : []),
]

/** Elements whose resource a standalone page carries as a `data:` URL. */
const INLINE_ELEMENTS = new Set(["img", "image", "feImage", "input", "link"])

/** The review-note runtime's options, for `mode: "annotate"`. */
export type AnnotateOptions = {
  /**
   * `file`: every document one page that carries the runtime, to send as a
   * file. `hosted`: a site with the runtime beside it, for a static host.
   */
  target?: "file" | "hosted"
  /**
   * Names this review in the reader's browser storage. Required for `hosted`,
   * where sites on one host share an origin.
   */
  reviewId?: string
  /** Where readers can send their notes from the page. `hosted` only. */
  inbox?: { github: { repo: string; template: string; field?: string } }
}

export type StandaloneOptions = {
  /** The largest one resource may be once written inline. Defaults to 5 MiB. */
  maxAssetBytes?: number
  /** The largest a page may be. Defaults to 20 MiB, and is at most 28 MiB. */
  maxPageBytes?: number
}

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
  /**
   * How the pages are written: `site`, pages that share stylesheets and
   * navigation; `standalone`, one page per document carrying everything it
   * needs; `annotate`, pages with the review-note runtime.
   */
  mode?: HtmlMode
  annotate?: AnnotateOptions
  /** The documents a standalone or annotate-file run writes, by id or file name. */
  documents?: string[]
  /** Fails a standalone page that needs anything outside itself. */
  strict?: boolean
  standalone?: StandaloneOptions
  /** The document the site opens on, by file name, such as `README.md`. */
  home?: string
  /** Links in the header, beside the site title. */
  header?: { links?: { title: NavigationTitle; url: string }[] }
  /**
   * The documents the site lists on the left and publishes: a YAML file, or
   * entries written here. Without it, every document, by folder.
   */
  navigation?: NavigationOption
  /**
   * The languages the documents are written in, the default first, each
   * found by a file-name suffix: `{ en: "English", ko: "한국어" }`.
   */
  locales?: Record<string, LocaleOption>
  /** The contents of the page on the right; `false` for none. */
  toc?: false | { depth?: number }
  /**
   * Stylesheets loaded after the built-in one. A site links each file; a
   * standalone page carries its text. HTML only: use `tokens` for a change
   * every format should follow.
   */
  css?: string | string[]
  /**
   * Links to files that are neither documents nor in the output: a link
   * whose target exists under `root`, in the library's coordinates, becomes
   * `url` followed by that path, under `relative` and `host` alike.
   */
  sourceLinks?: { root: string; url: string }
  /**
   * Directories copied into the output as they are. A link into `from`
   * points at its copy under `to`. A site with `relative` links only.
   */
  mounts?: { from: string; to: string }[]
  /** Design token overrides, read by every output format. */
  tokens?: DesignTokenOverrides
  /** Paper, margins, running header and footer, and page-break rules for the paginated outputs. */
  page?: PageOptions
  /** The bound file: its name, cover, contents and order. */
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
   * Add a header control that chooses the colour scheme, system, light or
   * dark, remembered in the browser. Off by default: without it the
   * stylesheet follows the system setting and no script is loaded.
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
  /** The bound volume's documents, in order. */
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
  /** A document's site page, root-relative: what the volume links when it does not bind the document. */
  pagePath: (id: string) => string
  resolveAsset: (url: string, doc: StoredDocument) => string | null
}

/** @internal */
export type InternalOptions = SiteOptions & {
  afterStaging?: (context: StagingContext) => Promise<void>
  /** Write the print HTML even on single pages, because a PDF is printed from it. */
  printOutputs?: boolean
}

/** Something a page needs from outside itself, reported because it was asked to need nothing. */
export type SiteDependency = {
  kind: "remote" | "file" | "page"
  document: string
  url: string
}

export type SiteDiagnostic = NavigationDiagnostic

export type SiteResult = {
  outDir: string
  documentCount: number
  libraryDir: string
  /** The files the HTML output wrote, relative to `outDir`: pages, stylesheets and scripts. */
  files: string[]
  diagnostics: SiteDiagnostic[]
  /** On single pages: what a page loads or links from outside itself. */
  dependencies: SiteDependency[]
  /** The documents the site does not publish, and why. */
  omitted: OmittedDocument[]
}

const COVER_IMAGE_TYPES = ["png", "jpg", "gif", "bmp"]

/**
 * Every key the builder reads, so a mistyped or retired one is an error
 * rather than an option that silently does nothing. The collection keys are
 * checked against `buildDocuments`' own type, so a new collection option
 * cannot be forgotten here.
 */
const COLLECTION_KEYS = {
  syntax: true,
  host: true,
  format: true,
  calloutTypes: true,
  components: true,
  tableColumnLayout: true,
  tableColumnWidths: true,
  headingIds: true,
  ignoreDiagnostics: true,
  sourceRoot: true,
  roots: true,
  exclude: true,
  private: true,
  extractors: true,
  outDir: true,
  routeBase: true,
  routeSuffix: true,
  routes: true,
  compiler: true,
  compilerId: true,
  previous: true,
} satisfies Record<keyof BuildDocumentsOptions, true>

const SITE_KEYS = {
  ...COLLECTION_KEYS,
  externalPaths: true,
  title: true,
  mode: true,
  annotate: true,
  documents: true,
  strict: true,
  standalone: true,
  home: true,
  header: true,
  navigation: true,
  locales: true,
  toc: true,
  css: true,
  sourceLinks: true,
  mounts: true,
  tokens: true,
  page: true,
  volume: true,
  libraryDir: true,
  library: true,
  links: true,
  hostUrl: true,
  assetDirs: true,
  renderOptions: true,
  themeSwitch: true,
  afterStaging: true,
  printOutputs: true,
} satisfies Record<keyof InternalOptions, true>

function checkKeys(options: object): void {
  for (const key of Object.keys(options)) {
    if (key === "annotations")
      throw new Error(
        'cudoc-export: annotations was replaced by mode: "annotate" (annotate: { target: "file" } for one page per document, "hosted" for a site)',
      )
    if (!(key in SITE_KEYS))
      throw new Error(`cudoc-export: unknown option ${key}`)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

/** Resolves a title written once or per language. */
const titleIn = (
  title: NavigationTitle,
  code: string,
  fallback: string,
): string =>
  typeof title === "string"
    ? title
    : (title[code] ?? title[fallback] ?? Object.values(title)[0]!)

export function buildSite(options: SiteOptions): SiteResult
/** @internal Returns a promise exactly when the staging hook is asynchronous. */
export function buildSite(options: InternalOptions): Promise<SiteResult>
export function buildSite(input: InternalOptions) {
  checkKeys(input)
  const {
    sourceRoot,
    roots: givenRoots,
    externalPaths = [],
    outDir,
    title = "Documentation",
    mode = "site",
    annotate = {},
    documents: selection,
    strict = false,
    standalone: standaloneOptions = {},
    home,
    header = {},
    navigation,
    locales: localeOptions,
    toc: tocOption = {},
    css,
    sourceLinks,
    mounts = [],
    tokens,
    page: pageOptions,
    volume: volumeOptions,
    afterStaging,
    printOutputs = false,
    libraryDir: givenLibraryDir,
    library: existingLibrary,
    links = "relative",
    hostUrl,
    assetDirs = [],
    renderOptions,
    themeSwitch = false,
    ...options
  } = input
  let libraryDir =
    givenLibraryDir ?? path.join(path.dirname(outDir), ".cudoc", "documents")
  const deployment = deploymentUrl(links, hostUrl)
  if (!["site", "standalone", "annotate"].includes(mode))
    throw new Error(
      `cudoc-export: mode must be "site", "standalone" or "annotate", got ${JSON.stringify(mode)}`,
    )
  if (!isRecord(annotate))
    throw new Error("cudoc-export: annotate is { target, reviewId, inbox }")
  for (const key of Object.keys(annotate))
    if (!["target", "reviewId", "inbox"].includes(key))
      throw new Error(
        `cudoc-export: annotate has an unknown key ${key}; it takes target, reviewId and inbox`,
      )
  const target = annotate.target ?? "file"
  if (!["file", "hosted"].includes(target))
    throw new Error('cudoc-export: annotate.target must be "file" or "hosted"')
  if (mode !== "annotate" && Object.keys(annotate).length)
    throw new Error('cudoc-export: annotate applies to mode: "annotate"')
  if (
    annotate.reviewId !== undefined &&
    (typeof annotate.reviewId !== "string" ||
      !/^[A-Za-z0-9][\w.-]{0,63}$/.test(annotate.reviewId))
  )
    throw new Error(
      "cudoc-export: annotate.reviewId is up to 64 letters, digits, dots, dashes and underscores",
    )
  if (mode === "annotate" && target === "hosted" && !annotate.reviewId)
    throw new Error(
      'cudoc-export: annotate.target "hosted" needs annotate.reviewId: sites on one host share browser storage, and the id keeps their notes apart',
    )
  const inbox = annotate.inbox
  if (inbox !== undefined) {
    if (target !== "hosted")
      throw new Error('cudoc-export: annotate.inbox applies to target "hosted"')
    const github = isRecord(inbox) ? inbox.github : undefined
    if (
      !isRecord(github) ||
      Object.keys(inbox).some((key) => key !== "github") ||
      typeof github.repo !== "string" ||
      !/^[\w.-]+\/[\w.-]+$/.test(github.repo) ||
      typeof github.template !== "string" ||
      !/^[\w.-]+\.ya?ml$/.test(github.template) ||
      (github.field !== undefined &&
        (typeof github.field !== "string" || !/^[\w-]+$/.test(github.field))) ||
      Object.keys(github).some(
        (key) => !["repo", "template", "field"].includes(key),
      )
    )
      throw new Error(
        "cudoc-export: annotate.inbox is { github: { repo: owner/name, template: an issue form file name, field?: the form field id } }",
      )
  }
  const singlePages =
    mode === "standalone" || (mode === "annotate" && target === "file")
  const annotations = mode === "annotate"
  if (typeof strict !== "boolean")
    throw new Error("cudoc-export: strict must be true or false")
  if (strict && !singlePages)
    throw new Error(
      "cudoc-export: strict applies to single pages: standalone, or annotate with the file target",
    )
  if (typeof themeSwitch !== "boolean")
    throw new Error("cudoc-export: themeSwitch must be true or false")
  if (!isRecord(standaloneOptions))
    throw new Error(
      "cudoc-export: standalone is { maxAssetBytes, maxPageBytes }",
    )
  for (const key of Object.keys(standaloneOptions))
    if (!["maxAssetBytes", "maxPageBytes"].includes(key))
      throw new Error(`cudoc-export: standalone has an unknown key ${key}`)
  const pageLimit = LIMITS.htmlBytes - LIMITS.fileBytes - 2 * 1024 * 1024
  const maxAssetBytes = standaloneOptions.maxAssetBytes ?? 5 * 1024 * 1024
  const maxPageBytes = standaloneOptions.maxPageBytes ?? 20 * 1024 * 1024
  for (const [key, value] of [
    ["maxAssetBytes", maxAssetBytes],
    ["maxPageBytes", maxPageBytes],
  ] as const)
    if (!Number.isInteger(value) || value <= 0 || value > pageLimit)
      throw new Error(
        `cudoc-export: standalone.${key} is a whole number of bytes up to ${pageLimit}`,
      )
  if (
    tocOption !== false &&
    (!isRecord(tocOption) ||
      Object.keys(tocOption).some((key) => key !== "depth") ||
      (tocOption.depth !== undefined &&
        (!Number.isInteger(tocOption.depth) ||
          tocOption.depth < 2 ||
          tocOption.depth > 6)))
  )
    throw new Error(
      "cudoc-export: toc is false or { depth }, the deepest heading level listed, 2 to 6",
    )
  const tocDepth = tocOption === false ? 0 : (tocOption.depth ?? 6)
  if (!isRecord(header) || Object.keys(header).some((key) => key !== "links"))
    throw new Error("cudoc-export: header is { links }")
  const headerLinks = header.links ?? []
  if (
    !Array.isArray(headerLinks) ||
    headerLinks.some(
      (link) =>
        !isRecord(link) ||
        typeof link.url !== "string" ||
        !/^(?:https?:|mailto:)/i.test(link.url) ||
        (typeof link.title !== "string" && !isRecord(link.title)) ||
        Object.keys(link).some((key) => !["title", "url"].includes(key)),
    )
  )
    throw new Error(
      "cudoc-export: header.links is a list of { title, url } with absolute http(s) or mailto addresses",
    )
  const cssFiles = css === undefined ? [] : Array.isArray(css) ? css : [css]
  for (const file of cssFiles)
    if (typeof file !== "string" || !file || !fs.existsSync(file))
      throw new Error(`cudoc-export: css file not found: ${String(file)}`)
  let sourceBase: { root: string; url: string } | undefined
  if (sourceLinks !== undefined) {
    if (
      !isRecord(sourceLinks) ||
      typeof sourceLinks.root !== "string" ||
      typeof sourceLinks.url !== "string" ||
      Object.keys(sourceLinks).some((key) => !["root", "url"].includes(key))
    )
      throw new Error("cudoc-export: sourceLinks is { root, url }")
    if (
      !fs.existsSync(sourceLinks.root) ||
      !fs.statSync(sourceLinks.root).isDirectory()
    )
      throw new Error(
        `cudoc-export: sourceLinks.root is not a directory: ${sourceLinks.root}`,
      )
    let url: URL
    try {
      url = new URL(sourceLinks.url)
    } catch {
      throw new Error(
        "cudoc-export: sourceLinks.url is an absolute http(s) URL",
      )
    }
    if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash)
      throw new Error(
        "cudoc-export: sourceLinks.url is an absolute http(s) URL without query or fragment",
      )
    sourceBase = {
      root: path.resolve(sourceLinks.root),
      url: url.href.replace(/\/?$/, "/"),
    }
  }
  if (!Array.isArray(mounts))
    throw new Error("cudoc-export: mounts is a list of { from, to }")
  const mountList = mounts.map((mount) => {
    if (
      !isRecord(mount) ||
      typeof mount.from !== "string" ||
      typeof mount.to !== "string" ||
      Object.keys(mount).some((key) => !["from", "to"].includes(key))
    )
      throw new Error("cudoc-export: each mount is { from, to }")
    if (!fs.existsSync(mount.from) || !fs.statSync(mount.from).isDirectory())
      throw new Error(`cudoc-export: mount ${mount.from} is not a directory`)
    const to = mount.to
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/\/+$/, "")
    if (
      !to ||
      to.startsWith("/") ||
      to.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new Error(
        `cudoc-export: mount ${mount.from} goes to ${mount.to}, which must be a folder path inside the output`,
      )
    return { from: fs.realpathSync.native(mount.from), to }
  })
  // A mount is a folder published beside a site's pages and reached by a
  // relative link: a single page carries what it shows, and a host link
  // names the host, which has no copy of the folder.
  if (mountList.length && singlePages)
    throw new Error(
      "cudoc-export: mounts publish folders beside a site's pages; a single page carries what it shows, so mounts need mode site or annotate with the hosted target",
    )
  if (mountList.length && links !== "relative")
    throw new Error(
      `cudoc-export: mounts are reached by relative links; links: "${links}" leaves them unlinked`,
    )
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
  for (const inputDir of [
    ...roots.map((root) => root.dir),
    libraryDir,
    ...assetDirs,
    ...mountList.map((mount) => mount.from),
  ]) {
    const resolved = realPath(inputDir)
    if (contained(resolved, output) || contained(output, resolved))
      throw new Error(
        "cudoc-export: site output overlaps source, library, asset or mounted directory",
      )
  }
  // A mount is copied whole: over a root it would publish documents the
  // navigation leaves out, and its copies would collide with the assets the
  // pages carry. Two mounts may not share files or folders either.
  const inputs = [
    ...roots.map((root) => root.dir),
    libraryDir,
    ...assetDirs,
  ].map(realPath)
  for (const [index, mount] of mountList.entries()) {
    if (
      inputs.some(
        (dir) => contained(dir, mount.from) || contained(mount.from, dir),
      )
    )
      throw new Error(
        `cudoc-export: mount ${mount.from} overlaps a source, library or asset directory; mount a folder outside them`,
      )
    for (const other of mountList.slice(index + 1))
      if (
        contained(other.from, mount.from) ||
        contained(mount.from, other.from) ||
        contained(other.to, mount.to) ||
        contained(mount.to, other.to)
      )
        throw new Error(
          `cudoc-export: mounts ${mount.from} → ${mount.to} and ${other.from} → ${other.to} overlap`,
        )
  }
  if (existingLibrary && Object.keys(options).length)
    throw new Error(
      "cudoc-export: syntax/compiler options belong to collection when reusing a library",
    )
  const locales = resolveLocales(localeOptions)
  const page = resolvePageOptions(pageOptions)
  const resolvedTokens = resolveTokens(tokens)
  const library = existingLibrary
    ? loadLibrary(existingLibrary, undefined, roots)
    : buildDocuments({
        ...(options as BuildDocumentsOptions),
        host: "html",
        roots,
        outDir: libraryDir,
      })
  // The collected library holds every document's source, private ones
  // included, so nothing is copied out of it.
  const libraryPath = (() => {
    try {
      return fs.realpathSync.native(libraryDir)
    } catch {
      return path.resolve(libraryDir)
    }
  })()
  const privateFiles = new Map(
    library.documents.flatMap((doc) => {
      const file = doc.private ? sourceFileOf(roots, doc.sourcePath) : undefined
      return file && fs.existsSync(file)
        ? [[fileIdentity(file), doc.sourcePath] as const]
        : []
    }),
  )
  const targets = createTargets(library, deployment)
  const localRoots = {
    roots,
    assetDirs,
    withoutBase: targets.withoutBase,
    externalPaths,
  }
  const titles = new Map(
    library.documents.map((doc) => [
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
  const volume = resolveVolumeOptions(
    volumeOptions,
    library.documents.map((doc) => doc.id),
  )
  const plan = planOutput({
    documents: library.documents,
    locales,
    navigation,
    home,
    mode,
    singlePages,
    selection,
    volumeOrder: volume.order,
    title: (doc) => titles.get(doc.id)!,
  })
  const written = plan.written
  const publishedSet = new Set(plan.published)
  const writtenSet = new Set(written)
  const ids = plan.published.map((doc) => doc.id)
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
  if (ids.includes(volume.fileName))
    throw new Error(
      `cudoc-export: volume.fileName ${volume.fileName} is also a document id`,
    )
  const documentMap = new Map(plan.published.map((doc) => [doc.id, doc]))
  const outputPath = plan.outputPath
  const relativeTo = (fromFile: string, to: string) =>
    posix(path.posix.relative(path.posix.dirname(fromFile), to)) ||
    path.posix.basename(to)
  /** A path written from a document's own output file. */
  const fromPage = (doc: StoredDocument, to: string) =>
    relativeTo(outputPath(doc.id), to)
  /** A path written from beside the document's print file, which follows its id. */
  const fromId = (id: string, to: string) => relativeTo(`${id}.html`, to)
  const assetLink = (asset: string, from?: StoredDocument) =>
    from ? fromId(from.id, asset) : asset
  const languageCodeOf = (doc: StoredDocument) => plan.language(doc).code
  const fallbackCode = plan.codes[0]!
  const uiFor = (code: string, lang: string): UiStrings =>
    locales ? locales.byCode.get(code)!.ui : builtInStrings(lang)
  // Every file a build can write, so a copied asset can never land on one.
  const willPrint = !singlePages || printOutputs
  const reservedOutputs = new Set(
    [
      "cudoc.css",
      ".cudoc-output",
      ANNOTATION_SCRIPT,
      ANNOTATION_STYLESHEET,
      THEME_SCRIPT,
      PRINT_STYLESHEET,
      ...plan.codes.map((code) => plan.homeFile(code)),
      ...COVER_IMAGE_TYPES.map((type) => `cudoc-cover.${type}`),
      ...ids.flatMap((id) => [
        outputPath(id),
        `${id}.html`,
        printFileName(id),
        `${id}.pdf`,
        `${id}.docx`,
      ]),
      printFileName(volume.fileName),
      `${volume.fileName}.pdf`,
      `${volume.fileName}.docx`,
    ].map((name) => name.toLowerCase()),
  )
  const resources = createResources(localRoots, {
    privateFiles,
    libraryPath,
    reserved: reservedOutputs,
    reservedPrefixes: [
      "cudoc-css/",
      ...mountList.map((mount) => `${mount.to.toLowerCase()}/`),
    ],
  })
  // The runtime is looked up before anything is written, so a package built
  // without it fails here rather than after the site is on disk.
  const runtime = annotations ? annotationRuntimeFiles() : undefined
  const theme = themeSwitch ? themeRuntimeFile() : undefined
  const generator = `cudoc-export ${
    (createRequire(import.meta.url)("../package.json") as { version: string })
      .version
  }`
  const site = annotate.reviewId ?? siteId([title, ...ids])
  const inboxAttribute = inbox
    ? ` data-cudoc-inbox="${escapeHtml(JSON.stringify(inbox))}"`
    : ""
  const allowedCssDirs = [...roots.map((root) => root.dir), ...assetDirs]
  const files = new Set<string>()
  const dependencies: SiteDependency[] = []
  /** In one order wherever they are shown: by document, kind and address. */
  const sortedDependencies = () =>
    [...dependencies].sort(
      (a, b) =>
        a.document.localeCompare(b.document, "en") ||
        a.kind.localeCompare(b.kind, "en") ||
        a.url.localeCompare(b.url, "en"),
    )
  const depend = (dependency: SiteDependency) => {
    if (
      !dependencies.some(
        (known) =>
          known.kind === dependency.kind &&
          known.document === dependency.document &&
          known.url === dependency.url,
      )
    )
      dependencies.push(dependency)
  }
  const published = publishDirectory(
    roots.map((root) => root.dir),
    outDir,
    (staging) => {
      const write = (file: string, content: string | Buffer) => {
        const destination = safePath(staging, file)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.writeFileSync(destination, content)
        files.add(file)
      }
      const fragmentOf = (suffix: string) => {
        const hash = suffix.indexOf("#")
        return hash === -1 ? "" : suffix.slice(hash + 1)
      }
      /** A mounted copy of a file on disk, as an output path. */
      const mounted = (file: string): string | undefined => {
        for (const mount of mountList)
          if (within(file, mount.from)) {
            const real = fs.realpathSync.native(file)
            const relative = posix(path.relative(mount.from, real))
            return relative ? `${mount.to}/${relative}` : `${mount.to}/`
          }
        return undefined
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
        const found = targets.find(url, doc)
        const linked = found.document
        if (linked && !hosted) {
          // The page is on the host but not in this output: a relative link
          // would point at nothing, and copying the source would publish it.
          if (linked.private)
            throw new Error(
              `cudoc-export: ${doc.id} links to private document ${linked.id}, which is not exported`,
            )
          if (!publishedSet.has(linked))
            throw new Error(
              `cudoc-export: ${doc.id} links to ${linked.sourcePath}, which the site does not publish because the navigation does not list it; add it to the navigation or to hidden, or remove the link`,
            )
          if (singlePages && !writtenSet.has(linked))
            depend({ kind: "page", document: doc.id, url })
        }
        if (linked)
          return {
            kind: "document",
            id: linked.id,
            anchor: fragmentOf(found.suffix),
            suffix: found.suffix,
            ...(hosted
              ? {
                  hosted: `${hostedRoute(linked.route, deployment!)}${found.suffix}`,
                }
              : {}),
          }
        // Under hyperlink removal nothing is resolved or copied for a link.
        if (links === "none") return { kind: "local", suffix: "" }
        const located = resources.locate(url, doc)
        if (located.kind === "external") return { kind: "external", url }
        const onDisk =
          located.kind === "resolved"
            ? located.source
            : sourceBase && !located.relative.startsWith("../")
              ? safePathOrUndefined(sourceBase.root, located.relative)
              : undefined
        const present =
          onDisk !== undefined && fs.existsSync(onDisk) ? onDisk : undefined
        // A mount takes a link into its directory, whether the file is in a
        // root or found through sourceLinks. Mounts need relative links, so
        // a hosted link never reaches this.
        if (present && !hosted) {
          const copy = mounted(present)
          if (copy) {
            resources.check(present, url, doc.id)
            return { kind: "local", asset: copy, suffix: located.suffix }
          }
        }
        // A file the collection leaves out is in the repository under every
        // policy that keeps links: the host does not serve it either.
        if (
          located.kind === "missing" &&
          sourceBase &&
          present &&
          within(present, sourceBase.root)
        ) {
          resources.check(present, url, doc.id)
          return {
            kind: "external",
            url: `${sourceBase.url}${located.relative
              .split("/")
              .map(encodeURIComponent)
              .join("/")}${located.suffix}`,
          }
        }
        if (hosted)
          return {
            kind: "local",
            suffix: "",
            hosted: url.startsWith("/")
              ? hostedRoute(url, deployment!)
              : new URL(url, hostedRoute(doc.route, deployment!)).href,
          }
        const copied = resources.resolve(url, doc, "link")
        if (copied && singlePages)
          depend({ kind: "file", document: doc.id, url })
        return copied
          ? { kind: "local", asset: copied.asset, suffix: copied.suffix }
          : { kind: "external", url }
      }
      /** The site's spelling of a target: pages beside pages, from the page's own file. */
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
              `${fromPage(doc, outputPath(target.id))}${target.suffix}`
            )
          case "local":
            return (
              target.hosted ??
              (target.asset
                ? `${urlPath(fromPage(doc, target.asset))}${target.suffix}`
                : url)
            )
        }
      }
      /**
       * The print HTML's spelling. Inside the volume every exported document is
       * present, so a link to one becomes a fragment; in a per-document file it
       * names the sibling PDF, without a fragment, as the Word file names the
       * sibling `.docx`. A private document is in neither, so both name it on
       * the host, the only policy that lets a link reach one. A fragment stays
       * in the file under every policy: the target is on a later page, not on
       * a website.
       */
      const volumeMembers = new Set(plan.volume)
      const printLink = (
        url: string,
        doc: StoredDocument,
        bound: boolean,
      ): RewrittenLink => {
        const target = linkTarget(url, doc)
        switch (target.kind) {
          case "external":
            return target.url
          // An element's id in the volume is its prefix and its own id as
          // written, so the anchor joins it decoded: `#%EA%B0%9C%EC%9A%94`
          // names the heading `개요`.
          case "fragment":
            return bound
              ? `#${volumePrefix(doc.id)}${decodeComponent(target.anchor)}`
              : `#${target.anchor}`
          case "document": {
            // A private target always has `hosted`: under the other
            // policies a link to one fails before it gets here.
            if (!bound)
              return target.hosted ?? fromId(doc.id, `${target.id}.pdf`)
            // A published document the volume does not bind, a translation
            // or a home the navigation leaves out, has its own PDF only when
            // the run writes documents; its site page is always written.
            if (!volumeMembers.has(target.id))
              return (
                target.hosted ??
                `${urlPath(outputPath(target.id))}${target.suffix}`
              )
            const href = `#${volumeId(target.id)}${target.anchor ? `-${decodeComponent(target.anchor)}` : ""}`
            // The document's own print names the page on the host, and with
            // `page.linkUrls` prints that address beside the link. The volume
            // carries the same address for the same text, so a document is as
            // long in the volume as alone and the contents' numbers hold.
            return target.hosted
              ? { href, attributes: { dataCudocUrl: target.hosted } }
              : href
          }
          case "local":
            return (
              target.hosted ??
              (target.asset
                ? `${urlPath(bound ? target.asset : fromId(doc.id, target.asset))}${target.suffix}`
                : url)
            )
        }
      }

      /* ---------- stylesheets ---------- */
      const builtIn = buildStyles(resolvedTokens)
      const cssCheck = (file: string, from: string, url: string) => {
        if (
          !allowedCssDirs.some((dir) => within(file, dir)) &&
          !cssFiles.some((sheet) => within(file, path.dirname(sheet)))
        )
          throw new Error(
            `cudoc-export: ${from} loads ${url}, which is outside the collection roots, the asset directories and the stylesheet's own folder`,
          )
        return resources.check(file, url, from)
      }
      const remoteStyle = (from: string) => (url: string) => {
        if (singlePages)
          throw new Error(
            `cudoc-export: ${from} loads ${url} from another host, and a standalone page carries its styles itself; save the file locally`,
          )
      }
      const sheetLinks: string[] = []
      let inlineStyles = ""
      if (singlePages) {
        inlineStyles = [
          builtIn,
          ...cssFiles.map((file) =>
            rewriteStylesheet(fs.readFileSync(file, "utf8"), {
              name: file,
              base: path.dirname(path.resolve(file)),
              local: (source, url) => {
                cssCheck(source, file, url)
                return inlineData(source, url, file)
              },
              remote: remoteStyle(file),
            }),
          ),
        ]
          .map(styleText)
          .join("\n")
      } else {
        write("cudoc.css", builtIn)
        sheetLinks.push("cudoc.css")
        cssFiles.forEach((file, index) => {
          const asset = stylesheetAsset(file, index)
          const text = rewriteStylesheet(fs.readFileSync(file, "utf8"), {
            name: file,
            base: path.dirname(path.resolve(file)),
            local: (source, url) => {
              const real = cssCheck(source, file, url)
              const copy = stylesheetFileAsset(source)
              if (!files.has(copy)) write(copy, fs.readFileSync(real))
              return relativeTo(asset, copy)
            },
            remote: remoteStyle(file),
          })
          write(asset, text)
          sheetLinks.push(asset)
        })
      }

      /** A file a single page carries, as a data URL within the size limit. */
      function inlineData(source: string, url: string, from: string): string {
        const value = dataUrl(source, url, from)
        if (value.length > maxAssetBytes)
          throw new Error(
            `cudoc-export: ${from} uses ${url}, which is ${value.length} bytes written inline, over standalone.maxAssetBytes (${maxAssetBytes})`,
          )
        return value
      }

      /** Writes a single page's resources into it; what stays outside is a dependency. */
      const inlineBody = (body: HastRoot, doc: StoredDocument) => {
        const sourceFile = sourceFileOf(roots, doc.sourcePath)
        const base = sourceFile ? path.dirname(sourceFile) : roots[0]!.dir
        const documentStyle = (text: string, declarations: boolean) =>
          rewriteStylesheet(text, {
            name: `${doc.id} (inline style)`,
            base,
            declarations,
            local: (source, url) => {
              if (!allowedCssDirs.some((dir) => within(source, dir)))
                throw new Error(
                  `cudoc-export: ${doc.id} styles with ${url}, which is outside the collection roots and asset directories`,
                )
              resources.check(source, url, doc.id)
              return inlineData(source, url, doc.id)
            },
            remote: remoteStyle(doc.id),
          })
        const visit = (node: HastRoot | RootContent) => {
          if (node.type === "element") {
            const marks = (
              node.data as { cudocAssets?: AssetMark[] } | undefined
            )?.cudocAssets
            for (const mark of marks ?? []) {
              if ("candidates" in mark) {
                node.properties.srcSet = mark.candidates
                  .map((candidate) => {
                    if ("url" in candidate) {
                      depend({
                        kind: "remote",
                        document: doc.id,
                        url: candidate.url,
                      })
                      return [candidate.url, candidate.descriptor]
                        .filter(Boolean)
                        .join(" ")
                    }
                    const source = resolvedSource(candidate.asset)
                    return [
                      inlineData(source, candidate.asset, doc.id),
                      candidate.descriptor,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  })
                  .join(", ")
                continue
              }
              const tag = node.tagName
              const media =
                tag === "source" &&
                typeof node.properties.src === "string" &&
                mark.key === "src"
              if (
                (!INLINE_ELEMENTS.has(tag) &&
                  !(tag === "video" && mark.key === "poster")) ||
                media ||
                tag === "use"
              )
                throw new Error(
                  `cudoc-export: ${doc.id} loads ${mark.asset} in <${tag}>, which a standalone page cannot carry inline; use the site mode, or link it on the host`,
                )
              const source = resolvedSource(mark.asset)
              if (tag === "link") {
                const rel = String(node.properties.rel ?? "")
                if (/stylesheet/i.test(rel)) {
                  const text = rewriteStylesheet(
                    fs.readFileSync(source, "utf8"),
                    {
                      name: mark.asset,
                      base: path.dirname(source),
                      local: (file, url) => {
                        cssCheck(file, mark.asset, url)
                        return inlineData(file, url, mark.asset)
                      },
                      remote: remoteStyle(mark.asset),
                    },
                  )
                  ;(node as Element).tagName = "style"
                  node.properties = {}
                  node.children = [{ type: "text", value: styleText(text) }]
                  continue
                }
              }
              node.properties[mark.key] = inlineData(source, mark.asset, doc.id)
            }
            // A stylesheet from another host would leave the page unstyled offline.
            if (
              node.tagName === "link" &&
              /stylesheet/i.test(String(node.properties.rel ?? "")) &&
              typeof node.properties.href === "string" &&
              /^(?:[a-z][\w+.-]*:|\/\/)/i.test(node.properties.href)
            )
              remoteStyle(doc.id)(node.properties.href)
            // What is not local and not inline loads from another host.
            for (const key of assetAttributes(node.tagName)) {
              const value = node.properties[key]
              if (
                typeof value === "string" &&
                /^(?:[a-z][\w+.-]*:|\/\/)/i.test(value) &&
                !/^data:/i.test(value)
              )
                depend({ kind: "remote", document: doc.id, url: value })
            }
            if (node.tagName === "style")
              node.children = node.children.map((child) =>
                child.type === "text"
                  ? {
                      ...child,
                      value: styleText(documentStyle(child.value, false)),
                    }
                  : child,
              )
            if (
              typeof node.properties.style === "string" &&
              /url\(/i.test(node.properties.style)
            )
              node.properties.style = documentStyle(node.properties.style, true)
          }
          if ("children" in node) node.children.forEach(visit)
        }
        visit(body)
      }
      const recordedSources = new Map<string, string>()
      const resolvedSource = (asset: string) => {
        const source = recordedSources.get(asset.toLowerCase())
        if (!source)
          throw new Error(`cudoc-export: no recorded source for ${asset}`)
        return source
      }

      /* ---------- scripts ---------- */
      const runtimeText = runtime
        ? {
            script: scriptText(
              fs.readFileSync(runtime.script, "utf8"),
              ANNOTATION_SCRIPT,
            ),
            stylesheet: styleText(fs.readFileSync(runtime.stylesheet, "utf8")),
          }
        : undefined
      const themeText = theme
        ? scriptText(fs.readFileSync(theme, "utf8"), THEME_SCRIPT)
        : undefined
      if (!singlePages) {
        if (runtime) {
          write(ANNOTATION_SCRIPT, fs.readFileSync(runtime.script))
          write(ANNOTATION_STYLESHEET, fs.readFileSync(runtime.stylesheet))
        }
        if (theme) write(THEME_SCRIPT, fs.readFileSync(theme))
      }

      const head = (fromFile: string) =>
        singlePages
          ? `<style>${inlineStyles}</style>`
          : sheetLinks
              .map(
                (sheet) =>
                  `<link rel="stylesheet" href="${escapeHtml(relativeTo(fromFile, sheet))}">`,
              )
              .join("")
      const themeAttribute = (ui: UiStrings) =>
        theme
          ? ` data-cudoc-ui="${escapeHtml(
              JSON.stringify({
                theme: ui.theme,
                system: ui.system,
                light: ui.light,
                dark: ui.dark,
              }),
            )}"`
          : ""

      const writePage = (html: string, doc: StoredDocument, file: string) => {
        const tree = fromHtml(html)
        rewritePageLinks(tree, links, (url) => siteLink(url, doc))
        // After the link rewrite, so the policy never touches these tags.
        if (runtimeText && runtime)
          if (singlePages) inlineAnnotationAssets(tree, runtimeText)
          else
            injectAnnotationAssets(tree, {
              script: relativeTo(file, ANNOTATION_SCRIPT),
              stylesheet: relativeTo(file, ANNOTATION_STYLESHEET),
            })
        if (themeText)
          if (singlePages) inlineThemeScript(tree, themeText)
          else injectThemeScript(tree, relativeTo(file, THEME_SCRIPT))
        const text = toHtml(tree)
        if (singlePages && Buffer.byteLength(text) > maxPageBytes)
          throw new Error(
            `cudoc-export: ${doc.id} is ${Buffer.byteLength(text)} bytes as a standalone page, over standalone.maxPageBytes (${maxPageBytes})`,
          )
        write(file, text)
      }

      /* ---------- navigation ---------- */
      const sourceRef = (from: StoredDocument, to: StoredDocument) =>
        posix(
          path.posix.relative(
            path.posix.dirname(from.sourcePath),
            to.sourcePath,
          ),
        ) || path.posix.basename(to.sourcePath)
      const homeHref = (doc: StoredDocument, code: string) => {
        const homeDoc = plan.homes.get(code)
        if (homeDoc) return siteLink(sourceRef(doc, homeDoc), doc)
        return links === "host"
          ? deployment!.href
          : relativeTo(outputPath(doc.id), plan.homeFile(code))
      }
      const drawNav = (
        entries: NavEntry[],
        doc: StoredDocument,
        current: string,
      ): ShellNavItem[] =>
        entries.map((entry): ShellNavItem => {
          if (entry.kind === "page")
            return {
              kind: "page",
              title: titles.get(entry.doc.id)!,
              href: siteLink(sourceRef(doc, entry.doc), doc),
              current: entry.doc.id === current,
            }
          if (entry.kind === "link")
            return { kind: "link", title: entry.title, href: entry.url }
          const children = drawNav(entry.children, doc, current)
          const containsCurrent = (items: ShellNavItem[]): boolean =>
            items.some(
              (item) =>
                (item.kind !== "link" && item.current) ||
                (item.kind === "group" && containsCurrent(item.children)),
            )
          const isCurrent = entry.page?.id === current
          return {
            kind: "group",
            title: entry.title,
            ...(entry.page
              ? { href: siteLink(sourceRef(doc, entry.page), doc) }
              : {}),
            current: isCurrent,
            open: !entry.collapsed || isCurrent || containsCurrent(children),
            children,
          }
        })
      const shellLinks = (code: string): ShellLink[] =>
        headerLinks.map((link) => ({
          title: titleIn(link.title as NavigationTitle, code, fallbackCode),
          href: link.url,
        }))
      const languageLinks = (
        doc: StoredDocument,
        code: string,
      ): ShellLanguage[] =>
        locales && plan.codes.length > 1
          ? locales.list.map((locale) => {
              if (locale.code === code)
                return {
                  label: locale.label,
                  lang: locale.code,
                  href: "",
                  current: true,
                }
              const other = plan.counterpart(doc, locale.code)
              return {
                label: locale.label,
                lang: locale.code,
                href: other
                  ? siteLink(sourceRef(doc, other), doc)
                  : homeHref(doc, locale.code),
                current: false,
              }
            })
          : []

      /* ---------- documents ---------- */
      const printable: PrintableDocument[] = []
      for (const doc of written) {
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
            // Only the shell may mark a link as resolved already.
            delete node.properties.dataCudocFinal
            // Hyperlinks are handled on the complete page; keep rendering
            // resources local. The path is recorded root-relative and marked,
            // so each output re-expresses it from its own location.
            const marks: AssetMark[] = []
            for (const key of assetAttributes(node.tagName)) {
              const url = node.properties[key]
              if (typeof url !== "string" || externalUrl(url)) continue
              const copied = resources.resolve(url, doc, "render")
              if (!copied) continue
              recordedSources.set(copied.asset.toLowerCase(), copied.source)
              node.properties[key] = `${urlPath(copied.asset)}${copied.suffix}`
              marks.push({ key, asset: copied.asset, suffix: copied.suffix })
            }
            // Each candidate of a responsive image is a file of its own. The
            // parsed page carries `srcset` as the attribute's text, read here
            // the way the browser reads it; a tree built with it as a list
            // holds one candidate in each item.
            const srcSet = node.properties.srcSet
            if (typeof srcSet === "string" || Array.isArray(srcSet)) {
              const candidates = (
                Array.isArray(srcSet)
                  ? srcSet.flatMap((item) => parseSrcSet(String(item)))
                  : parseSrcSet(srcSet)
              ).map(({ url, descriptor }) => {
                const copied = externalUrl(url)
                  ? null
                  : resources.resolve(url, doc, "render")
                if (copied)
                  recordedSources.set(copied.asset.toLowerCase(), copied.source)
                // A candidate on another host stays as written in every output.
                return copied
                  ? { asset: copied.asset, suffix: copied.suffix, descriptor }
                  : { url, descriptor }
              })
              marks.push({ key: "srcSet", candidates })
              node.properties.srcSet = candidates
                .map((candidate) => srcSetCandidate(candidate, (a) => a))
                .join(", ")
            }
            if (marks.length)
              node.data = {
                ...node.data,
                cudocAssets: marks,
              } as typeof node.data
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
        const { code, lang } = plan.language(doc)
        const ui = uiFor(code, lang)
        const file = outputPath(doc.id)
        const isHome = !singlePages && plan.homes.get(code) === doc
        const showToc = !isHome && tocDepth > 0 && doc.frontmatter.toc !== false
        const body = structuredClone(hast)
        if (singlePages) inlineBody(body, doc)
        else localizeAssets(body, (asset) => fromPage(doc, asset))
        // Block ids and the version pins go on the review page only; the
        // shared `hast` feeds the print outputs, which stay as they were.
        if (annotations) assignBlockIds(body)
        const metadata = documentMetadata(doc)
        const mainAttributes = annotations
          ? ` data-cudoc-document="${escapeHtml(doc.id)}" data-cudoc-ast-hash="${metadata.astHash}" data-cudoc-source-hash="${metadata.sourceHash}" data-cudoc-site="${escapeHtml(site)}" data-cudoc-generator="${escapeHtml(generator)}"${inboxAttribute}`
          : ""
        const pageHtml = renderShell({
          lang,
          title: `${titles.get(doc.id)!} · ${title}`,
          head: head(file),
          htmlAttributes: themeAttribute(ui),
          ui,
          skip: links === "relative",
          siteTitle: title,
          ...(singlePages ? {} : { homeHref: homeHref(doc, code) }),
          headerLinks: shellLinks(code),
          languages: singlePages ? [] : languageLinks(doc, code),
          layout: singlePages ? "single" : isHome ? "home" : "site",
          ...(singlePages
            ? {}
            : {
                navigation: drawNav(
                  plan.navigation.entries.get(code) ?? [],
                  doc,
                  doc.id,
                ),
              }),
          ...(showToc
            ? {
                toc: headings
                  .filter((node) => node.depth! <= tocDepth)
                  .map((node) => ({
                    depth: node.depth!,
                    id: String(node.data?.hProperties?.id ?? ""),
                    text: visibleHeadingText(node),
                  })),
              }
            : {}),
          mainAttributes,
          body: toHtml(body),
          footer: title,
        })
        writePage(pageHtml, doc, file)
        printable.push({ doc, tree, hast, headings, lang })
      }

      /* ---------- landing pages ---------- */
      if (plan.writesHomes)
        for (const code of plan.codes) {
          if (plan.homes.get(code)) continue
          const file = plan.homeFile(code)
          const lang = code || "en"
          const ui = uiFor(code, lang)
          const landing = {
            ...plan.published[0]!,
            id: file.replace(/\.html$/, ""),
            sourcePath: file.replace(/\.html$/, ".md"),
            route: "/",
          }
          writePage(
            renderLanding({
              lang,
              title,
              head: head(file),
              htmlAttributes: themeAttribute(ui),
              ui,
              headerLinks: shellLinks(code),
              // Each language's own home, generated or written.
              languages:
                locales && plan.codes.length > 1
                  ? locales.list.map((locale) => ({
                      label: locale.label,
                      lang: locale.code,
                      href:
                        locale.code === code
                          ? ""
                          : homeHref(landing, locale.code),
                      current: locale.code === code,
                    }))
                  : [],
              navigation: drawNav(
                plan.navigation.entries.get(code) ?? [],
                landing,
                "",
              ),
            }),
            landing,
            file,
          )
        }

      /* ---------- print outputs ---------- */
      if (willPrint)
        for (const name of writePrintOutputs({
          staging,
          documents: printable,
          title,
          order: plan.volume,
          titles,
          tokens: resolvedTokens,
          page,
          links,
          volume,
          coverImage: cover?.name,
          assetLink,
          resolveLink: printLink,
        }))
          files.add(name)
      if (cover && willPrint)
        fs.copyFileSync(cover.source, path.join(staging, cover.name))

      /* ---------- copies ---------- */
      resources.copy(staging, willPrint ? ["render", "link"] : ["link"])
      for (const mount of mountList) copyMount(mount, staging, resources)

      if (strict && dependencies.length)
        throw new Error(
          `cudoc-export: strict: the pages need what is outside them:\n${sortedDependencies()
            .map((d) => `  ${d.document}: ${d.kind} ${d.url}`)
            .join("\n")}`,
        )

      if (afterStaging)
        return afterStaging({
          staging,
          documents: printable,
          order: plan.volume,
          titles,
          title,
          tokens: resolvedTokens,
          page,
          volume,
          links,
          calloutTypes: library.options.calloutTypes,
          linkTarget,
          assetLink,
          pagePath: outputPath,
          resolveAsset: (url, doc) => {
            const located = resources.locate(url, doc)
            return located.kind === "resolved" ? located.source : null
          },
        })
      return undefined
    },
  )
  const result = (): SiteResult => ({
    outDir: path.resolve(outDir),
    documentCount: written.length,
    libraryDir: path.resolve(libraryDir),
    files: [...files].sort(),
    diagnostics: plan.diagnostics,
    dependencies: sortedDependencies(),
    omitted: plan.omitted,
  })
  // The publish is asynchronous exactly when the staging hook is, and the
  // caller must not see the output directory before it has been committed.
  return (
    (published as unknown as Promise<void> | undefined)?.then
      ? (published as unknown as Promise<void>).then(() => result())
      : result()
  ) as SiteResult & Promise<SiteResult>
}

/** `safePath`, with a path escaping the root as no path. */
function safePathOrUndefined(
  root: string,
  relative: string,
): string | undefined {
  try {
    return safePath(root, relative)
  } catch {
    return undefined
  }
}

/** Copies a mounted directory, refusing what no output may carry. */
function copyMount(
  mount: { from: string; to: string },
  staging: string,
  resources: ReturnType<typeof createResources>,
): void {
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink())
        throw new Error(`cudoc-export: symlink in mounted directory: ${file}`)
      if (entry.isDirectory()) {
        walk(file)
        continue
      }
      const relative = posix(path.relative(mount.from, file))
      const asset = `${mount.to}/${relative}`
      const real = resources.check(file, relative, `mount ${mount.to}`)
      const destination = safePath(staging, asset)
      if (fs.existsSync(destination))
        throw new Error(
          `cudoc-export: mount ${mount.to} collides with generated output: ${asset}`,
        )
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(real, destination)
    }
  }
  walk(mount.from)
}
