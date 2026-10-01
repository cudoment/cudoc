# Adapter APIs and pipelines

**English** | [한국어](./adapters.ko.md) · [API reference](./README.md)

## remark

Source: [prepare.ts](../../packages/cudoc-remark/src/prepare.ts), [options.ts](../../packages/cudoc-remark/src/options.ts). The default export from `cudoc-remark` or `cudoc-remark/prepare` is `cudocPrepare`, a unified plugin accepting `CudocRemarkOptions`.

Recommended options are the `DocumentOptions` fields `syntax`, `host`, `format`, `calloutTypes`, `components`, `headingIds`, `tableColumnWidths` and `ignoreDiagnostics`, plus `tableColumnLayout`, `toc` and `transforms`. `tableColumnWidths` resolves with the same validation as `tableColumnLayout` and runs before it; `ignoreDiagnostics` is handed to `normalizeDocument` unchanged ([document options](./document.md#document-options)). Omitting options or passing `syntax: {}` uses component-free defaults. The plugin installs frontmatter parsing and adds directive parsing in the portable Docusaurus pipeline. It brings no parser of its own: the host's processor parses Markdown and MDX, and GFM comes from the host or `remark-gfm`.

Pipeline behavior:

1. Resolve options and reject unknown top-level keys.
2. Remove the `[cudoc-library]` link reference definition that `cudoc-remark/loader` appends, so it never reaches the rendered page or an exported tree.
3. By default, remove YAML content nodes and call `normalizeDocument` with the source text. Add diagnostics to the VFile. This also applies without a file path and when `format: "md"` is explicit.
4. Run optional custom `transforms.pre`/`post` in a traversal after normalization. Here pre/post mean traversal entry/exit, not before/after the built-in normalization stage.
5. Collect optional TOC; add its ESM export only when the effective format is `mdx`. An explicit `format` takes precedence over the file extension.

Explicitly setting `headingMetadata`, top-level `badge` or top-level `tableCellList` opts an MDX pipeline into the low-level named-component transforms. Those options cannot be combined with `syntax`; doing so throws. Markdown files always use portable normalization, so configure their features through `syntax`, not these component-only options. The default authoring setup never requires `Anchor` or `Badge` registration. Low-level transform tests opt in explicitly; default rendering is tested without any component provider.

`toc` defaults to false. `toc: true` uses `{ titleDepth: 1, depths: [2,3], exportName: "toc" }`. Title depth can be false; collected depths can have one or two entries from 1 to 6. `Toc` is `{ title: string | null, headings: { id, text, children: { id, text }[] }[] }`. Only linkable headings are collected. Additional options customize anchor naming and badge delimiters. Docusaurus and Nextra reject `toc` because the host owns its TOC.

`getFileSource(file) → string | null`, `resolveOptions(options?)`, `buildTransforms(resolved) → {pre, post}` are exported support functions. `buildTransforms` builds the named-component transform sequence; it is not a substitute for `normalizeDocument`.

### remark entry points

| Import                             | Exports/purpose                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cudoc-remark`                     | Default/named `cudocPrepare`, option types/resolver, transforms, TOC helpers, heading promotion, host plugin factory, `createCompilerCapture` and `CompilerCaptureOptions` |
| `cudoc-remark/prepare`             | Preparation plugin and transform/source helpers                                                                                                                            |
| `cudoc-remark/heading-ids`         | Default/named `promoteAnchorIds`; copies configured anchor IDs to heading HTML data                                                                                        |
| `cudoc-remark/host-plugins`        | `createHostPlugins`, `HostPluginOptions`                                                                                                                                   |
| `cudoc-remark/badge`               | Badge transform/resolver and defaults                                                                                                                                      |
| `cudoc-remark/table-cell-list`     | Cell-list transform and parsing helpers, re-exported from `@cudoment/cudoc/transforms/table-cell-list`                                                                     |
| `cudoc-remark/table-column-layout` | Layout transform, options, table construction and splitting, re-exported from `@cudoment/cudoc/transforms/table-column-layout`                                             |
| `cudoc-remark/toc`                 | `createToc`, `resolveTocOptions`, `collectHeadingToc`, `addTocExport`, TOC types/default export name                                                                       |
| `cudoc-remark/embed`               | Prepared-embed splicing plugin; `restoreExpressions`                                                                                                                       |
| `cudoc-remark/loader`              | Bundler loader tying documents to the prepared library; `libraryLoader`, `libraryFingerprint`, `stripLibraryMarker`, `LIBRARY_LOADER`                                      |
| `cudoc-remark/components`          | Named `Anchor`, `Badge`, `cudocComponents` for low-level named-component output                                                                                            |

Transform functions can run in-process; function-valued options cannot cross a JSON-only bundler worker boundary. Next.js Turbopack configuration uses package-name plugin strings and serializable options.

## Compiler capture

Source: [capture.ts](../../packages/cudoc-remark/src/capture.ts). Import `createCompilerCapture` from `cudoc-remark`.

```ts
createCompilerCapture(options?: CompilerCaptureOptions): {
  remark: Plugin<[], Root>
  rehype: Plugin
  read(): CompiledDocument
}
```

Create one capture object per compilation. Its remark plugin keeps the current tree reference; its rehype plugin clones that tree after native remark plugins, lowers static native JSX, removes YAML/ESM nodes and records frontmatter from `file.data.frontMatter` or `file.data.frontmatter`. `read()` throws if compilation has not reached the capture stage.

The remark plugin also records each `image` node's `url`, `alt` and `title`. A host plugin that rewrites such a node in place before the rehype plugin runs, as Docusaurus turns a local image into an `img` JSX element whose `src` is a `require()` call, leaves a node the capture marks with `data.cudocImage` holding those three values ([captured images](./document.md#semantic-ast)), so the stored tree still says which image the author wrote. A plugin that puts a new node in its place leaves nothing to mark.

`CompilerCaptureOptions.aliases` maps path prefixes the host resolves by itself to the prefix an image is recorded under instead, the longest matching prefix first; the recorded `url` of every image changes, whether the host kept the image or made a component of it, and the host's own page does not. Docusaurus reads `@site/static/img/logo.png` from the site directory and serves the file at `/img/logo.png`, so its collector passes `{ "@site/static/": "/" }`, one entry per static directory, and the check and the export find the file through their asset directories. An `@site/` path outside the static directories matches no alias and has no address the site serves, so it is recorded as written and the check reports it as `missing-asset`. Only images are recorded this way; a link, even one Docusaurus resolves through `@site/`, keeps the path it was written with. A value that is not an object mapping non-empty prefixes to strings throws `capture aliases must map path prefixes to strings`.

The current capture result has `diagnostics: []`; warnings emitted on the host VFile are not copied into it. Capture concerns the final remark tree, not arbitrary later rehype transforms or executed component output. Keep source positions until collection has made its source snapshot.

During collection, install cudoc syntax and capture, but omit the prepared-embed insertion plugin. Preserve the `cudoc-embed` fence so the resolver can read it after all documents have been collected. Use the actual host processor with the same plugin/configuration settings for collection and replacement.

## Prepared-embed splicing

Source: [embed.ts](../../packages/cudoc-remark/src/embed.ts), [loader.ts](../../packages/cudoc-remark/src/loader.ts).

`cudoc-remark/embed` default export accepts `{ sourceRoot?: string, roots?: SourceRoot[], outDir?: string }`, defaulting to `sourceRoot: "docs"` and `.cudoc/documents`. Give it the same `roots` collection used and it derives the same ID: the base of the innermost root containing `file.path`, then the path under it, without the extension. The roots are resolved only when a fence is met, so a file outside every root compiles as long as it embeds nothing, and fails naming the file when it does. The splicing itself is `expandPreparedEmbeds` from `@cudoment/cudoc/node/prepare-embeds`, the function the markdown-it adapters and `cudoc-export` use too ([prepared embeds](./node.md#prepared-embeds)): it numbers fences, validates prepared data against `file.value` without the loader's marker, and replaces each fence with the children of the prepared block from `embeds.json`, cloned and spliced into the tree where the fence was. Only documents with fences read prepared data. Data prepared from another source fails with `cudoc: stale prepared embeds for <id>; recollect documents`, and a fence without a prepared block with `cudoc: prepared embed missing in <id>; recollect documents`.

The spliced nodes are ordinary mdast from that point on: the host's remaining remark plugins, remark-rehype and its component mapping treat them exactly like the document's own content, so a component in an embedded section renders through the host's components and a code block reaches the host's highlighter. Nothing is rendered to an HTML string, no wrapper element is added, and no runtime component or data import is generated. A stored block carries no `estree` — the AST export strips it — so `restoreExpressions(node, documentId)` parses one again from the expression text the export kept, for every `mdxFlowExpression`, `mdxTextExpression`, `mdxJsxAttributeValueExpression` and `mdxJsxExpressionAttribute` in the block, with acorn and its JSX extension: a value or flow/text expression as `(value)`, a spread attribute as `({value})` the way the MDX parser builds it, and an expression holding only a comment as an empty program. Text that does not parse is an error naming the document and the expression. Embedded headings keep their `hProperties.id`, so they render as anchors. They are not in cudoc-remark's own `toc` export, which `cudoc-remark` computed before this plugin ran. Whether the host's table of contents lists them depends on when the host reads the tree: Docusaurus computes its TOC in a default remark plugin, which runs before `docs.remarkPlugins` where this plugin is installed, so embedded headings are not in it; Nextra builds its TOC from the final tree and lists them. A `cudoc-embed` fence inside an embedded section was already expanded by the resolver, so nested embeds arrive expanded. Authors register no cudoc components.

Because the compiled page now holds the library's content, it depends on `embeds.json`, which a bundler cannot see a remark plugin read. `cudoc-remark/loader` is a webpack/Turbopack loader registered on the same files, ahead of the MDX loader, and it does three things. It declares `embeds.json` as a dependency of the module through `addDependency`, which a dev server and webpack's persistent cache watch. It appends one line to the source, `[cudoc-library]: #<sha256 of embeds.json>` after a blank line — a link reference definition, which renders nothing in Markdown and in MDX — so the MDX loader's input changes whenever the library does; Turbopack caches by comparing task outputs, and a loader that leaves the source untouched can never reach the compile downstream of it. And it carries a `fingerprint` of the library in its options, computed when the bundler configuration is evaluated, which is what makes Turbopack's persistent build cache run the loader again between two builds at all. The embed plugin removes the marker with `stripLibraryMarker` before comparing the source with the library's snapshot, so the freshness check sees the file as written; running the loader twice does not stack markers. `libraryFingerprint(outDir?)` is the SHA-256 of `embeds.json`, `""` before it exists, cached on the file's size and mtime. `libraryLoader(outDir?)` returns `{ loader: "cudoc-remark/loader", options: { outDir, fingerprint } }` as plain JSON for a webpack `use` entry or a Turbopack `loaders` entry; in a build script the configuration is evaluated after `cudoc collect`, so the fingerprint is the new library's. Verified on the Next.js example: with the loader, a recollection between two `next build` runs that keep `.next/cache` reaches the embedding page under both bundlers; without it, the page compiled from the previous library is served until its own file changes or the cache is cleared.

## Docusaurus and Nextra

Sources: [host-plugins.ts](../../packages/cudoc-remark/src/host-plugins.ts), [Docusaurus](../../packages/cudoc-docusaurus/src/index.ts), [Nextra](../../packages/cudoc-nextra/src/index.ts).

Both packages export `cudocRemarkPlugins(options?) → PluggableList`, `promoteAnchorIds` and option types. Each `cudocRemarkPlugins` is the shared factory from `cudoc-remark/host-plugins` called with its own package name and host:

```ts
createHostPlugins(
  options: HostPluginOptions | undefined,
  adapter: string,
  host: "docusaurus" | "nextra",
): PluggableList
```

`HostPluginOptions` is `CudocRemarkOptions` without `toc`, `host` and `headingIds`, plus `promoteHeadingIds?: boolean` (default true). Those three are the adapter's to set, so passing one is an unknown-option `TypeError` naming the adapter, like any other unknown key; a `host` argument other than the two is a `TypeError` too. The remaining options are resolved when the factory is called, so a rejected value fails as the site configuration loads. The factory sets `host`, forces `headingIds: "host"` and disables cudoc's TOC, and returns, in order, entries that are each a plugin or a `[plugin, options]` pair (the Docusaurus-only plugin is bare, because Docusaurus refuses a one-element array when it validates its configuration):

1. `cudocPrepare` with those options;
2. `promoteAnchorIds`, unless `promoteHeadingIds: false`, which copies each anchor id onto its heading's `hProperties.id` so the host uses it instead of slugging the heading text;
3. on Docusaurus only, a plugin that moves a heading's `hProperties.id` into `{#id}` text at the end of the heading when Docusaurus's slugger would change it. Docusaurus runs an id already on a heading through its slugger again, which turns `v1.2` into `v12`, but keeps a trailing `{#id}` as written; its table of contents reads the same value, so the heading, its anchor and the entry agree. An id made only of letters, digits, hyphens and underscores stays on the heading, where the slugger returns it unchanged and records it, so a later heading whose text slugs to the same value gets `-1` rather than the same id, and a second heading written with the same id gets `-1` too. The slugger records the ids it makes from text as well, so in the reverse order, `## Setup` followed by `## Intro (#setup)`, it is the explicit id that comes out as `setup-1` on Docusaurus, and on Nextra, whose slugger also takes every id in document order; the markdown-it hosts and standalone compilation keep `setup` on the explicit one and number the earlier heading instead. Write the heading with the explicit id first, or give the other heading an id of its own, and every host agrees. The page's `#` heading always keeps its id there: Docusaurus reads the page title from that heading's text before it takes a `{#id}` out, so the marker would become part of the title; an id on that heading that the slugger changes, `(#v1.0)` for instance, therefore comes out changed there, so give a page heading a slug-shaped id.

Nextra runs every heading id through its slugger, its own `[#id]` included, so there an id keeps its spelling only when it is slug-shaped already: `(#v1.2)` renders as `id="v12"`, `(#release-2)` unchanged. That slugger takes the ids in document order, so, as on Docusaurus, an explicit id that an earlier heading's text already produced is the one numbered `-1`. An anchor written in lowercase letters, digits and hyphens, on a heading that comes before any heading whose text would make the same id, resolves the same on every host.

| Host       | Installation position                                                      | Real collection example                                                    |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Docusaurus | `docs.beforeDefaultRemarkPlugins`; embed insertion in `docs.remarkPlugins` | [collect.mjs](../../examples/docusaurus/collect.mjs), actual MDX processor |
| Nextra     | `mdxOptions.remarkPlugins`, which Nextra prepends to its native plugins    | [collect.mjs](../../examples/nextra/collect.mjs), `nextra/compile`         |

Docusaurus additionally exports a default plugin returning `{ name, getThemePath }` and `./package.json`. That plugin supplies named-component theme mappings; it is unnecessary for the guide's explicit `syntax` setup. Nextra additionally exports `./components` and `./package.json`; component mappings are likewise not required for that setup.

The Docusaurus example uses an internal version-specific MDX processor entry point. Recheck it with dependency upgrades. Host setting alone does not make standalone parsing equivalent to either native pipeline.

## markdown-it

Sources: [tokens.ts](../../packages/cudoc-markdown-it/src/tokens.ts), [plugin.ts](../../packages/cudoc-markdown-it/src/plugin.ts), [compiler.ts](../../packages/cudoc-markdown-it/src/compiler.ts), [options.ts](../../packages/cudoc-markdown-it/src/options.ts), [host.ts](../../packages/cudoc-markdown-it/src/host.ts), [text.ts](../../packages/cudoc-markdown-it/src/text.ts). Import from `cudoc-markdown-it`.

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
markdownItText(source: string): { text: string; toSource: (offset: number) => number }

type TokenConversion = {
  adapter?: string
  token?: TokenNode
  render?: (tokens: Token[], start: number, end: number, inline: boolean) => string
  origins?: Map<DocumentNode, Token>
}
```

This is the markdown-it counterpart of `cudoc-remark`: the shared arrangement lives here and each host adapter contributes only a `MarkdownItHost`. `HostPluginOptions` is `DocumentOptions` without `host`, `format` and `components` — including `tableColumnWidths` and `ignoreDiagnostics` — plus optional `onDocument(tree, source, env)`, `onDiagnostic(diagnostic, documentId)`, `library` and `outDir` (prepared-data path defaults to `.cudoc/documents`). `resolveHostOptions` runs while the plugin is installed, so these fail as the site configuration loads rather than from inside a core rule: an unknown key, a non-object argument, a `headingIds` other than `"host"`, an invalid `syntax`, `components` (it maps MDX elements, which markdown-it never produces), and a `tableColumnLayout` or `tableColumnWidths` that is not an array of valid rules, checked by the same resolvers the remark adapters use and named by index, such as `tableColumnWidths[0]`. The plugin forces the host's own semantics, `format: "md"` and native heading generation. `@types/markdown-it` is an optional peer dependency of this package and of both markdown-it adapters, for sites that type check their configuration.

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

`tokensToAst` converts real markdown-it tokens to mdast after native processing and never parses the Markdown a second time. It maps the block and inline tokens every host produces alike, `emoji` tokens (markdown-it-emoji, which VitePress enables) as the character they hold, `github_alert_*`, and `markdown-it-container` blocks: `container_details_*` becomes an expandable `details` blockquote, and a container becomes a callout when its name, case-insensitive, is `note`, `tip`, `important`, `warning`, `caution`, `info`, `danger`, one of the host names `default`, `error` and `warn` that the callout types alias, or a registered `calloutTypes` entry. Any other container, such as VitePress's `code-group` and `raw` or one the site registers, opens and closes the host's way: its open and its close token each become an `html` node the host renders, and what lies between is converted like the rest of the page, so a heading anchor or an embed inside a code group or a box is still one. The host's `token` hook is consulted before that mapping, so a host's own element can replace the default conversion. Table-cell inline parsing uses the same configured parser. A link and an image keep the token's attributes as `hProperties`, `href` and `src` included, and carry the token's `title` as their own; an image's `alt` is its label read as plain text, as mdast reads one (code and entities kept, a soft line break a newline, a hard one nothing), and the empty `alt` placeholder markdown-it keeps among the attributes is left out, since it would otherwise override that text. A heading names its id the host's way only with `{#id}` at the end outside code spans, so ``## Write `{#id}` here`` documents the syntax rather than using it.

A token nothing here maps other than such a container, with its matching close when it opens a block, is kept as an `html` node holding `conversion.render(tokens, start, end, inline)`, where `start` and `end` are indexes into `tokens` and `inline` says whether they are an inline token's children. Without `render` such a token fails with `conversion.adapter` in the message rather than disappearing. When `origins` is given, it is filled with the block token each `code` and `html` node came from.

Three details keep the converted tree equivalent to the remark lineage's. Column alignment, which markdown-it reports only as an inline style on each cell, is collected onto the table node's `align` array. A heading permalink is marked `data.cudoc.kind: "permalink"` while the tokens are converted, before normalization, so any transform that reads a heading's own text can exclude it; its `href` is corrected afterwards, once the id is resolved. And a native alert title that only repeats its own type, which a host may insert for an untitled `> [!TIP]`, is dropped, so the same Markdown produces the same callout on every host.

The plugin pushes one `md.core` rule, so native anchors, links and containers are already tokens when cudoc reads them. The host slugged every heading before this rule without knowing the IDs cudoc settles from `(#id)`, so the IDs it gave headings without an explicit one are held aside during normalization, where the duplicate check sees only IDs written in the document, and then put back numbered past any ID already taken: `## Intro (#setup)` followed by `## Setup` gives `setup` and `setup-1`, as on the other hosts. After normalization it copies the resolved heading IDs and titles back onto the host's own `heading_open` tokens, which is what keeps the host's heading anchors and table of contents in agreement; a heading without a resolved id is left to the host, and a permalink's `aria-label` in cudoc's output names the resolved title rather than the heading as written. `env.cudoc` stores `{ tree, source, diagnostics }` once the rule has run, and `onDocument` receives a cloned tree before embed expansion.

The page is then rendered in two layers. The host renders its own token stream first, exactly as it would without cudoc, so its render-time work happens once: VitePress lifting `<script setup>` and `<style>` into the page component, a host recording links for its dead-link check. cudoc then renders the normalized document and puts the host's own output back for every `fence`, `code_block` and `html_block` it did not change, so highlighting, line numbers, copy buttons and snippet imports survive, and an HTML block the host rendered to nothing stays nothing. A code block that arrived through an embed has no host token, so one is made from its language and meta and handed to the host's fence rule, which gives it the page's highlighting and copy button; what a host keeps outside the fence's info string, such as the line-highlight marks VitePress moves into token attributes, is not collected and does not reach the copy. The `cudoc-embed` and `cudoc-pagebreak` fences never reach the host's fence rule, at collection or on the page, since cudoc puts something else where they were. Tokens the conversion does not map, such as a `[[toc]]` table of contents, math or footnotes, are rendered by the host's rules with the whole token list, so a rule that reads its neighbours still finds them; a block is rendered once the resolved heading IDs and titles are on the host's tokens, so a table of contents links to `#setup` and reads `Install` for `## Install (#setup)`. `env.cudocRendered` is set to the returned HTML when the page is rendered.

Diagnostics normalization reports while the site renders a page, such as an unregistered callout type or two headings sharing an id, go to `onDiagnostic(diagnostic, documentId)`; by default each is a `console.warn` line `<adapter>: <document id>:<line>: <code>: <message>`. The host hands the renderer a page without its front matter; when `library` holds that page, positions are shifted to count lines from the top of the collected file, and otherwise they count from the first line after the front matter. Nothing is reported there while collecting, because collection returns the diagnostics with the compiled document.

For normal rendering, a library that still has its sync compiler resolves embeds on the spot; a loaded library without the compiler reads `embeds.json` through `expandPreparedEmbeds`. A page with embeds and no `library` fails with `build documents and provide library before rendering embeds`. The page must be the source that was collected: the collected text, read as markdown-it reads it, has to end with the text the renderer was given, with nothing ahead of it but front matter, possibly empty, and a byte order mark, or rendering fails with `stale collected source <id>; recollect documents`. When the page pulls in other files with VitePress's `<!--@include: ...-->`, the error says so instead, because collection does not expand includes and an embed in such a page cannot be matched. A fence without a prepared block fails as in [prepared-embed splicing](#prepared-embed-splicing).

`createHostCompiler` renders with `env.cudocCollect: true`, suppressing embed expansion. It maps positions back to the file after front-matter processing, taking the body as the end of the source so a front-matter field that repeats the body's text cannot move it. markdown-it reads every `\r\n` and lone `\r` as `\n` and every NUL as U+FFFD before it parses, so the body is found in the source read the same way, and each offset is moved back past the `\r` of every `\r\n` before it, into the file's own text that the source snapshot and its section ranges slice; lines count the same in both. `markdownItText(source)` is that reading: `text` is the source as markdown-it reads it and `toSource` maps an offset in `text` back to `source`, for an adapter that compares a source with `state.src`. It returns front matter and the diagnostics normalization reported, with their positions mapped the same way, and requires the adapter already installed on `md`. React `.mdx` is rejected. Use the same configured renderer for replacements.

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

| Host      | Renderer the site and collector share          | Document ID                               | Host definition                                        |
| --------- | ---------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| VitePress | `createMarkdownRenderer` from `vitepress`      | The file read, from `env.realPath`/`path` | `<Badge>` token conversion, `resolveInlineAttributes`  |
| Eleventy  | `createMarkdownRenderer` from `cudoc-eleventy` | `env.page.filePathStem`                   | gray-matter front-matter split, rewritten-source check |

VitePress puts the served page in `env.relativePath`, which `rewrites` and dynamic routes make differ from the file the page was read from, and collection names documents by file. The adapter therefore takes the id from `env.realPath` under the source directory (`env.path` without `env.relativePath`) when the two differ, and from `env.relativePath` otherwise, without `.md`; a rewritten page resolves its embeds against the document it was collected as.

VitePress resolves some links during inline rendering, so its definition sets `resolveInlineAttributes` and the pipeline renders cloned tokens to capture those URLs without applying base paths twice to the original tokens. Its `token` hook converts a static `<Badge type="tip" text="1.0" />` into cudoc's badge; a badge carrying a Vue binding stays raw HTML because its text is not known until the component runs. Static native containers, links and badges are handled, and dynamic Vue expressions are not evaluated.

Eleventy passes the page data object as the markdown-it env and strips front matter with gray-matter before markdown-it, so its definition supplies both `documentId` and `frontmatter`. `createMarkdownRenderer` applies Eleventy's own renderer defaults (`html: true`, indented code blocks disabled), runs the site's `configure` callback, then installs cudoc last so it wraps whatever fence renderer the site registered. Two site settings are contractual rather than advisory: `markdownTemplateEngine: false`, because the adapter throws when `page.rawInput`, read as markdown-it reads it so that `\r\n` line endings match, differs from the text markdown-it was given, which shows another engine already rewrote the source; and a heading permalink inserted inside the heading rather than wrapping it, because a wrapping permalink moves the heading's own text out of the heading where cudoc reads its `(#id)` anchors. Native syntax comes from the plugins the site registers: `markdown-it-attrs` for `{#id}` and `markdown-it-container` for `::: warning Title`. A page with embeds rendered without Eleventy's page data in the env fails with `the markdown-it env carries no Eleventy page data`, and one without `page.filePathStem` fails naming it. The default export is a markdown-it plugin: handed to `eleventyConfig.addPlugin`, it receives the Eleventy configuration and throws `this is a markdown-it plugin, not an Eleventy plugin`, naming `setLibrary`.

Embedded content is spliced into cudoc's tree, not into the host's tokens, so a table of contents is only as complete as what it reads. VitePress's default theme builds its outline in the browser from the rendered headings, so embedded headings, which keep their ids, are in it; a `[[toc]]` in the page is rendered from the host's tokens and lists the page's own headings only. Eleventy has no table of contents of its own: one built by a markdown-it rule sees the page's own headings, and one built from the rendered HTML sees the embedded ones too.

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
2. With `library`, use `loadLibrary` and clone the stored trees. [library.ts](../../packages/cudoc-export/src/library.ts) inserts the prepared blocks with `expandPreparedEmbeds`, matching document ID, source text and fence order. This supports asynchronous native compilation and original-source replacements without recompiling at export time. Any `DocumentOptions` supplied alongside `library` cause an error; collection owns those settings. No shared library files are written.

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

A callout is drawn in `--accent` and `--wash` unless its type is in the severity table, `CALLOUT_SEVERITY` in [design/tokens.ts](../../packages/cudoc-export/src/design/tokens.ts): `warning` takes `--warn` and `--warn-wash`; `caution`, `danger` and `error` take `--danger` and `--danger-wash`. The stylesheet's `.cudoc-callout-<type>` rules are generated from that table and the Word callout styles read it too, so a callout is one colour in every format.

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
    code:
      | "dropped-html"
      | "html-as-text"
      | "image-as-text"
      | "dropped-footnote-table"
      | "unsafe-link"
    message: string
    document: string
  }[]
}

type RunningText = string | { left?: string; center?: string; right?: string }

type PageLength = string | number // "20mm", "1in", "54pt", or millimetres

type PageOptions = {
  paper?:
    | "A4"
    | "A5"
    | "A3"
    | "Letter"
    | "Legal"
    | { width: PageLength; height: PageLength }
  orientation?: "portrait" | "landscape"
  margin?: {
    top?: PageLength
    right?: PageLength
    bottom?: PageLength
    left?: PageLength
  }
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
170×255mm content box. Every length, the paper's `width` and `height` and each
margin, is a number in `mm`, `cm`, `in`, `pt` or `px`, a bare number meaning
millimetres, and is converted once to millimetres rounded to 0.01mm, because
the browser's print call takes only `px`, `in`, `cm` and `mm` and reads a bare
number as pixels; anything else fails with
`cudoc-export: unusable page length <value>`. A header or footer needs a margin
of at least 15mm on its side, because Chrome clips a running line that does not
fit; a narrower margin with a running line is an error. A `{page}`, `{pages}`,
`{title}` or `{date}` field is substituted in either format; `{title}` is the
document's title in a per-document file and the volume title in the bound file;
`{date}` is `page.date` verbatim. The PDF draws a running line in a template
document of its own that reads no stylesheet, so its face, size and colour are
written inline from the tokens: the `fonts.sans` stack, `text.xs` at
`print.baseSize` (8.53pt by default) and `colors.light.faint`. Word's
`CudocRunning` style takes the same size and colour in the Word face,
`word.sans`. `breakBefore: n` breaks before every heading of
depth `n` or shallower except a document's first block, in the print stylesheet
and as a paragraph property in Word. `linkUrls` appends ` (url)` after an
`http(s)` link in both, and in the print HTML after a volume link that carries
`data-cudoc-url`. `authoredBreaks: false` makes the print stylesheet's
`.cudoc-page-break` rule `break-after: auto` and the Word writer skip the node.
A break that opens a document — a top-level break that only front matter,
definitions or an HTML comment precede — is dropped by both writers whatever
the setting, because the document starts on a page already, and the block
after it counts as the first; a break nested in a container is left alone.
`wideTables: { minColumns: n }` gives every table with at least `n` columns in
its first row — spans counted — a landscape page: the print HTML wraps the
table in `<div class="cudoc-wide">`, printed on the named page
`@page cudoc-wide` whose size is the portrait page turned and whose margins are
inherited, and the Word writer splits the document into sections around the
table, the table's section carrying `w:orient="landscape"` and the same running
text on a tab stop sized to the wider column. A table inside another table's
cell is never wide, and neither is a document's first block: Chrome answers a
named page on the first element with a blank page in front of it, and the Word
writer applies the same exclusion so the two outputs agree. A page break
directly before or after a wide table, blank text and comments aside, is dropped in both:
the landscape page or section already breaks there, and the empty break
element after it would print a blank page. A break anywhere else stays.

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
file once; a `postinstall` installs that shell and never fails an install. It
is skipped when `CUDOC_SKIP_BROWSER_DOWNLOAD` or
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` holds anything but an empty value, `0` or
`false`, and npm 12 and later run it only once the project approves it
(`npm install-scripts approve cudoc-export`, then reinstall).
`cudoc-export install-browser` runs the same installer either way. When the
browser is absent and a PDF is requested, the export throws naming that
command. `docx` writes `<id>.docx` and `<volume>.docx` with the `docx` package,
walking the same mdast the HTML renderer consumes.

**The bound volume** is the documents in navigation order, each in its own
`<article class="cudoc-doc" id="cudoc-<token>">` and in its own Word
section, preceded by a cover section and a contents section unless `volume`
turns either off. The token is `idToken(id)` from `@cudoment/cudoc/document`:
the document id with every character other than an ASCII letter, a digit or
`-` written as `_<hex code point>_`, so `guide/개요` becomes
`guide_2f__ac1c__c694_`. Every id inside a document is prefixed with
`cudoc-<token>-` and keeps its own spelling after it, and a link into another
document is spelled as that prefixed fragment, its anchor percent-decoded, so
two documents cannot collide and every cross-document link resolves inside the
file. The cover fills the page's content box,
so the running header and footer keep their place on it; a cover image is its
`background-image`, cropped as `background-size: cover`, and in Word a floating
picture anchored to the margins behind a title paragraph on a paper-coloured
band. The PDF contents carries the page each document starts on, measured by
printing the front matter alone and each document alone, then checked: the
volume must be exactly that sum, or the export fails rather than print wrong
numbers, with `… so the contents page numbers would be wrong. A document prints
at a different length inside the volume than alone, or does not start on a page
boundary.` The number column (`.cudoc-contents-page`) is at least 4ch wide and
right-aligned, so a title wraps the same around the placeholder the measuring
print holds as around its number. `contents.pageNumbers: false` skips the
measuring print. The Word
contents is a `TOC` field over first-level headings with the document list as
its current value, each entry linked to a bookmark at the document's start, and
`updateFields` set so Word fills the page numbers on opening; viewers that do
not update fields show the titles. Under `links: "none"` the entries are plain
text in both formats.

**Links in the paginated outputs** follow `links` exactly as the site does,
resolved once to a target and spelled per format. Inside the volume a link to
another exported document is a fragment (`#cudoc-<token>-<anchor>` in HTML, a
bookmark in Word), and one to a `private` document, which no file holds, is
its deployed URL, as in the linking document's own print; a fragment is percent-decoded before it names a bookmark in
Word or an element in the volume, and a document's own print HTML keeps it as
written for the browser to match, so `#%EA%B0%9C%EC%9A%94` reaches the heading
`개요` in every format. In a per-document file it is the sibling `<id>.pdf` or
`<id>.docx` without a fragment under `relative`, the deployed URL under `host`,
and removed under `none`. Under `host` the volume's fragment also carries
`data-cudoc-url`, the deployed URL that document's own print links to, and with
`linkUrls` the print stylesheet appends it as it does after an `http(s)` link
(`a[data-cudoc-url]::after`), so a document prints at the same length inside
the volume as alone. A same-document fragment stays inside the file under
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
footnotes numbered across the file. A Word footnote holds paragraphs only, so a
table inside one is dropped and reported as `dropped-footnote-table`. A table
written as HTML in an MDX document, which MDX lowers to elements, keeps its
`rowspan` and `colspan` (either spelling): Word merges the covered cells, the
rows below leave those columns out as HTML does, and a short row is padded only
in the columns no cell above covers. A cell spans rows only within its row
group, a `thead`, `tbody` or `tfoot` or a run of rows written straight in the
table, as the browser draws it: `rowspan="0"` reaches the group's last row, and
a longer span stops there. Any other element between rows, such as a
`caption`, ends a run, and an empty `<tr>` takes its place in a span, as it does
in the browser, without becoming a row of the Word table. Rows keep their source
order, so a `tfoot` written before the body stays there, where a browser draws
it last. In a `.md` document the same table is an
`html` node, dropped as `dropped-html`. A `<br>` is a line break. A top-level
ordered list numbers from its `start`, and a nested one from 1; Word
sets a start only per numbering definition, so every start other than 1 that a
file uses adds `cudoc-ordered-from-<n>` and `cudoc-ordered-from-<n>-cell` beside
`cudoc-ordered`, `cudoc-bullet` and their `-cell` sets, and a sublist of the
other kind numbers on its own. A task item's first paragraph leads with ☑ or ☐.
A `javascript:`, `vbscript:` or `data:` link keeps its text without the link
and is reported as `unsafe-link`. Colour, font, size, shading and border
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

**Trees** are read through the same module: `TREE_KIND`, `TREE_CLASS`,
`TREE_PRINT_ATTRIBUTE`, `isTree(node)` and `treePrintDepth(value)`. A tree
embed prints as the nested list it is down to its `print` level, read from the
outer list's `data-cudoc-print`: each item's `summary` line becomes the item's
own text, the lists in its `details` follow it, and the levels past `print` are
left out. The print HTML does this to its hast with `printTrees` before it opens
the other details, and the print stylesheet bullets those items again; the Word
writer does the same to the mdast before writing the list, so every line is a
list paragraph at its own level.

**Print rules** correct three defects the screen stylesheet had for paper: a
table was `display: block`, which silently disabled `table-header-group`; `pre`
and callouts promised `break-inside: avoid`, which cannot hold once a block is
taller than a page; and body text was repainted black. The builder also opens
every `<details>`, because Chrome prints a closed one as its summary alone; a
tree's are written out first, as described above.

Subpaths: `cudoc-export/docx` exports `buildDocx`, `writeDocx`, `bookmarkName`
and the `Docx*` types, `DocxWriterOptions` and `DocxComponentRenderer` among
them; `cudoc-export/pdf` exports `openPrinter(page, options?, tokens?)`,
`printPdfs(jobs, page, options?, tokens?)`,
`runningTemplate(text, title, date, geometry, tokens?)`, whose `tokens` default
to `designTokens` and set the running line's type, `browserAvailable`,
`launchBrowser`, `pdfPageCount`, `browserInstallCommand`, `BROWSER_CHANNEL`
and the `PdfOptions`, `PrintJob` and `Printer` types;
`cudoc-export/print` exports `writePrintOutputs`, `printStylesheet`,
`fillVolumePageNumbers`, `resolveVolumeOptions`, `namespaceIds`,
`namespaceDocument`, `volumeId`, `volumePrefix`, `printFileName`,
`openDetails`, `printTrees`, `tableColumns`, `dropLeadingBreaks`, `wrapWideTables`,
`localizeAssets`, `srcSetCandidate`, `urlPath`,
`PRINT_STYLESHEET`, `DEFAULT_VOLUME_NAME` and `VOLUME_FILE`, with the
`PrintableDocument`, `PrintOutputOptions`, `VolumeOptions`,
`ResolvedVolumeOptions`, `AssetMark` and `CopiedAsset` types.

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
Word's own 1.2. A callout style's rule and wash follow the severity table the
stylesheet reads (`warn` for `warning`; `danger` for `caution`, `danger` and
`error`; `accent` and `wash` for every other type), described under
[Export](#export).

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
`modified` winning. An embedded block that does not read, in a copy edited by
hand or cut short, is reported in the panel's message line (_Could not load:_
and the reason) and counts as no notes, so the stored notes still load. A
`#cudoc-notes=<token>` fragment is decoded but only offered in a bar as
unverified until the reader accepts it; accepted or not, the fragment is
removed from the address. A token that does not decode, a malformed `%` escape
included, is reported in the panel instead of offered. The token is `z.` plus base64url of
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
(UTC ISO 8601 with milliseconds, as `Date.prototype.toISOString` writes them),
optional `creator: { type: "Person", name }`, `motivation`
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
above, when a quote is missing, when an offset is negative or reversed, when a
date is not ISO 8601, or when a limit is exceeded: 2 MiB per file, 500 notes,
10 KiB per note text, 2 KiB per quote, 64 bytes per context, 200 per name or
id. A date is a calendar date (`2026-09-16`) or a date and time with `Z` or a
`±hh:mm` offset, checked against the calendar, and is stored in the UTC form
above, so dates from any offset compare as text; a local time without an
offset, or anything else `Date.parse` would accept, is refused. A file, chosen
in the panel or named on the command line, is measured in bytes before it is
read.

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
U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF) are shown as `\uXXXX`
wherever the report prints text it did not write: file and library names,
document ids and paths, heading titles and ids, fenced text, and the name and
time of each signature.
`--json` emits the same facts as JSON. The exit code is 0 when a report was
produced (a quote not found or a changed version is a fact, not an error) and
1 for a missing or invalid file or library. Text that `cudoc-embed` pulled in
is not in the embedding document's Markdown, so a note on it is `not-found`.

