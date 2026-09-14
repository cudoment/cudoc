# Adapter APIs and pipelines

**English** | [한국어](./adapters.ko.md) · [API reference](./README.md)

## remark

Source: [prepare.ts](../../packages/cudoc-remark/src/prepare.ts), [options.ts](../../packages/cudoc-remark/src/options.ts). The default export from `cudoc-remark` or `cudoc-remark/prepare` is `cudocPrepare`, a unified plugin accepting `CudocRemarkOptions`.

Recommended options are the `DocumentOptions` fields `syntax`, `host`, `format`, `calloutTypes`, `components`, `headingIds`, plus `tableColumnLayout`, `toc` and `transforms`. Omitting options or passing `syntax: {}` uses component-free defaults. The plugin installs frontmatter parsing and adds directive parsing in the portable Docusaurus pipeline. Install GFM through the host or `remark-gfm`.

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
| `cudoc-remark/embed`               | Prepared-embed insertion plugin                                                                                                                  |
| `cudoc-remark/runtime`             | `EmbeddedDocument({ tree })`, React HTML wrapper used by generated imports                                                                       |
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

## Prepared-embed insertion

Source: [embed.ts](../../packages/cudoc-remark/src/embed.ts), [runtime.tsx](../../packages/cudoc-remark/src/runtime.tsx).

`cudoc-remark/embed` default export accepts `{ sourceRoot?: string, outDir?: string }`, defaulting to `docs` and `.cudoc/documents`. It derives the extensionless ID from `file.path`, numbers fences, validates prepared data against `file.value`, and replaces each fence with generated MDX using a tree from `embeds.json`.

It adds imports for `cudoc-remark/runtime` and the relative prepared JSON path once per document. The JSON import is a bundler dependency so new prepared data can refresh a cached embedding page. Only documents with fences read prepared data. The runtime calls `renderDocument` and inserts its HTML; it does not evaluate authored React components or accept a user renderer option. Authors register no cudoc components.

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

This is the markdown-it counterpart of `cudoc-remark`: the shared arrangement lives here and each host adapter contributes only a `MarkdownItHost`. `HostPluginOptions` is `DocumentOptions` without `host`/`format`, plus optional `onDocument(tree, source, env)`, `library` and `outDir` (prepared-data path defaults to `.cudoc/documents`). `resolveHostOptions` runs while the plugin is installed, so an unknown key, a non-object argument or a `headingIds` other than `"host"` fails as the site configuration loads rather than from inside a core rule. The plugin forces the host's own semantics, `format: "md"` and native heading generation.

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

## HTML

Source/import: [index.ts](../../packages/cudoc-html/src/index.ts), `cudoc-html`.

```ts
type SiteLinkMode = "relative" | "host" | "none"

buildSite(options: SiteOptions): {
  outDir: string
  documentCount: number
  libraryDir: string
}
```

`SiteOptions` extends `DocumentOptions` with these fields. `SiteOptions` and `SiteLinkMode` are exported types; returned paths are absolute. `siteStyles` exports the built-in CSS string.

