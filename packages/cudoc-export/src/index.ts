/**
 * The public entry of cudoc-export: the options and results of an HTML
 * export, and everything else the package exports. The builder itself is
 * in `site.ts`.
 */

import type { DocumentOptions } from "@cudoment/cudoc/document"
import type {
  BuildDocumentsOptions,
  SourceRoot,
} from "@cudoment/cudoc/node/library"
import type { RenderOptions } from "@cudoment/cudoc/render"
import type { SiteLinkMode } from "./links.js"
import type { DesignTokenOverrides } from "./design/tokens.js"
import type { PageOptions } from "./design/page.js"
import type { VolumeOptions } from "./print.js"
import type { LocaleOption } from "./locales.js"
import type {
  NavigationDiagnostic,
  NavigationOption,
  NavigationTitle,
} from "./navigation.js"
import type { HtmlMode, OmittedDocument } from "./plan.js"
export { buildSite } from "./site.js"
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
  /** Collection-only: also write `images.json` beside the library. See `buildDocuments`. */
  imageSizes?: boolean
  /** Collection-only: cell extractors an embed table may name. See `buildDocuments`. */
  extractors?: BuildDocumentsOptions["extractors"]
  /**
   * Root-relative path prefixes another application serves on the same
   * host, such as `/sdk`. A link into one is external: kept as written, or
   * removed under `links: "none"` like any other link.
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
   * Local JavaScript files of your own, loaded after cudoc's own scripts. A
   * site copies each under `cudoc-js/` and loads it with `<script defer src>`
   * at the end of `<body>`; a single page carries its text there. Classic
   * scripts only: a module script does not load from `file://`. A page with
   * one gets the same Content-Security-Policy meta as `themeSwitch`, and its
   * `<main>` names the document in `data-cudoc-document`. Without it the
   * default output stays script-free.
   */
  scripts?: string | string[]
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
  /**
   * Where this exported site is served, including any base path. With it,
   * each site page names its address as canonical and its translations
   * under `hreflang`, and `sitemap.xml` lists every page.
   */
  siteUrl?: string
  /** Additional URL-root asset directories, such as a host's static/ or public/. */
  assetDirs?: string[]
  renderOptions?: RenderOptions
  /**
   * Add a header control that chooses light or dark, remembered in the
   * browser, showing the system setting until the reader chooses. Off by
   * default: without it the stylesheet follows the system setting and no
   * script is loaded.
   */
  themeSwitch?: boolean
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
