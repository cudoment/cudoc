# Release notes

**English** | [한국어](./release-notes.ko.md) · [All guides](./README.md)

What changed in each version, newest first. All eight packages share one version, and [Supported versions](./README.md#supported-versions) says what a minor or a patch release keeps compatible before 1.0.0.

## 0.7.0

- A [`render: { type: tree }` embed](./embedding.md#draw-a-tree-of-documents) lists documents the way their folders nest them, `X.md` above the folder `X/` or a folder's own `index.md` above the rest, with a document's sections under it when `headings` asks: one line each, the title linked and the summary beside it, levels folded in `details` that open without a script on every host and in standalone HTML, and written out as a nested list down to `print` levels in the print HTML, the PDF and Word.
- `resolveTree` returns those lines as data, the same for the same library and spec, for a program that writes the tree in a form of its own; `buildEmbedTree` renders lines it was given.
- In a tree, an extractor also receives the line it computes as `node`, with the lines below it already complete, so a column can total what the levels below hold.
- `cudoc check` warns with `unmatched-tree-order` when a tree's `order` names nothing on its first level, and reports a tree's missing folder or document as for any embed.
- `@cudoment/cudoc/styles.css` and the exported site draw a tree as an outline, without the box a host gives an authored `details`.
- A copy inside a copy rebases each link once. When `routes` gives one document another document's path, a link in a nested copy, summary table or tree keeps the route it was given instead of turning into the other document's route, and a relative path that climbs out of the collection keeps naming the same file.

## 0.6.0

- [Supported versions](./README.md#supported-versions) lists the host releases every change is tested against, and what a minor or a patch release keeps compatible before 1.0.0.
- `cudoc-docusaurus` declares `@docusaurus/core` `^3.10.0` and `cudoc-eleventy` declares `@11ty/eleventy` `^3.1.0`, the releases each supports, so npm installs either only beside a supported host: it raises the host where the site's own range allows, and otherwise refuses with `ERESOLVE`.
- Each host guide shows every file it asks for and installs every package those files import, and is followed step by step in a new project before a release; the VitePress and Eleventy install lines no longer name `cudoc-markdown-it`, which their adapters bring.
- The Docusaurus and Nextra guides pin the fixed releases of host dependencies that `npm audit` reports advisories for, as the examples do, and the guide check fails when a site built from a guide reports an advisory its example does not. The Next.js example and guide are tested with Next.js 16.3.8, which fixes a critical advisory in `next/og`.
- Recovery after a killed build moves or removes only a directory that carries cudoc's exact ownership marker under a name cudoc gave it, so a directory someone else put beside the output is left alone; a leftover that cannot be removed fails the publication without keeping the lock.
- A root nested in another owns its files: each is collected once, under the inner root's base, a root reached through a symbolic link is matched by its real path, and one directory listed twice that way is refused.
- A Word table keeps a header cell's `min-width` on the column the cell stands in when a cell above it spans rows.
- The README and the dataset guide describe the dataset as it is: documents as collected, each embed kept as the block that names its source, and no deduplication.
- An `index.md` takes its directory's route when `routeSuffix` is `""` or `"/"`, `/docs/` rather than `/docs/index`, so a `guide.md` beside `guide/index.md` now fails with `duplicate document route` there; a link to a directory, `..` included, reaches that directory's index document in `cudoc check`, in embedded content and in the export, and `guide/` does so even beside a `guide.md`.
- A Markdown image that Docusaurus turns into its own image element is recorded when the page is collected, so an embed, `cudoc check` and the export all treat it as an image: it is checked as an asset, copied and drawn in Word, and a page in another directory that embeds it requires the image's file by a path from its own directory, as it does a linked local file. The Docusaurus collector the guide shows looks for root-relative images in `static`, as the site build does, and records an image written as `@site/static/…` at the address the site serves it from, through the new `aliases` option of `createCompilerCapture`.
- Raw HTML in an embedded section has its `poster`, `data`, `srcset` and `xlink:href` paths moved to the page that embeds it, as its `href` and `src` already were, so the export finds every resource it loads.
- The export writes each copied file's path as a URL, so a file name with a space, a comma, `%`, `#` or `?` loads from `src` and from `srcset` alike, and a link to such a file reaches it from the site, the print HTML and Word.
- Under `links: "host"` a link to a `private` document names its deployed address in the bound print HTML, PDF and Word as well, as each document's own file does, instead of an anchor or bookmark the volume does not hold.
- A resource that reaches a `private` document's file, through its root, an `assetDirs` directory or a symbolic link, stops the export under every policy instead of copying the document's source into the output.
- A relative path in an embedded section that climbs out of the collection keeps pointing at the same file from the page that embeds it, instead of being clamped at the root to another file.
- On VitePress and Eleventy an image's alt text is its label as plain text, code and entities included, as on the remark hosts; Eleventy had written it empty.
- The configuration hash includes the `@cudoment/cudoc` version, so the first collection after an upgrade, `cudoc collect --watch` included, compiles every document again instead of reusing trees the previous release produced. Collect again after upgrading: a library the previous release wrote is read as it is.
- For an embed, `cudoc check` offers heading ids only as `available`, since an id raw HTML declares starts no section, and it names the document once in `no sections matched`.
- `cudoc check` finds an embed's fence by parsing the source as Markdown (MDX for `.mdx`) and matching each fence to its block by text, so a `cudoc-embed` fence shown inside a longer fence or an indented code example no longer takes the line of the embed after it, an embed inside a quote, a callout or a list item keeps its own line, the column counts from the start of the line, and a block the host reads differently from Markdown gets no position rather than the line of a block with other text.
- `cudoc-eleventy` handed to `eleventyConfig.addPlugin` says to pass `createMarkdownRenderer` to `setLibrary` instead of failing inside markdown-it.
- `cudoc check` reads the library `collect` wrote and writes nothing, so checking no longer rebuilds or removes `embeds.json`; run it after collecting.
- The library and its prepared embeds are published together, so a collection or watch pass that fails leaves the last good pair in place; a second writer is refused naming the process that holds the output, and a lock left by a crashed run is recovered.
- `cudoc collect` names every embed it cannot prepare, with its file and block number, in one message, and prints cudoc's own errors without a stack trace.
- `cudoc check` reports an embed that includes itself (`cyclic-embed`), counts ids declared in raw HTML as anchors, reports a link with a malformed `%` instead of stopping, resolves embed sources exactly as the build does, applies `select` beside a section named in the source as the build does, and reads an embed's copy after its `replace` rules have rewritten it, so it inspects what is copied and fails where the build fails.
- On VitePress and Eleventy, a diagnostic `cudoc collect` reports for a document with front matter names the line in the file rather than the line in the body.
- On VitePress and Eleventy a document saved with `\r\n` line endings is collected, embedded and rewritten as one saved with `\n`: its positions and section ranges point into the file's own text rather than into the text markdown-it reads, where collection had stopped with `cannot map processed Markdown back to source`, and a page rendered against the library is matched to it. An Eleventy site no longer refuses every such page as rewritten by another template engine. `cudoc-markdown-it` exports `markdownItText`, the source as markdown-it reads it with a map of its offsets back to the source.
- Two headings with the same id each keep their own section when embedded, while the duplicate is still reported, and a `replace` rule on such an id is refused instead of rewriting the first section twice.
- A `replace` rule on a section whose heading sits inside another block rewrites the section's text as it reads on its own: a list item's marker and indentation are taken off, so a section in a list item is rewritten into the structure that was collected on every host, and where something of the block would stay in the text (a quote's or callout's `>`, a footnote's indentation, or the closing line of a component or `:::` container after its last section) the rule is refused, matching or not, with a message that says which. `cudoc check` reports that case as `unreplaceable-embed-section`, and the section still embeds without rules.
- A link inside embedded content that names only an anchor or a query points at the document it came from.
- `cudoc collect --watch` also collects again when a directory is renamed or removed, and hands a watcher error to `onError` instead of ending the process.
- On VitePress and Eleventy, whatever cudoc does not change is rendered by the host itself: code highlighting, `<script setup>` and `<style>` blocks, emoji, `[[toc]]`, code groups and the site's own containers, whose content cudoc still reads; a heading whose text slugs to an id written on another heading is numbered past it, and `[[toc]]` links to the ids cudoc settles; VitePress `rewrites` work, a page that combines `<!--@include-->` with an embed fails with a clear message, and diagnostics are printed or passed to `onDiagnostic`.
- Docusaurus keeps the heading ids cudoc settles, so `(#v1.2)` stays `v1.2` there; Nextra still slugs every id, and ids of lowercase letters, digits and hyphens are the same on every host.
- The adapters refuse options that are theirs to set (`host`, `headingIds` and `toc` on Docusaurus and Nextra, `components` on markdown-it) instead of ignoring them.
- Upgrading from 0.5 changes these calls. `createHostPlugins(options, adapter, host)` takes the host, `"docusaurus"` or `"nextra"`, as a required third argument. Paths below `/transforms/table-cell-list` and `/transforms/table-column-layout`, such as `/transforms/table-cell-list/index`, no longer resolve. `tokensToAst` without `render` throws on a container that is not a callout rather than reading it as one. `readPreparedEmbeds` returns one cached object shared between calls, so copy a block before changing it. The print pipeline marks an asset with `data.cudocAssets`, a list of `AssetMark`, rather than `data.cudocAsset`. A document's anchor in a bound volume is `cudoc-` followed by `idToken(id)`, so a link into the volume's print HTML for an id holding a `/` changes: `#cudoc-guide%2Fstart` becomes `#cudoc-guide_2f_start`.
- `@cudoment/cudoc/transforms/table-cell-list` and `/transforms/table-column-layout` are explicit entries, `cudoc-remark` no longer installs `remark-gfm`, `remark-mdx` or `remark-parse`, the type packages the declarations need are dependencies, apart from `@types/markdown-it`, an optional peer of the markdown-it adapters, every package exports `./package.json`, and `snapshotSource` is no longer exported from `@cudoment/cudoc/node/library`.
- A paper or margin length in `pt`, or a bare number read as millimetres, prints at the same size in PDF as in Word; heading ids outside ASCII link inside a bound volume; a link to another bound document prints its deployed address under `linkUrls` without upsetting the contents page numbers; `srcset`, `poster`, `<object>` and SVG image assets are copied, `srcset` is read as browsers read it, so a data URL keeps its comma and an empty candidate is skipped, and a Word link decodes a percent-encoded anchor so it reaches the heading's bookmark.
- Word carries row spans of HTML tables in MDX, within their row group as browsers draw them and `rowspan="0"` included, the start number of a top-level ordered list, task checkboxes and line breaks in cells, reports a table it drops from a footnote, and drops `javascript:` link targets.
- A `CAUTION` callout is drawn in the danger colour in HTML and PDF, as it already was in Word, and the PDF running header and footer take their font, size and colour from the design tokens.
- An authored page break next to a wide table that gets a landscape page, an HTML comment between them or not, no longer leaves a blank page in PDF or Word, and one that opens a document is dropped in both, so the document's start bookmark and its first block's portrait page survive.
- Review notes accept ISO 8601 dates only and store them in UTC; a damaged saved copy, a malformed share link or a file over the size limit shows a message instead of stopping the panel.
- `CUDOC_SKIP_BROWSER_DOWNLOAD=0` or `false` installs the browser rather than skipping it; like Playwright's own variable, it is compared exactly, so `FALSE` skips.

## 0.5.0

- PDF and Word output beside the HTML site, from one call and one set of design tokens.
- A `cudoc-pagebreak` fence forces a page break in the paginated formats and renders nothing on a site.
- Every document set also exports as one bound file, with cross-document links resolved inside it, opening with a cover and a contents page in both PDF and Word.
- One `page` setting gives PDF and Word the same paper, running header and footer, page breaks before headings, landscape pages for wide tables and printed link addresses.
- `annotations: true` ships a review-note runtime with the HTML site: whoever receives the files can select text or a block, leave notes and hand them back as a file or a share token, and `cudoc-export annotations` maps them to Markdown source lines in a facts-only report.
- `themeSwitch: true` adds a System / Light / Dark button to the HTML site's header, remembered per browser; without it the stylesheet keeps following the system setting with no script.
- On an MDX host an embedded section is spliced into the page as it compiles, so the components it contains render through the host's own component mapping and its code blocks reach the host's highlighter; the embed plugin no longer renders an HTML string, `cudoc-remark/runtime` is gone, and `cudoc-remark/loader` keeps a recollection visible to the dev server and the build cache. `cudoc check` reports a copied component whose import stays behind in its source file.
- A table embed can define its own columns: where each cell's text comes from (the section title, its first paragraph, the heading above it, a cell of a table inside it, or a function registered in the collection config), what it links to and how wide it must stay, and `cudoc check` reports every cell a defined column leaves empty.
- `roots: [{ dir, base }]` collects several directories into one library, each under its own URL prefix, so `/docs/…` and `/terms/…` links, embed sources and exports all mean the same document; `exclude` leaves non-documents out, `private` keeps in-house documents collected and checked but out of exports and datasets, and `externalPaths` tells the checker and the exporter which paths on your domain belong to another application.
- `tableColumnWidths` gives a table column a minimum width by its header text, per section or everywhere, so authored tables need no `<div style>` in their cells; the HTML site, the paginated formats and Word all honour it.
- `ignoreDiagnostics` silences a diagnostic code a project has decided to live with, and `loadLibrary(…, { cache: true })` lets a server reuse the loaded library between requests until the collection changes. What a consumer of the stored trees may rely on under `cudocAstVersion: 1` is now written down.
- `cudoc collect --watch` collects again whenever a document changes, compiling only the documents whose text changed and resolving only the embeds that read them; a `previous` library or preparation gives any collector the same saving, and a document that fails to compile is a message rather than a broken library.
- `cudoc-html` is now `cudoc-export`, which is what it builds.

## 0.4.0

- `cudoc check` finds every broken link, anchor, image and embed across a document set in one pass, from the CLI or as a function.
- Embed problems are reported instead of passing silently: an unrenderable component, a `replace` rule that matches nothing, an unknown key, a block that does not parse — each naming the document and the line.
- A duplicate heading ID is a diagnostic rather than a stop.
- Guides reorganized around choosing a host.

## 0.3.0

- Eleventy support, on a markdown-it layer now shared with VitePress.
- Standalone HTML and the host stylesheet rebuilt on redefinable tokens, with dark themes.

## 0.2.0

- Shared document normalization, section embedding and AST datasets.
- VitePress support, and standalone HTML export alongside any host.

## 0.1.0

- The shared AST core moved into `@cudoment/cudoc`, with browser-safe APIs beside the Node entry points.