| Option          | Type / default                                                     | Contract                                                                                                                    |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `sourceRoot`    | required `string`                                                  | Source root for asset resolution and output protection; required even with `library`.                                       |
| `outDir`        | required `string`                                                  | Dedicated site output, separate from source, library and asset roots.                                                       |
| `title`         | `string`, `"Documentation"`                                        | Site header and page-title suffix.                                                                                          |
| `navigation`    | `string[]`, all IDs                                                | Existing document IDs to put first; remaining documents follow.                                                             |
| `css`           | optional `string`                                                  | Local CSS file appended to built-in styles.                                                                                 |
| `libraryDir`    | `string`, `path.join(path.dirname(outDir), ".cudoc", "documents")` | Collection output when `library` is absent. Ignored when `library` is provided.                                             |
| `library`       | optional `string`                                                  | Existing collected library directory, read without compilation or publication.                                              |
| `links`         | `SiteLinkMode`, `"relative"`                                       | Policy for all output hyperlinks.                                                                                           |
| `hostUrl`       | optional `string`, required for `"host"`                           | Absolute HTTP(S) deployment URL including any base path. No credentials, query or fragment. A trailing slash is normalized. |
| `assetDirs`     | `string[]`, `[]`                                                   | Additional URL-root resource directories, searched in order after `sourceRoot`.                                             |
| `renderOptions` | optional `RenderOptions`                                           | HTML component callbacks and code-highlighting override; see [rendering](./document.md#components-and-rendering).           |

The synchronous builder has two input paths:

1. Without `library`, collect to `libraryDir` with `host: "html"`, then resolve document embeds with the collected compiler. Other `DocumentOptions` apply to this collection.
2. With `library`, use `loadLibrary` and clone the stored trees. [library.ts](../../packages/cudoc-html/src/library.ts) inserts blocks from `readPreparedEmbeds`, matching document ID, source text and fence order. This supports asynchronous native compilation and original-source replacements without recompiling at export time. Any `DocumentOptions` supplied alongside `library` cause an error; collection owns those settings. No shared library files are written.

Prepared data is loaded only for documents with embed fences. Missing/stale preparation or missing blocks fail. Validation uses the stored source snapshot and manifest fingerprints; the exporter does not compare every live source file with its snapshot. Recollect and prepare after source, routes or compiler changes. The returned `libraryDir` is the input directory when `library` is set.

Rendering uses `renderDocument`, with highlight.js by default; unknown languages fall back to escaped code. `renderOptions` overrides these render defaults and supplies explicit component callbacks. Frontmatter `title` sets the navigation/page title and `lang` sets the language (default `en`). The builder adds CSS/navigation/TOC and creates an index if needed.

`siteStyles` is a token-driven, theme-aware stylesheet. The light palette is defined as custom properties on `:root`, and only those properties are redefined under `prefers-color-scheme: dark`, so a viewer's system setting selects the theme without any script. No rule contains a raw colour outside the print block, and every foreground/surface pair clears WCAG AA: 4.5:1 for text and 3:1 for the focus ring, in both themes.

| Token group       | Properties                                                                                    | Purpose                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Surfaces          | `--canvas`, `--paper`, `--wash`, `--row-alt`                                                  | Page ground, content surface, code and panel fill, alternating table rows           |
| Text              | `--ink`, `--muted`, `--faint`                                                                 | Reading colour, secondary prose, small labels                                       |
| Lines             | `--line`, `--line-soft`                                                                       | Region separators and row separators                                                |
| Accent and status | `--accent`, `--accent-soft`, `--warn`, `--warn-wash`, `--danger`, `--danger-wash`             | Links and active navigation, plus each callout severity with its own tinted surface |
| Code              | `--code-keyword`, `--code-string`, `--code-comment`, `--code-number`                          | highlight.js token colours                                                          |
| Type              | `--font-sans`, `--font-mono`, `--text-xs` … `--text-3xl`, `--leading-body`, `--leading-tight` | Font stacks and the modular scale                                                   |
| Layout            | `--space-1` … `--space-12`, `--radius`, `--measure`, `--head-h`, `--ease`                     | 4px spacing grid, corner radius, line-length bound, header height, transition       |

Type scales from the browser's own base size rather than a fixed pixel root, so a reader's font-size setting is respected: `html` is `font-size: 100%` and body copy is `--text-base` (0.9375rem) at `--leading-body` (1.7). The font stacks name IBM Plex Sans and JetBrains Mono first and fall through to the platform UI and Korean faces; nothing is fetched, so the export stays usable from `file://` and offline. Prose is bounded to `--measure` (72ch) while headings, tables, code blocks and callouts use the full content column.

The page shell is a sticky header with a sticky document sidebar and heading TOC beside that column, collapsing to two columns at 1024px and to one at 768px, where navigation targets grow to 2.75rem. Tables use horizontal rules, alternating row backgrounds, label-style headers and tabular figures rather than a full border grid, and scroll horizontally instead of widening the page. Interactive states transition over `--ease`, which `prefers-reduced-motion` collapses to 1ms. `css` is appended after these styles, so a site restyles the export by redefining properties rather than rewriting rules. Print rules force black on white, drop the header and both navigation columns, remove the measure bound, and repeat table headers across pages.

### HTML links and assets

[links.ts](../../packages/cudoc-html/src/links.ts) resolves document targets from source IDs and collected routes. Markdown paths prefer source IDs; native URL paths prefer routes. Root-relative, source-relative, deployment-prefixed and custom routes are supported. Query strings and fragments are retained.

- `relative`: map known documents to local `.html` output. Keep fragment-only links local and external URLs unchanged. Other local hyperlink targets must be files that can be copied.
- `host`: map known documents to `hostUrl` plus the stored route without duplicating an existing base prefix. Fragment-only links point to the deployed current document. Other root paths are relative to the deployment base; other relative paths resolve against the deployed current document URL. External scheme URLs and protocol-relative URLs remain unchanged. No remote link checking occurs.
- `none`: replace `<a>` with `<span>` and remove hyperlink attributes from `<a>`/`<area>`, preserving labels, IDs, nested markup and images. No removed hyperlink target is resolved or copied. This is hyperlink removal, not sanitization of scripts or event handlers.

The policy runs on the complete page, including body, raw HTML, renderer callbacks, embeds, generated header/navigation/TOC, footnotes and synthetic index. The local skip link is emitted only in `relative` mode. This setting is independent of collection's `syntax.link`.

Rendering resources (`src`, and authored stylesheet `<link href>`) are processed separately and stay local in every mode when their source is local. Resources are searched beneath `sourceRoot` using the source document's directory, then beneath `assetDirs` using a URL-root path with the optional deployment base removed. Referenced files are copied with relative output URLs; external resources remain external. This is not recursive bundling of CSS imports, `url()` dependencies or `srcset` candidates.

Invalid link modes/URLs, empty inputs, unknown navigation IDs, missing assets, asset/output collisions, different assets sharing one output path, unsupported nodes and unsafe output directories fail. A local hyperlink or resource that reaches outside `sourceRoot` and every `assetDirs` root is reported as a missing local target naming both the URL and the document that carries it; it is never copied from outside those roots. Output overlap with source, library or asset roots is rejected before writing. Site publication uses staging and preserves the previous site on failure. In collection mode, library and site publication are separate; a failed site write does not roll back a newly collected library. In reuse mode the library remains unchanged. Source HTML is not sanitized and React/Vue code is not executed. The generated shell has no client-side JavaScript dependency.

CLI ([source](../../packages/cudoc-html/src/cli.ts)):

```sh
cudoc-html build [sourceRoot] [--out-dir site]
cudoc-html build --config site.config.mjs
cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
cudoc-html build docs --library .cudoc/documents --out-dir shared-html --links none
```

CLI defaults are `docs` and `site`. ESM config must default-export an object; JSON is supported, while callback functions require ESM or the programmatic API. Explicit source, `--out-dir`, `--library`, `--links` and `--host-url` override config. Repeated `--asset-dir` flags form an array that replaces config `assetDirs`. Relative paths use the invoking working directory. Success prints the build result as JSON; errors set exit code 1. There is no watch or single-file bundling command.