### Export links and assets

[links.ts](../../packages/cudoc-export/src/links.ts) resolves document targets from source IDs and collected routes. Markdown paths prefer source IDs; native URL paths prefer routes. A path spelled as a directory, `guide/`, `./` or `..`, names that directory's index document even beside a document of the directory's own name, as [`cudoc check`](./node.md#reference-checking) reads it. Root-relative, source-relative, deployment-prefixed and custom routes are supported. Query strings and fragments are retained.

- `relative`: map known documents to local `.html` output. Keep fragment-only links local and external URLs unchanged. Other local hyperlink targets must be files that can be copied.
- `host`: map known documents to `hostUrl` plus the stored route without duplicating an existing base prefix. Fragment-only links point to the deployed current document. Other root paths are relative to the deployment base; other relative paths resolve against the deployed current document URL. External scheme URLs and protocol-relative URLs remain unchanged. No remote link checking occurs.
- `none`: replace `<a>` with `<span>` and remove hyperlink attributes from `<a>`/`<area>`, preserving labels, IDs, nested markup and images. No removed hyperlink target is resolved or copied. This is hyperlink removal, not sanitization of scripts or event handlers.

The policy runs on the complete page, including body, raw HTML, renderer callbacks, embeds, generated header/navigation/TOC, footnotes and synthetic index. The local skip link is emitted only in `relative` mode. This setting is independent of collection's `syntax.link`.

Rendering resources are processed separately and stay local in every mode when their source is local: `src` on any element, each candidate of a `srcset`, read as the browser reads it (a URL runs to the next white space, so the comma inside a data URL stays part of it, and an empty candidate a stray comma leaves is dropped), a `<video>`'s `poster`, an `<object>`'s `data`, an authored stylesheet's `<link href>`, and the `href` or `xlink:href` of an SVG `<image>`, `<use>` or `<feImage>`. Resources are searched in library coordinates — a document-relative path against the document's library path, a root-relative one as a library path — and reach disk through the root holding that path, then beneath `assetDirs` using a URL-root path with the optional deployment base removed. Referenced files are copied with relative output URLs, each once however many pages and outputs name it; the path is written as a URL by `urlPath` from `cudoc-export/print`, which escapes white space, commas, `%`, `#` and `?` in a file name, so `media/a b.png` is written `media/a%20b.png` in `src` and in `srcset` alike, and a link to a copied file is written the same way in the site, the print HTML and Word; external resources remain external. This is not recursive bundling of CSS imports or `url()` dependencies.

Invalid link modes/URLs, empty inputs, unknown navigation IDs, missing assets, asset/output collisions, different assets sharing one output path, unsupported nodes and unsafe output directories fail. A local rendering resource that reaches outside every root and every `assetDirs` root is reported under every policy as a missing local target naming both the URL and the document that carries it; a hyperlink there is reported so only under `relative`, which would copy it, while `host` resolves it against the deployment and `none` removes it. Nothing is ever copied from outside those roots. A link from an exported document to a private one is an error naming both under `relative`, because the page is not in the output and copying its source would publish it; under `host` it points at the deployment, which serves the page, in every output, the bound volume included; `none` removes it like any other link. A resource, or under `relative` a link to a local file, that reaches a private document's file fails under every policy, whichever path reaches it — its root, an `assetDirs` directory, a symbolic link or another spelling of the name — because the check compares the file itself, not the path: `cudoc-export: <document> loads the private document <library path> as a resource (<url>), which would publish its source`. Output overlap with source, library or asset roots is rejected before writing. Site publication uses staging and preserves the previous site on failure. In collection mode, library and site publication are separate; a failed site write does not roll back a newly collected library. In reuse mode the library remains unchanged. Source HTML is not sanitized and React/Vue code is not executed. The generated shell has no client-side JavaScript dependency unless `annotations` or `themeSwitch` is on, each adding one local script, described under [Annotations](#annotations) and [Theme switch](#theme-switch).

CLI ([source](../../packages/cudoc-export/src/cli.ts)):

```sh
cudoc-export build [sourceRoot] [--out-dir site] [--external-path /prefix]
cudoc-export build --config site.config.mjs
cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
cudoc-export build docs --library .cudoc/documents --out-dir shared-html --links none
cudoc-export build --config site.config.mjs --annotations
cudoc-export build docs --out-dir out --format pdf --format docx \
  --granularity both --paper Letter --landscape
cudoc-export annotations review.annotations.json --library .cudoc/documents --out review.md
cudoc-export install-browser
```

`--annotations` and `--theme-switch` turn those options on. `--format` is repeatable and the list replaces config `formats`; `--granularity` sets `granularity`; `--paper <name>` (a named size: `A4`, `A5`, `A3`, `Letter`, `Legal`) and `--landscape` set `page.paper` and `page.orientation` over the config's `page`. `cudoc-export annotations <notes…> [--token token]… --library <dir> [--out file] [--json]` prints or writes the review report described under [Annotations](#annotations), and exits 1 only for a missing or invalid file or library. `cudoc-export install-browser` runs the browser installer and exits with its status. CLI defaults are `docs` and `site`. ESM config must default-export an object; JSON is supported, while callback functions require ESM or the programmatic API. Explicit source, `--out-dir`, `--library`, `--links`, `--host-url` and `--granularity` override config. Repeated `--asset-dir` flags form an array that replaces config `assetDirs`, and repeated `--external-path` flags replace config `externalPaths`. A config that lists `roots` keeps them unless a source root is given on the command line, which replaces them. Relative paths use the invoking working directory. Success prints the build result as JSON on standard output and each diagnostic as `cudoc-export: <document>: <message>` on standard error; errors, including an unknown flag or a value flag without a value, set exit code 1. There is no watch or single-file bundling command.
