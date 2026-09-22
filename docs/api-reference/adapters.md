# Adapter APIs and pipelines

**English** | [한국어](./adapters.ko.md) · [API reference](./README.md)

## remark

Source: [prepare.ts](../../packages/cudoc-remark/src/prepare.ts), [options.ts](../../packages/cudoc-remark/src/options.ts). The default export from `cudoc-remark` or `cudoc-remark/prepare` is `cudocPrepare`, a unified plugin accepting `CudocRemarkOptions`.

Recommended options are the `DocumentOptions` fields `syntax`, `host`, `format`, `calloutTypes`, `components`, `headingIds`, `tableColumnWidths` and `ignoreDiagnostics`, plus `tableColumnLayout`, `toc` and `transforms`. `tableColumnWidths` resolves with the same validation as `tableColumnLayout` and runs before it; `ignoreDiagnostics` is handed to `normalizeDocument` unchanged ([document options](./document.md#document-options)). Omitting options or passing `syntax: {}` uses component-free defaults. The plugin installs frontmatter parsing and adds directive parsing in the portable Docusaurus pipeline. Install GFM through the host or `remark-gfm`.

Pipeline behavior:

1. Resolve options and reject unknown top-level keys.
2. By default, remove YAML content nodes and call `normalizeDocument` with the source text. Add diagnostics to the VFile. This also applies without a file path and when `format: "md"` is explicit.
3. Run optional custom `transforms.pre`/`post` in a traversal after normalization. Here pre/post mean traversal entry/exit, not before/after the built-in normalization stage.
4. Collect optional TOC; add its ESM export only when the effective format is `mdx`. An explicit `format` takes precedence over the file extension.

Explicitly setting `headingMetadata`, top-level `badge` or top-level `tableCellList` opts an MDX pipeline into the low-level named-component transforms. Those options cannot be combined with `syntax`; doing so throws. Markdown files always use portable normalization, so configure their features through `syntax`, not these component-only options. The default authoring setup never requires `Anchor` or `Badge` registration. Low-level transform tests opt in explicitly; default rendering is tested without any component provider.

`toc` defaults to false. `toc: true` uses `{ titleDepth: 1, depths: [2,3], exportName: "toc" }`. Title depth can be false; collected depths can have one or two entries from 1 to 6. `Toc` is `{ title: string | null, headings: { id, text, children: { id, text }[] }[] }`. Only linkable headings are collected. Additional options customize anchor naming and badge delimiters. Docusaurus and Nextra reject `toc` because the host owns its TOC.

`getFileSource(file) → string | null`, `resolveOptions(options?)`, `buildTransforms(resolved) → {pre, post}` are exported support functions. `buildTransforms` builds the named-component transform sequence; it is not a substitute for `normalizeDocument`.

### remark entry points

| Import                             | Exports/purpose                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cudoc-remark`                     | Default/named `cudocPrepare`, option types/resolver, transforms, TOC helpers, heading promotion, host plugin factory and `createCompilerCapture` |
| `cudoc-remark/prepare`             | Preparation plugin and transform/source helpers                                                                                                  |
| `cudoc-remark/heading-ids`         | Default/named `promoteAnchorIds`; copies configured anchor IDs to heading HTML data                                                              |
| `cudoc-remark/host-plugins`        | `createHostPlugins`, `HostPluginOptions`                                                                                                         |
| `cudoc-remark/badge`               | Badge transform/resolver and defaults                                                                                                            |
| `cudoc-remark/table-cell-list`     | Cell-list transform and parsing helpers                                                                                                          |
| `cudoc-remark/table-column-layout` | Layout transform, options, table construction and splitting                                                                                      |
| `cudoc-remark/toc`                 | `createToc`, `resolveTocOptions`, `collectHeadingToc`, `addTocExport`, TOC types/default export name                                             |
| `cudoc-remark/embed`               | Prepared-embed splicing plugin; `restoreExpressions`                                                                                             |
| `cudoc-remark/loader`              | Bundler loader tying documents to the prepared library; `libraryLoader`, `libraryFingerprint`, `stripLibraryMarker`, `LIBRARY_LOADER`            |
| `cudoc-remark/components`          | Named `Anchor`, `Badge`, `cudocComponents` for low-level named-component output                                                                  |

Transform functions can run in-process; function-valued options cannot cross a JSON-only bundler worker boundary. Next.js Turbopack configuration uses package-name plugin strings and serializable options.

## Compiler capture

Source: [capture.ts](../../packages/cudoc-remark/src/capture.ts). Import `createCompilerCapture` from `cudoc-remark`.

```ts
createCompilerCapture(): {
  remark: Plugin<[], Root>
  rehype: Plugin
  read(): CompiledDocument
}
```

Create one capture object per compilation. Its remark plugin keeps the current tree reference; its rehype plugin clones that tree after native remark plugins, lowers static native JSX, removes YAML/ESM nodes and records frontmatter from `file.data.frontMatter` or `file.data.frontmatter`. `read()` throws if compilation has not reached the capture stage.

The current capture result has `diagnostics: []`; warnings emitted on the host VFile are not copied into it. Capture concerns the final remark tree, not arbitrary later rehype transforms or executed component output. Keep source positions until collection has made its source snapshot.

During collection, install cudoc syntax and capture, but omit the prepared-embed insertion plugin. Preserve the `cudoc-embed` fence so the resolver can read it after all documents have been collected. Use the actual host processor with the same plugin/configuration settings for collection and replacement.

## Prepared-embed splicing

Source: [embed.ts](../../packages/cudoc-remark/src/embed.ts), [loader.ts](../../packages/cudoc-remark/src/loader.ts).

`cudoc-remark/embed` default export accepts `{ sourceRoot?: string, roots?: SourceRoot[], outDir?: string }`, defaulting to `sourceRoot: "docs"` and `.cudoc/documents`. Give it the same `roots` collection used and it derives the same ID: the base of the innermost root containing `file.path`, then the path under it, without the extension. The roots are resolved only when a fence is met, so a file outside every root compiles as long as it embeds nothing, and fails naming the file when it does. It numbers fences, validates prepared data against `file.value`, and replaces each fence with the children of the prepared block from `embeds.json`, cloned and spliced into the tree where the fence was. Only documents with fences read prepared data.

The spliced nodes are ordinary mdast from that point on: the host's remaining remark plugins, remark-rehype and its component mapping treat them exactly like the document's own content, so a component in an embedded section renders through the host's components and a code block reaches the host's highlighter. Nothing is rendered to an HTML string, no wrapper element is added, and no runtime component or data import is generated. A stored block carries no `estree` — the AST export strips it — so `restoreExpressions(node, documentId)` parses one again from the expression text the export kept, for every `mdxFlowExpression`, `mdxTextExpression`, `mdxJsxAttributeValueExpression` and `mdxJsxExpressionAttribute` in the block, with acorn and its JSX extension: a value or flow/text expression as `(value)`, a spread attribute as `({value})` the way the MDX parser builds it, and an expression holding only a comment as an empty program. Text that does not parse is an error naming the document and the expression. Embedded headings keep their `hProperties.id`, so they render as anchors; they are not in cudoc-remark's own `toc` export, which `cudoc-remark` computed before this plugin ran, but a host that builds its table of contents from the final tree lists them. A `cudoc-embed` fence inside an embedded section was already expanded by the resolver, so nested embeds arrive expanded. Authors register no cudoc components.

Because the compiled page now holds the library's content, it depends on `embeds.json`, which a bundler cannot see a remark plugin read. `cudoc-remark/loader` is a webpack/Turbopack loader registered on the same files, ahead of the MDX loader, and it does three things. It declares `embeds.json` as a dependency of the module through `addDependency`, which a dev server and webpack's persistent cache watch. It appends one line to the source, `[cudoc-library]: #<sha256 of embeds.json>` after a blank line — a link reference definition, which renders nothing in Markdown and in MDX — so the MDX loader's input changes whenever the library does; Turbopack caches by comparing task outputs, and a loader that leaves the source untouched can never reach the compile downstream of it. And it carries a `fingerprint` of the library in its options, computed when the bundler configuration is evaluated, which is what makes Turbopack's persistent build cache run the loader again between two builds at all. The embed plugin removes the marker with `stripLibraryMarker` before comparing the source with the library's snapshot, so the freshness check sees the file as written; running the loader twice does not stack markers. `libraryFingerprint(outDir?)` is the SHA-256 of `embeds.json`, `""` before it exists, cached on the file's size and mtime. `libraryLoader(outDir?)` returns `{ loader: "cudoc-remark/loader", options: { outDir, fingerprint } }` as plain JSON for a webpack `use` entry or a Turbopack `loaders` entry; in a build script the configuration is evaluated after `cudoc collect`, so the fingerprint is the new library's. Verified on the Next.js example: with the loader, a recollection between two `next build` runs that keep `.next/cache` reaches the embedding page under both bundlers; without it, the page compiled from the previous library is served until its own file changes or the cache is cleared.

## Docusaurus and Nextra

Sources: [host-plugins.ts](../../packages/cudoc-remark/src/host-plugins.ts), [Docusaurus](../../packages/cudoc-docusaurus/src/index.ts), [Nextra](../../packages/cudoc-nextra/src/index.ts).

Both packages export `cudocRemarkPlugins(options?) → PluggableList`, `promoteAnchorIds` and option types. `HostPluginOptions` is `CudocRemarkOptions` without `toc`, plus `promoteHeadingIds?: boolean` (default true). The shared factory sets the corresponding host, forces `headingIds: "host"`, disables cudoc TOC and appends heading promotion unless explicitly disabled.

| Host       | Installation position                                                      | Real collection example                                                    |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Docusaurus | `docs.beforeDefaultRemarkPlugins`; embed insertion in `docs.remarkPlugins` | [collect.mjs](../../examples/docusaurus/collect.mjs), actual MDX processor |
| Nextra     | `mdxOptions.remarkPlugins`, which Nextra prepends to its native plugins    | [collect.mjs](../../examples/nextra/collect.mjs), `nextra/compile`         |

Docusaurus additionally exports a default plugin returning `{ name, getThemePath }` and `./package.json`. That plugin supplies named-component theme mappings; it is unnecessary for the guide's explicit `syntax` setup. Nextra additionally exports `./components` and `./package.json`; component mappings are likewise not required for that setup.

The Docusaurus example uses an internal version-specific MDX processor entry point. Recheck it with dependency upgrades. Host setting alone does not make standalone parsing equivalent to either native pipeline.

## markdown-it

Sources: [tokens.ts](../../packages/cudoc-markdown-it/src/tokens.ts), [plugin.ts](../../packages/cudoc-markdown-it/src/plugin.ts), [compiler.ts](../../packages/cudoc-markdown-it/src/compiler.ts), [options.ts](../../packages/cudoc-markdown-it/src/options.ts), [host.ts](../../packages/cudoc-markdown-it/src/host.ts). Import from `cudoc-markdown-it`.

```ts
installHostPlugin(md: MarkdownIt, options: HostPluginOptions, host: MarkdownItHost): void
createHostCompiler(md: MarkdownIt, host: MarkdownItHost): DocumentCompiler
tokensToAst(
  tokens: Token[],
  source: string,
  options?: DocumentOptions,
  conversion?: TokenConversion,
): Root
resolveHostOptions(options: HostPluginOptions, adapter: string): HostPluginOptions
```

This is the markdown-it counterpart of `cudoc-remark`: the shared arrangement lives here and each host adapter contributes only a `MarkdownItHost`. `HostPluginOptions` is `DocumentOptions` without `host`/`format` — including `tableColumnWidths` and `ignoreDiagnostics` — plus optional `onDocument(tree, source, env)`, `library` and `outDir` (prepared-data path defaults to `.cudoc/documents`). `resolveHostOptions` runs while the plugin is installed, so an unknown key, a non-object argument or a `headingIds` other than `"host"` fails as the site configuration loads rather than from inside a core rule. The plugin forces the host's own semantics, `format: "md"` and native heading generation.

`MarkdownItHost` names everything a host generator does differently:

| Field                     | Required | Effect                                                                                                    |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `adapter`                 | yes      | Package name; it prefixes every error the shared pipeline raises.                                         |
| `host`                    | yes      | The `Host` value handed to `normalizeDocument`, which selects native syntax.                              |
| `documentId(env)`         | yes      | Collected document ID read from the host's markdown-it env; embeds resolve against it.                    |
| `compilerEnv(context)`    | no       | Rebuilds that env during collection, which runs outside the host's own build.                             |
| `token(token, context)`   | no       | Converts a token contributed by the host's own markdown-it plugins before the shared mapping.             |
| `resolveInlineAttributes` | no       | Re-renders cloned inline tokens first, for a host that resolves link destinations in renderer rules.      |
| `frontmatter(source)`     | no       | Splits front matter for a host that strips it outside markdown-it, so collection reaches the same tokens. |

`tokensToAst` converts real markdown-it tokens to mdast after native processing and never parses the Markdown a second time. It maps the block and inline tokens every host produces alike, plus `github_alert_*` and `markdown-it-container` blocks; `container_details_*` becomes an expandable `details` blockquote and other containers become callouts. The host's `token` hook is consulted before that mapping, so a host's own element can replace the default conversion. Table-cell inline parsing uses the same configured parser. Unknown tokens fail with `conversion.adapter` in the message rather than disappearing.

Three details keep the converted tree equivalent to the remark lineage's. Column alignment, which markdown-it reports only as an inline style on each cell, is collected onto the table node's `align` array. A heading permalink is marked `data.cudoc.kind: "permalink"` while the tokens are converted, before normalization, so any transform that reads a heading's own text can exclude it; its `href` is corrected afterwards, once the id is resolved. And a native alert title that only repeats its own type, which a host may insert for an untitled `> [!TIP]`, is dropped, so the same Markdown produces the same callout on every host.

The plugin pushes one `md.core` rule, so native anchors, links and containers are already tokens when cudoc reads them. After normalization it copies the resolved heading IDs and titles back onto the host's own `heading_open` tokens, which is what keeps the host's heading anchors and table of contents in agreement. A renderer wrapper then supplies the normalized HTML after native rendering side effects. `env.cudoc` stores `{ tree, source, diagnostics }` and `env.cudocRendered` stores HTML; `onDocument` receives a cloned tree before embed expansion.

For normal rendering, a library with its sync compiler can resolve embeds directly. A loaded library without the compiler reads `embeds.json`. Missing libraries, stale source or absent prepared blocks throw.

`createHostCompiler` renders with `env.cudocCollect: true`, suppressing embed expansion. It restores source offsets after front-matter processing, returns front matter and diagnostics, and requires the adapter already installed on `md`. React `.mdx` is rejected. Use the same configured renderer for replacements.

## VitePress and Eleventy

Sources: [VitePress](../../packages/cudoc-vitepress/src/index.ts), [Eleventy](../../packages/cudoc-eleventy/src/index.ts).

Both packages export a default markdown-it plugin and `createDocumentCompiler(md)`, and both delegate to `cudoc-markdown-it`. `VitePressOptions` and `EleventyOptions` are both `HostPluginOptions`.

```ts
// default plugin: md.use(cudocVitePress, options) or md.use(cudocEleventy, options)
createDocumentCompiler(md: MarkdownIt): DocumentCompiler
createMarkdownRenderer( // cudoc-eleventy only
  options?: EleventyOptions,
  configure?: (md: MarkdownIt) => void,
): MarkdownIt
```

| Host      | Renderer the site and collector share          | Document ID             | Host definition                                        |
| --------- | ---------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| VitePress | `createMarkdownRenderer` from `vitepress`      | `env.relativePath`      | `<Badge>` token conversion, `resolveInlineAttributes`  |
| Eleventy  | `createMarkdownRenderer` from `cudoc-eleventy` | `env.page.filePathStem` | gray-matter front-matter split, rewritten-source check |

VitePress resolves some links during inline rendering, so its definition sets `resolveInlineAttributes` and the pipeline renders cloned tokens to capture those URLs without applying base paths twice to the original tokens. Its `token` hook converts a static `<Badge type="tip" text="1.0" />` into cudoc's badge; a badge carrying a Vue binding stays raw HTML because its text is not known until the component runs. Static native containers, links and badges are handled, and dynamic Vue expressions are not evaluated.

Eleventy passes the page data object as the markdown-it env and strips front matter with gray-matter before markdown-it, so its definition supplies both `documentId` and `frontmatter`. `createMarkdownRenderer` applies Eleventy's own renderer defaults (`html: true`, indented code blocks disabled), runs the site's `configure` callback, then installs cudoc last so it wraps whatever fence renderer the site registered. Two site settings are contractual rather than advisory: `markdownTemplateEngine: false`, because the adapter throws when `page.rawInput` shows another engine already rewrote the source; and a heading permalink inserted inside the heading rather than wrapping it, because a wrapping permalink moves the heading's own text out of the heading where cudoc reads its `(#id)` anchors. Native syntax comes from the plugins the site registers: `markdown-it-attrs` for `{#id}` and `markdown-it-container` for `::: warning Title`.

See the collectors for renderer lifecycle ([VitePress](../../examples/vitepress/collect.mjs), [Eleventy](../../examples/eleventy/collect.mjs)) and host setup for routing ([VitePress](../vitepress.md), [Eleventy](../eleventy.md)).

## Export

Source/import: [index.ts](../../packages/cudoc-export/src/index.ts), `cudoc-export`.

```ts
type SiteLinkMode = "relative" | "host" | "none"

buildSite(options: SiteOptions): {
  outDir: string
  documentCount: number
  libraryDir: string
}
```

`SiteOptions` extends `DocumentOptions` with these fields. `SiteOptions` and `SiteLinkMode` are exported types; returned paths are absolute. `siteStyles` exports the built-in CSS string.

| Option          | Type / default                                                     | Contract                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sourceRoot`    | `string`; one of `sourceRoot`/`roots` required                     | One source directory at the top of the library; the shorthand for `roots: [{ dir }]`. Needed even with `library`, for asset resolution and output protection.                  |
| `roots`         | `SourceRoot[]`; one of `sourceRoot`/`roots` required               | The directories documents live in, each under its base. With `library` the bases must be the ones the library was collected with.                                              |
| `exclude`       | `string[]`, collection only                                        | Files that are not documents; passed to collection. See [collection](./node.md#collection).                                                                                    |
| `private`       | `string[]`, collection only                                        | Documents collected but never exported; passed to collection. A private document is rendered by no format and appears in no navigation, contents or count.                     |
| `externalPaths` | `string[]`, `[]`                                                   | Root-relative prefixes another application serves on the same host, such as `/sdk`. A link into one is external under every policy: kept as written, never resolved or copied. |
| `extractors`    | `Record<string, TableExtractor>`, collection only                  | Cell extractors an embed table may name; passed to collection. See [embedding](./node.md#embedding).                                                                           |
| `outDir`        | required `string`                                                  | Dedicated site output, separate from source, library and asset roots.                                                                                                          |
| `title`         | `string`, `"Documentation"`                                        | Site header and page-title suffix.                                                                                                                                             |
| `navigation`    | `string[]`, all IDs                                                | Existing document IDs to put first; remaining documents follow.                                                                                                                |
| `css`           | optional `string`                                                  | Local CSS file appended to built-in styles. HTML presentation only; it never reaches a format that emits no CSS.                                                               |
| `tokens`        | optional `DesignTokenOverrides`                                    | Design token overrides merged over the defaults, one level into each group. Read by every output format.                                                                       |
| `page`          | optional `PageOptions`                                             | Paper, margins, running header and footer, heading page breaks and printed link addresses; see [paginated output](#paginated-output).                                          |
| `volume`        | optional `VolumeOptions`                                           | The bound file's name, cover and contents; see [paginated output](#paginated-output).                                                                                          |
| `libraryDir`    | `string`, `path.join(path.dirname(outDir), ".cudoc", "documents")` | Collection output when `library` is absent. Ignored when `library` is provided.                                                                                                |
| `library`       | optional `string`                                                  | Existing collected library directory, read without compilation or publication.                                                                                                 |
| `links`         | `SiteLinkMode`, `"relative"`                                       | Policy for all output hyperlinks.                                                                                                                                              |
| `hostUrl`       | optional `string`, required for `"host"`                           | Absolute HTTP(S) deployment URL including any base path. No credentials, query or fragment. A trailing slash is normalized.                                                    |
| `assetDirs`     | `string[]`, `[]`                                                   | Additional URL-root resource directories, searched in order after the roots.                                                                                                   |
| `renderOptions` | optional `RenderOptions`                                           | HTML component callbacks and code-highlighting override; see [rendering](./document.md#components-and-rendering).                                                              |
| `annotations`   | `boolean`, `false`                                                 | Ship the review-note runtime on every page, so a reader can leave notes and hand them back as a file; see [Annotations](#annotations).                                         |
| `themeSwitch`   | `boolean`, `false`                                                 | Add a header button that cycles the colour scheme through system, light and dark and remembers the choice in the browser; see [Theme switch](#theme-switch).                   |

The synchronous builder has two input paths:

1. Without `library`, collect to `libraryDir` with `host: "html"`, then resolve document embeds with the collected compiler. Other `DocumentOptions` apply to this collection.
2. With `library`, use `loadLibrary` and clone the stored trees. [library.ts](../../packages/cudoc-export/src/library.ts) inserts blocks from `readPreparedEmbeds`, matching document ID, source text and fence order. This supports asynchronous native compilation and original-source replacements without recompiling at export time. Any `DocumentOptions` supplied alongside `library` cause an error; collection owns those settings. No shared library files are written.

Prepared data is loaded only for documents with embed fences. Missing/stale preparation or missing blocks fail. Validation uses the stored source snapshot and manifest fingerprints; the exporter does not compare every live source file with its snapshot. Recollect and prepare after source, routes or compiler changes. The returned `libraryDir` is the input directory when `library` is set.

Rendering uses `renderDocument`, with highlight.js by default; unknown languages fall back to escaped code. `renderOptions` overrides these render defaults and supplies explicit component callbacks. Frontmatter `title` sets the navigation/page title and `lang` sets the language (default `en`). The builder adds CSS/navigation/TOC and creates an index if needed.

`siteStyles` is a token-driven, theme-aware stylesheet, generated by `buildStyles(tokens)` from the object in [design/tokens.ts](../../packages/cudoc-export/src/design/tokens.ts). `designTokens`, `resolveTokens` and `buildStyles` are exported; `siteStyles` is `buildStyles()` with the defaults. The declarations and the four highlight.js colour rules are generated from that object, and `__tests__/styles.test.ts` compares the result against a byte-for-byte golden fixture. The light palette is defined as custom properties on `:root`, and only those properties are redefined under `prefers-color-scheme: dark`, so a viewer's system setting selects the theme without any script. No rule contains a raw colour outside the print block, and every foreground/surface pair clears WCAG AA: 4.5:1 for text and 3:1 for the focus ring, in both themes. The dark colours are declared twice at the specificity of `:root`: under `prefers-color-scheme: dark` for `:root:where(:not([data-theme="light"]))`, and under `:root:where([data-theme="dark"])`, so `data-theme="light"` or `"dark"` on `<html>` overrides the system setting (and sets `color-scheme`) while an appended stylesheet's own `:root` rules still win. [Theme switch](#theme-switch) is what sets that attribute; without it nothing does.

| Token group       | Properties                                                                                    | Purpose                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces          | `--canvas`, `--paper`, `--wash`, `--row-alt`                                                  | Page ground, content surface, code and panel fill, alternating table rows                                                                                      |
| Text              | `--ink`, `--muted`, `--faint`                                                                 | Reading colour, secondary prose, small labels                                                                                                                  |
| Lines             | `--line`, `--line-soft`                                                                       | Region separators and row separators                                                                                                                           |
| Accent and status | `--accent`, `--accent-soft`, `--warn`, `--warn-wash`, `--danger`, `--danger-wash`             | Links and active navigation, plus each callout severity with its own tinted surface                                                                            |
| Code              | `--code-keyword`, `--code-string`, `--code-comment`, `--code-number`                          | highlight.js token colours                                                                                                                                     |
| Type              | `--font-sans`, `--font-mono`, `--text-xs` … `--text-3xl`, `--leading-body`, `--leading-tight` | Font stacks and the modular scale. Word sizes its runs from `text` against `print.baseSize`, and its line spacing is the CSS leading divided by Word's own 1.2 |
| Layout            | `--space-1` … `--space-12`, `--radius`, `--measure`, `--head-h`, `--ease`                     | 4px spacing grid, corner radius, line-length bound, header height, transition                                                                                  |
| Word              | none: `word.sans`, `word.mono`, `word.eastAsia`, `word.paragraphSpacing` … `word.padding`     | The Word template's faces and rhythm, read by no stylesheet; see [Word template](#word-template)                                                               |

Type scales from the browser's own base size rather than a fixed pixel root, so a reader's font-size setting is respected: `html` is `font-size: 100%` and body copy is `--text-base` (0.9375rem) at `--leading-body` (1.7). The font stacks name IBM Plex Sans and JetBrains Mono first and fall through to the platform UI and Korean faces; nothing is fetched, so the export stays usable from `file://` and offline. Prose is bounded to `--measure` (72ch) while headings, tables, code blocks and callouts use the full content column.

The page shell is a sticky header with a sticky document sidebar and heading TOC beside that column, collapsing to two columns at 1024px and to one at 768px, where navigation targets grow to 2.75rem. Tables use horizontal rules, alternating row backgrounds, label-style headers and tabular figures rather than a full border grid, and scroll horizontally instead of widening the page. Interactive states transition over `--ease`, which `prefers-reduced-motion` collapses to 1ms. `css` is appended after these styles, so a site restyles the export by redefining properties rather than rewriting rules. Prefer `tokens` for a change that should hold across formats: it is data, and a writer that emits no CSS reads the same object, while `css` reaches only the outputs that load a stylesheet. `resolveTokens` merges one level into each group, so redefining a single colour keeps the rest of the palette, and it replaces a font stack whole rather than merging it. `--radius`, `--measure`, `--head-h` and `--ease` and the dark palette have no counterpart outside CSS. The print block drops the header and both navigation columns, removes the measure bound, keeps the reading colour, repeats table headers across pages, and lets a code line wider than the page wrap instead of scaling every page down to fit it; the standalone print stylesheet adds the option-dependent rules described below, so the site's own print block never changes with an option.

### Paginated output

`buildExport(options)` from `cudoc-export` produces every format from one
collection, inside one publish transaction, and returns a promise.

```ts
type ExportFormat = "html" | "pdf" | "docx"
type ExportGranularity = "documents" | "volume" | "both"

function buildExport(options: ExportOptions): Promise<ExportResult>

type ExportOptions = SiteOptions & {
  formats?: ExportFormat[] // ["html"]
  granularity?: ExportGranularity // "documents"
  pdf?: { executablePath?: string } // an existing browser instead of the installed shell
  docx?: DocxWriterOptions
}

type DocxWriterOptions = {
  rawHtml?: "drop" | "text" // "drop"
  calloutStyle?: "paragraph" | "table" // "paragraph"
  components?: Record<
    string,
    (node: DocumentNode) => readonly (Paragraph | Table | ParagraphChild)[]
  >
}

type ExportResult = SiteResult & {
  formats: ExportFormat[]
  files: Record<ExportFormat, string[]> // relative to outDir, in output order
  diagnostics: {
    code: "dropped-html" | "html-as-text" | "image-as-text"
    message: string
    document: string
  }[]
}

type RunningText = string | { left?: string; center?: string; right?: string }

type PageOptions = {
  paper?:
    "A4" | "A5" | "A3" | "Letter" | "Legal" | { width: string; height: string }
  orientation?: "portrait" | "landscape"
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
  header?: RunningText | false // "{title}"
  footer?: RunningText | false // { center: "{page} / {pages}" }
  date?: string // "" — never read from the clock
  breakBefore?: 0 | 1 | 2 | 3 // 0
  linkUrls?: boolean // false
  authoredBreaks?: boolean // true
  wideTables?: false | { minColumns: number } // false
}

type VolumeOptions = {
  fileName?: string // "volume"
  cover?: false | { image?: string } // {}
  contents?: false | { title?: string; pageNumbers?: boolean } // { title: "Contents", pageNumbers: true }
}
```

`page` and `volume` are on `SiteOptions`, so `buildSite` writes the print-ready
HTML at the same geometry and with the same front matter. `resolvePageOptions(page)`
validates every field and resolves the geometry once; `resolvePageGeometry(page)`
is the geometry alone. Both are exported. The `@page` rule, the print call's
margins, the Word section's twips and the running lines' tab stops all derive
from that one value; A4 portrait with 20/20/22/20mm is the default, giving a
170×255mm content box. A header or footer needs a margin of at least 15mm on
its side, because Chrome clips a running line that does not fit; a narrower
margin with a running line is an error. A `{page}`, `{pages}`, `{title}` or
`{date}` field is substituted in either format; `{title}` is the document's
title in a per-document file and the volume title in the bound file; `{date}` is
`page.date` verbatim. `breakBefore: n` breaks before every heading of depth `n`
or shallower except a document's first block, in the print stylesheet and as a
paragraph property in Word. `linkUrls` appends ` (url)` after an `http(s)` link
in both. `authoredBreaks: false` makes the print stylesheet's
`.cudoc-page-break` rule `break-after: auto` and the Word writer skip the node.
`wideTables: { minColumns: n }` gives every table with at least `n` columns in
its first row — spans counted — a landscape page: the print HTML wraps the
table in `<div class="cudoc-wide">`, printed on the named page
`@page cudoc-wide` whose size is the portrait page turned and whose margins are
inherited, and the Word writer splits the document into sections around the
table, the table's section carrying `w:orient="landscape"` and the same running
text on a tab stop sized to the wider column. A table inside another table's
cell is never wide, and neither is a document's first block: Chrome answers a
named page on the first element with a blank page in front of it, and the Word
writer applies the same exclusion so the two outputs agree.

`volume.fileName` is a plain basename that must not equal a document id, since
the volume's files sit beside the documents' at the output root.
`volume.cover.image` is a local file path; it must be PNG, JPEG, GIF or BMP,
because Word embeds no SVG, and it is copied to the output as
`cudoc-cover.<type>`. Every file a build can write — `cudoc.css`, `index.html`,
`cudoc-print.css`, `cudoc-cover.*`, `cudoc-annotations.js`,
`cudoc-annotations.css`, `cudoc-theme.js`, and `<id>.html`, `<id>.print.html`,
`<id>.pdf`, `<id>.docx` for every document and the volume name — is reserved, and
an asset that would land on one fails.

**What each format writes.** Every build writes `cudoc-print.css`,
`<id>.print.html` per document and `<volume>.print.html`, whether or not a
browser exists. `pdf` prints those to `<id>.pdf` and `<volume>.pdf` with
`playwright-core` driving `chromium-headless-shell` in one browser session, each
file once; a `postinstall` installs that shell, honouring
`CUDOC_SKIP_BROWSER_DOWNLOAD` and never failing an install, and
`cudoc-export install-browser` runs the same installer. When the browser is
absent and a PDF is requested, the export throws naming that command. `docx`
writes `<id>.docx` and `<volume>.docx` with the `docx` package, walking the same
mdast the HTML renderer consumes.

**The bound volume** is the documents in navigation order, each in its own
`<article class="cudoc-doc" id="cudoc-<encoded id>">` and in its own Word
section, preceded by a cover section and a contents section unless `volume`
turns either off. Every id inside a document is prefixed with
`cudoc-<encodeURIComponent(id)>-`, and a link into another document is spelled
as that prefixed fragment, so two documents cannot collide and every cross-
document link resolves inside the file. The cover fills the page's content box,
so the running header and footer keep their place on it; a cover image is its
`background-image`, cropped as `background-size: cover`, and in Word a floating
picture anchored to the margins behind a title paragraph on a paper-coloured
band. The PDF contents carries the page each document starts on, measured by
printing the front matter alone and each document alone, then checked: the
volume must be exactly that sum, or the export fails rather than print wrong
numbers. `contents.pageNumbers: false` skips the measuring print. The Word
contents is a `TOC` field over first-level headings with the document list as
its current value, each entry linked to a bookmark at the document's start, and
`updateFields` set so Word fills the page numbers on opening; viewers that do
not update fields show the titles. Under `links: "none"` the entries are plain
text in both formats.

**Links in the paginated outputs** follow `links` exactly as the site does,
resolved once to a target and spelled per format. Inside the volume a link to
another collected document is a fragment (`#cudoc-<id>-<anchor>` in HTML, a
bookmark in Word). In a per-document file it is the sibling `<id>.pdf` or
`<id>.docx` without a fragment under `relative`, the deployed URL under `host`,
and removed under `none`. A same-document fragment stays inside the file under
every policy. Other local files are copied and linked as on the site, with
paths re-expressed from the volume's root, so a document in a subdirectory keeps
its images in the bound file.

**The Word writer's dispatch order is part of its contract**:
`data.cudoc.kind`, then `data.hName`, then `node.type`. A page break is carried
on a `thematicBreak`, and a lowered `<table>` arrives as a `blockquote`, so
reading `node.type` first turns a break into a rule and a table into a quote.
Phrasing content met where flow content is expected — text directly inside an
MDX `<div>` — is wrapped in a paragraph rather than dropped. Reference-style
links and images resolve through their `definition`; footnotes become Word
footnotes numbered across the file. Colour, font, size, shading and border
appear only in the declared styles, whose ids are `Cudoc*`, Word's `Heading1`–
`Heading6`, `TOC1` and `IndexLink`; every callout type, built in or registered
through `calloutTypes`, gets a body and a title style. The styles, their
spacing and the token group that sets it are listed under
[Word template](#word-template). Bookmark names are
`cudoc` + 26 characters of a hash of document id and heading id, and the
numeric bookmark ids are renumbered uniquely across the file because `docx`
9.7.1 gives every bookmark the id 1. Raw `html` nodes are dropped and each
drop is reported once per document in `diagnostics` and on the CLI's stderr;
`docx.rawHtml: "text"` writes them as `CudocCodeBlock` paragraphs (inline ones
as `CudocCode` runs) and reports `html-as-text` instead. An image that is not a
PNG, JPEG, GIF or BMP, or that resolves to no local file, becomes its alt text
and is reported as `image-as-text`; one Word can embed is scaled down, keeping
its proportions, until it fits both the content width and the content height,
the same bound the print stylesheet puts on it. `docx.calloutStyle:
"table"` puts each callout in a one-cell table whose cell carries the left rule
and the wash, with its paragraphs in `CudocCallout<Type>Plain` and
`...PlainTitle` styles that are declared only in that mode. A component that
survived normalization (`mdx*` or directive nodes) throws
`no Word renderer for <name>`, as `renderDocument` throws for one without an
HTML renderer, unless `docx.components[name]` is given: it is called with the
node and returns `docx` objects — paragraphs and tables where the component is
flow content, with any runs among them wrapped in a paragraph, and runs only
where it is phrasing content, a paragraph there being an error.

**Page breaks** are shared through `@cudoment/cudoc/paged`: `PAGE_BREAK_FENCE`,
`PAGE_BREAK_KIND`, `PAGE_BREAK_CLASS`, `isPageBreak(node)` and `pageBreakNode()`.
`normalizeDocument` converts a ` ```cudoc-pagebreak ` fence into a
`thematicBreak` carrying `hName: "div"`, `className: ["cudoc-page-break"]`,
`hidden: true` and `data.cudoc.kind: "pageBreak"`.

**Print rules** correct three defects the screen stylesheet had for paper: a
table was `display: block`, which silently disabled `table-header-group`; `pre`
and callouts promised `break-inside: avoid`, which cannot hold once a block is
taller than a page; and body text was repainted black. The builder also opens
every `<details>`, because Chrome prints a closed one as its summary alone.

Subpaths: `cudoc-export/docx` exports `buildDocx`, `writeDocx`, `bookmarkName`
and the `Docx*` types, `DocxWriterOptions` and `DocxComponentRenderer` among
them; `cudoc-export/pdf` exports `openPrinter`, `printPdfs`,
`browserAvailable`, `launchBrowser`, `runningTemplate`, `pdfPageCount` and
`browserInstallCommand`; `cudoc-export/print` exports `writePrintOutputs`,
`printStylesheet`, `fillVolumePageNumbers`, `resolveVolumeOptions`,
`namespaceIds`, `volumeId`, `PRINT_STYLESHEET` and `VOLUME_FILE`.

### Word template

The `.docx` is a template as much as a document. Every appearance is a named
style, so the styles pane changes the whole file, and the values those styles
start from are the `word` token group. Nothing else reaches Word's spacing:
`css` is never read, and the `--space-*` scale drives the stylesheet rather
than the Word styles, so a document that reads too loose or too tight in Word
is tuned here without touching the site or the PDF.

**Page margins** are `page.margin` (20/20/22/20 mm by default), the value the
PDF prints with, and a landscape section for a wide table keeps them.
**Everything inside the margins** is `tokens.word`. Lengths are `rem`
multiples of `print.baseSize` (10.5pt), converted to twips.

| Key                        | Default                                | Sets                                                                                                                                                        |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sans`, `mono`, `eastAsia` | `Calibri`, `Consolas`, `Malgun Gothic` | The Latin, monospace and Hangul faces of every style. One family per script: Word cannot walk a stack and substitutes silently for a face it does not have. |
| `paragraphSpacing`         | `1rem`                                 | Space after a body paragraph: `CudocBody`, `CudocQuote`, `CudocCaption` and the document default.                                                           |
| `headingSpacing`           | `1.5rem`                               | Space before `Heading2` to `Heading6`. `Heading1` takes a third more, and every heading takes half of it after.                                             |
| `blockSpacing`             | `1rem`                                 | Space before and after a code block and a rule, and before whatever follows a table or a callout.                                                           |
| `listSpacing`              | `0.25rem`                              | Space after a list item (`CudocListItem`).                                                                                                                  |
| `listIndent`               | `1.5rem`                               | Indent per list level, with the marker hanging at 60% of it; two thirds of it inside a table cell.                                                          |
| `indent`                   | `1rem`                                 | Left indent of `CudocQuote` and `CudocDetailsBody`, and both indents of a callout box.                                                                      |
| `padding`                  | `0.5rem`                               | Inside padding of a code block and a callout box, as border space in whole points (at most 31), and of a table cell, whose sides take half again.           |

```js
tokens: {
  word: { paragraphSpacing: "0.75rem", blockSpacing: "0.75rem", listIndent: "1.25rem" },
}
```

The group merges one level like every other, so one key changes and the rest
keep their defaults; `resolveTokens({ word }).word` is the resolved group.

Where the spacing is applied is part of the contract, because it is what a
reader sees when the styles are edited:

- Spacing lives in the styles, with three direct exceptions. The first and
  last line of a code block carry `blockSpacing` before and after. A paragraph
  that follows a table or a callout carries `blockSpacing` before, because a
  Word table has no outer margin and a callout's box ends at its last
  paragraph. A table or a callout that follows a table or a callout is preceded
  by an empty 1pt `CudocSpacer` paragraph carrying that spacing, because Word
  draws consecutive tables as one table and consecutive paragraphs with the
  same border and indent as one box. A heading after a table keeps its own,
  larger, spacing before.
- A callout is a run of paragraphs sharing a border and an indent, which Word
  merges into one box. The border's space is the padding; the rhythm inside
  the box (`space-1` between paragraphs, nothing after the title) is fixed.
- Table cells are the one place a colour or a border is a direct property. The
  rule under the header, the soft rule between rows, the tint on every other
  body row and the cell margins are in `w:tcPr`, and `w:tblGrid` states the
  content width split evenly, so a viewer that lays a table out from the grid
  agrees with Word, which fits the columns to their content. A header cell
  carrying a `min-width` style — an embed table column's `minWidth`, or a
  `tableColumnWidths` rule matching its text — holds
  its column at least that wide (`px` at 15 twips, `rem`/`em` at 16px, `ch`
  at 8px, `%` of the table) and the other columns share what is left; when
  the minimums alone exceed the page they are scaled down together.

The paragraph styles are `CudocBody`, `CudocListItem`, `CudocSpacer`,
`CudocQuote`, `CudocCodeBlock`, `CudocTableHeader`, `CudocTableCell`,
`CudocCaption`, `CudocRule`, `CudocDetailsSummary`, `CudocDetailsBody`,
`CudocRunning`, `CudocCoverTitle`, `CudocCoverTitlePanel`,
`CudocContentsTitle`, `TOC1`, `CudocFootnote`, `CudocCallout<Type>` and
`CudocCallout<Type>Title` for every callout type (`...Plain` and
`...PlainTitle` under `calloutStyle: "table"`), and Word's `Heading1` to
`Heading6`; the character styles are `IndexLink`, `CudocCode`,
`CudocCodeKeyword`, `CudocCodeString`, `CudocCodeComment`, `CudocCodeNumber`,
`CudocLinkUrl` and `CudocBadge`. Their colours are `colors.light`, their sizes
`text` against `print.baseSize`, and their line spacing `leading` divided by
Word's own 1.2.

### Theme switch

`themeSwitch: true` (CLI `--theme-switch`) adds a button to every page's header
that cycles the colour scheme through system, light and dark, and ships one
reserved file at the output root, `cudoc-theme.js`, copied from the package's
`dist/browser/`. Every page loads it with a plain `<script src>` at the end of
`<head>`, without `defer`, so a remembered choice is applied before the body
paints; the same Content-Security-Policy meta as for annotations is added once,
whichever option asks first. The script sets or removes `data-theme="light"` or
`"dark"` on `<html>`, which the stylesheet answers to as described under
`siteStyles`, and remembers the choice under `localStorage["cudoc-theme"]`
(absent means system; storage is best effort, as for annotations, and a change
in another tab is followed through the `storage` event). The button is created
by the script, so a page without the script has no button. Its label follows
the document's `lang` (`ko`, else English) and reads System, Light or Dark
beside a monitor, sun or moon icon; the tooltip and accessible name are
"Theme: <mode>". Off by default; the default output stays script-free and
follows the system setting.

### Annotations

`annotations: true` (CLI `--annotations`) ships a review-note runtime with the
site, so whoever receives the files can select text or a block, leave plain-text
notes, reply, mark them resolved, and hand them back. The option is off by
default, and the default output is unchanged byte for byte: no script, no
policy, no block ids.

**What the option adds.** Two reserved files at the output root, copied from
the package's `dist/browser/`: `cudoc-annotations.js`, one classic deferred
script with no dependencies and no network access, and
`cudoc-annotations.css`. Every page gets `<link>` and `<script defer>` tags for
them (the landing page loads the script, which finds no document and does
nothing) and, right after the charset,
`<meta http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'">`.
The policy names only origin-free directives, because `'self'` does not match
the opaque origin some browsers give a `file://` page and would block the
stylesheet. `<main>` carries `data-cudoc-document` (the document id),
`data-cudoc-ast-hash` and `data-cudoc-source-hash` (the library manifest's
`astHash` and `hash` for that document), `data-cudoc-site` (a hash of the title
and document order, which keys browser storage) and `data-cudoc-generator`.
Every `p`, `li`, `tr`, `pre`, `blockquote`, `dt`, `dd`, heading and
`aside.cudoc-callout` carries `data-cudoc-block="<heading id>:<8 hex>"`: the
nearest preceding heading's id (empty before the first) and the first eight hex
digits of the SHA-256 of the block's whitespace-collapsed text, with `~2`,
`~3` … when one section repeats a text. A content hash survives blocks inserted
or moved anywhere else, and an edited block gets a new id, so its notes fall
back to the quote search. The print HTML, PDF and Word are built from the
shared tree and do not change. `object-src 'none'` and `form-action 'none'`
affect an author's raw `<embed>` or `<form>` only while the option is on.

**The runtime.** Selecting text shows a note button; hovering a block shows `+`
in its gutter, and the button stays while the pointer crosses the margin to
reach it; each opens a composer for plain text. A round toggle at the bottom
right, a speech-bubble icon with the number of notes on this document, opens the
panel. The panel starts with a name field (optional, applied as it is typed,
remembered in the browser, empty by default), then two primary actions, copy a
share token and clear this browser's storage, and a collapsed _More_ with the
file actions: download `<id>.annotations.json`; save `<id>.annotated.html`, a
copy of the page with the notes in a
`<script type="application/json" id="cudoc-annotations-data">` block (every `<`
escaped) and without the runtime's UI, which must sit in the same folder as the
original to load its stylesheet; load a `.json` or `.annotated.html` file,
also by drag and drop anywhere on the layer. Below them it lists this document's
notes as cards: state and position pills, author and UTC time, the quoted passage
(block boundaries collapsed to spaces, at most three lines), the text, replies,
and icon buttons with tooltips for go to, reply, edit, resolve or reopen, and
delete. The panel's header controls are icon buttons too. Highlights are painted with the CSS Custom Highlight API
(`::highlight(cudoc-note)`, `-resolved`, `-active`) and never change the DOM; a
browser without it marks the block with one class, which the saved copy
strips. Notes travel in from the embedded block, then from this browser's
storage (`localStorage` under `cudoc-annotations:<site>:<document>`, best
effort: Firefox refuses it over `file://`), merged by id with the later
`modified` winning. A `#cudoc-notes=<token>` fragment is decoded but only
offered in a bar as unverified until the reader accepts it; accepted or not,
the fragment is removed from the address. The token is `z.` plus base64url of
deflate-raw JSON (`j.` plus plain base64url where compression is unavailable),
at most 64 KiB, decoding to at most 1 MiB; on a `file://` page the bare
`#cudoc-notes=…` is offered rather than the full address, which would carry a
local path. The panel's strings are English by default; a selector in its
header switches to Korean, and the document's own `lang` is not consulted. A
second header button chooses the panel's placement: _Narrow the page_, the
default, sets the class `cudoc-ann-push` on `html` while the panel is open,
which pads `body` on the right by the panel's width (22rem) so the sidebar
and contents stay visible; the header sits in the body's flow, so it narrows
by that width too and its right-aligned controls move exactly that far.
_Cover the page_ lays the panel over them. Below 768px the panel always covers the page. Language, placement and
name are remembered per browser under `cudoc-annotations:lang`, `:layout`
and `:author`.
`window.cudocAnnotations` exposes `create(exact, text)`,
`createOnBlock(blockId, text)`, `reply(id, text)`, `list()`, `anchors()`,
`load(text)`, `collection()`, `embeddedCopy()` and `token()` for automation.

**The file** is a W3C Web Annotation `AnnotationCollection` (`@context`
`http://www.w3.org/ns/anno.jsonld`) with `generator`, `total` and `items`. Each
item is an `Annotation` with `id` (`urn:uuid:…`), `created` and `modified`
(UTC ISO 8601), optional `creator: { type: "Person", name }`, `motivation`
(`commenting`; `highlighting` for a note without text; `replying`), `body`
(`TextualBody`, `text/plain`), `target: { source: <document id>, selector }`
with a `TextQuoteSelector` (`exact`, 32-character `prefix` and `suffix`), a
`TextPositionSelector` (offsets into the text of `main`, a block boundary
counting as one newline) and a `CssSelector` (`[data-cudoc-block="…"]`), and a
`cudoc` extension: `document`, `astHash`, `sourceHash`, `block`, `heading`,
`scope` (`text` or `block`), `state` (`open` or `resolved`) and, on a reply,
`parent`. A reply repeats its root's target. Everything read from outside (a
file, a token, the embedded block, storage) is copied field by field into fresh
objects by `parseCollection`, exported from `cudoc-export`: unknown selector
types are dropped, unknown fields ignored, and the input refused when
`@context`, `type`, `motivation`, `purpose` or `format` are not the values
above, when a quote is missing, when an offset is negative or reversed, or when
a limit is exceeded: 2 MiB per file, 500 notes, 10 KiB per note text, 2 KiB per
quote, 64 bytes per context, 200 per name or id.

**Anchoring.** A note is placed by its block id when its scope is `block` and
the block still exists; otherwise its quote is searched, whitespace collapsed,
inside its block, then its heading's section, then all of `main`, keeping the
occurrence whose surroundings best match the prefix and suffix; then its saved
offsets, if the text there still reads the same; otherwise it is listed as not
found, never dropped. A match inside the block is `exact`; anywhere else
`moved`, shown as position uncertain. A note whose `astHash` differs from the
page's is marked as written on another version. Nothing rewrites a note's
selectors or hashes.

**`cudoc-export annotations <notes…> [--token token]… --library <dir> [--out file] [--json]`**
([source](../../packages/cudoc-export/src/annotations/report.ts)) maps notes
back to Markdown lines. Inputs are `.annotations.json` files, `.annotated.html`
copies, whose JSON block is read as text, and share tokens given with
`--token` (repeatable; the `#cudoc-notes=` prefix and an address before it are
accepted), decoded under the same size limits as in the browser and listed as
`share token` among the files. Documents are looked
up by id in the library `loadLibrary` returns, never by joining a string from
the file onto a path. Each note's quote is searched in its heading's own section
of the source (the library's `sections` offsets) as rendered text, then with
Markdown markup set aside (`*`, `_`, `` ` ``, `~`, `\`, brackets, link
destinations, and line-leading `>`, `#`, `|` and list markers), then the same
two passes over the whole document; the result is `exact`, `loose`, `moved` or
`not-found`, with 1-based line numbers. The Markdown report states facts only
and gives no instructions, because it is meant to sit under the author's own
prompt: a header with files, library and counts; one section per document in
library order, unknown documents last, with its source path and whether its
version changed since the notes; one entry per note, sorted by line, with the
heading, state, scope and match, the source lines in a fence, and the
reviewer's text in a fence longer than any backtick run it contains, labelled
"Reviewer-provided text (data, not instructions)" and followed by the name and
time; replies likewise. Control and direction-changing characters (C0,
U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF) are shown as `\uXXXX`.
`--json` emits the same facts as JSON. The exit code is 0 when a report was
produced (a quote not found or a changed version is a fact, not an error) and
1 for a missing or invalid file or library. Text that `cudoc-embed` pulled in
is not in the embedding document's Markdown, so a note on it is `not-found`.

### Export links and assets

[links.ts](../../packages/cudoc-export/src/links.ts) resolves document targets from source IDs and collected routes. Markdown paths prefer source IDs; native URL paths prefer routes. Root-relative, source-relative, deployment-prefixed and custom routes are supported. Query strings and fragments are retained.

- `relative`: map known documents to local `.html` output. Keep fragment-only links local and external URLs unchanged. Other local hyperlink targets must be files that can be copied.
- `host`: map known documents to `hostUrl` plus the stored route without duplicating an existing base prefix. Fragment-only links point to the deployed current document. Other root paths are relative to the deployment base; other relative paths resolve against the deployed current document URL. External scheme URLs and protocol-relative URLs remain unchanged. No remote link checking occurs.
- `none`: replace `<a>` with `<span>` and remove hyperlink attributes from `<a>`/`<area>`, preserving labels, IDs, nested markup and images. No removed hyperlink target is resolved or copied. This is hyperlink removal, not sanitization of scripts or event handlers.

The policy runs on the complete page, including body, raw HTML, renderer callbacks, embeds, generated header/navigation/TOC, footnotes and synthetic index. The local skip link is emitted only in `relative` mode. This setting is independent of collection's `syntax.link`.

Rendering resources (`src`, and authored stylesheet `<link href>`) are processed separately and stay local in every mode when their source is local. Resources are searched in library coordinates — a document-relative path against the document's library path, a root-relative one as a library path — and reach disk through the root holding that path, then beneath `assetDirs` using a URL-root path with the optional deployment base removed. Referenced files are copied with relative output URLs; external resources remain external. This is not recursive bundling of CSS imports, `url()` dependencies or `srcset` candidates.

Invalid link modes/URLs, empty inputs, unknown navigation IDs, missing assets, asset/output collisions, different assets sharing one output path, unsupported nodes and unsafe output directories fail. A local hyperlink or resource that reaches outside every root and every `assetDirs` root is reported as a missing local target naming both the URL and the document that carries it; it is never copied from outside those roots. A link from an exported document to a private one is an error naming both under `relative` and `none`, because the page is not in the output and copying its source would publish it; under `host` it points at the deployment, which serves the page. Output overlap with source, library or asset roots is rejected before writing. Site publication uses staging and preserves the previous site on failure. In collection mode, library and site publication are separate; a failed site write does not roll back a newly collected library. In reuse mode the library remains unchanged. Source HTML is not sanitized and React/Vue code is not executed. The generated shell has no client-side JavaScript dependency unless `annotations` is on, which adds the one local script described under [Annotations](#annotations).

CLI ([source](../../packages/cudoc-export/src/cli.ts)):

```sh
cudoc-export build [sourceRoot] [--out-dir site] [--external-path /prefix]
cudoc-export build --config site.config.mjs
cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
cudoc-export build docs --library .cudoc/documents --out-dir shared-html --links none
cudoc-export build --config site.config.mjs --annotations
cudoc-export annotations review.annotations.json --library .cudoc/documents --out review.md
```

`--annotations` and `--theme-switch` turn those options on; `cudoc-export annotations <notes…> [--token token]… --library <dir> [--out file] [--json]` prints or writes the review report described under [Annotations](#annotations), and exits 1 only for a missing or invalid file or library. CLI defaults are `docs` and `site`. ESM config must default-export an object; JSON is supported, while callback functions require ESM or the programmatic API. Explicit source, `--out-dir`, `--library`, `--links` and `--host-url` override config. Repeated `--asset-dir` flags form an array that replaces config `assetDirs`, and repeated `--external-path` flags replace config `externalPaths`. A config that lists `roots` keeps them unless a source root is given on the command line, which replaces them. Relative paths use the invoking working directory. Success prints the build result as JSON; errors set exit code 1. There is no watch or single-file bundling command.
