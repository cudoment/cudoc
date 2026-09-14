# cudoc

**English** | [한국어](./README.ko.md)

**Add callouts and nested lists in tables to Markdown, reuse content from other documents, and share the same documents as HTML.**

cudoc supports **documentation hosts**: the site generators and web frameworks that build and serve your documents, including Next.js (MDX), Docusaurus, Nextra, VitePress and Eleventy. Configure the adapter for your site once, then use the features through Markdown. Authors do not import or register cudoc React components.

The two core capabilities are Markdown extensions and document embedding. Standalone HTML is an optional additional output for the same content, available alongside every supported documentation host. It does not replace your host or require a separate set of documents; it can also be used on its own.

## What you can do

### Write callouts, anchors and tables with Markdown

Give headings explicit anchors and badges, turn blockquotes into callouts, and write nested lists inside table cells.

```md
## Requirements (#requirements) (@New)

> [!NOTE] Before you start
> Prepare your account and access token.

| Item   | What you need                                        |
| ------ | ---------------------------------------------------- |
| Access | - Account<br />-- Verified email<br />- Access token |
```

This renders a heading you can link to with `#requirements`, a New badge, a callout with a bold title, and a list with Verified email nested under Account. Choose cudoc syntax, host syntax or both for each configurable feature.

### Reuse one document as sections or summary tables

Name the source document and heading criteria in a code block. This example turns the second-level headings of `reference.md` into a table of titles, links and summaries.

````md
```cudoc-embed
sources: [reference.md]
select: { depth: 2 }
render: { type: table }
```
````

You can also include a section and its child sections as content, or apply find-and-replace rules to the embedded copy. Connect document collection before the site build, then authors reuse content with these code blocks. The HTML command below handles collection for you.

### Generate shareable HTML with one build command

If you have Markdown documents in `docs/`, install the packages and build:

```sh
npm install @cudoment/cudoc cudoc-html
npx cudoc-html build docs --out-dir site
```

Open `site/index.html` to read the documents with navigation, a TOC and styles. Share the whole `site/` directory or deploy it to a static server. You can also generate HTML alongside an existing site from the same documents. Choose local file links, links to the primary site, or no hyperlinks.

[Getting started](#getting-started) · [Support and host setup](#support-and-host-setup) · [Choose syntax](#choose-syntax) · [More ways to reuse documents](#more-ways-to-reuse-documents) · [Export HTML alongside a site](#export-html-alongside-a-site) · [Guides and API reference](#guides-and-api-reference)

## Getting started

For an existing site, follow the [host guide](#support-and-host-setup) to install the packages and connect the adapter and styles. That enables syntax extensions; add collection before the build to use document embedding.

To try the features with standalone HTML first, run the installation command above and write these two files. You need Node.js 20+ and npm.

### 1. Write the document to reuse

`docs/reference.md`:

```md
# Reference

## Limits (#limits)

The **original** limit is 100 requests per minute.

### Retry (#retry)

Wait before retrying a request.

## Authentication (#authentication)

Send an access token with each request.
```

### 2. Write the document that shows the summary

`docs/index.md`:

````md
# Product guide

> [!NOTE] About this guide
> The table below comes from the reference document.

```cudoc-embed
sources: [reference.md]
select: { depth: 2 }
render: { type: table }
```
````

### 3. Build and open

```sh
npx cudoc-html build docs --out-dir site
```

`site/index.html` shows the callout and a summary table with two rows: Limits and Authentication. Each table link opens the corresponding heading in `reference.html`. Run the same command again after editing a document.

Use `site/` as a dedicated output directory separate from the source. Start with a nonexistent output path; later builds update the directory owned by cudoc. Share the whole directory containing HTML, CSS and assets.

## Support and host setup

Each host guide covers packages, plugin ordering, stylesheet integration and collection setup.

| Host                     | Document formats                    | Setup guide                              |
| ------------------------ | ----------------------------------- | ---------------------------------------- |
| Next.js with `@next/mdx` | `.md`, `.mdx`                       | [Next.js setup](./docs/next-mdx.md)      |
| Docusaurus               | `.md`, `.mdx` with format detection | [Docusaurus setup](./docs/docusaurus.md) |
| Nextra                   | `.md`, `.mdx` with format detection | [Nextra setup](./docs/nextra.md)         |
| VitePress                | `.md`                               | [VitePress setup](./docs/vitepress.md)   |
| Eleventy                 | `.md`                               | [Eleventy setup](./docs/eleventy.md)     |

Regardless of the host you choose, you can also [export standalone HTML](./docs/html.md) from its collected library. HTML export is an additional output, not another host you must choose instead.

`.md` is parsed as ordinary Markdown, so `{value}` remains text. Use `.mdx` on an MDX host to author your own React components. VitePress and Eleventy do not process React MDX.

| Feature             | Supported behavior                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Markdown extensions | Explicit anchors, badges, callouts, nested lists inside table cells and splitting list cells into columns         |
| Document embedding  | Document/section selection, optional child sections, heading-summary tables, literal and regex replacements       |
| Standalone HTML     | Direct builds or host-library reuse, navigation/TOC/code highlighting, local asset copying and hyperlink policies |
| AST datasets        | Filter collected documents into AST JSON and a manifest for downstream processing                                 |

Syntax-only use needs no stored library. Cross-document embedding requires collected ASTs and source snapshots; recollect after source or configuration changes. Supported native forms are listed in the [syntax guide](./docs/syntax.md). Collection must use the same host compiler, syntax and routes as rendering.

Standalone HTML renders normalized document content. It does not execute authored React or Vue code, so remaining custom components need explicit HTML renderers. The output is a directory of HTML, CSS and assets, not a single file containing every asset. Automatic collection watching and document link monitoring are not currently provided.

## Choose syntax

Select each feature in your host adapter's `syntax` option:

```js
const options = {
  syntax: {
    headingAnchor: "both",
    badge: "cudoc",
    tableCellList: "cudoc",
    callout: "both",
    link: "host",
  },
}
```

| Value   | Syntax to normalize                          |
| ------- | -------------------------------------------- |
| `cudoc` | cudoc's representative syntax                |
| `host`  | Supported native syntax of the selected host |
| `both`  | Both forms                                   |

Defaults are `cudoc` for anchors, badges, cell lists and callouts, and `host` for links. Default remark settings produce component-free output for both `.md` and `.mdx`; `syntax: {}` simply makes that choice explicit. Standard Markdown links work in every mode.

These settings select what cudoc normalizes. A host parser may still accept its own syntax when `cudoc` is selected. See [Markdown syntax](./docs/syntax.md) for callout types, native forms and table column layouts.

## More ways to reuse documents

To include the Limits section and its child sections as content instead of a summary table:

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

Add `replace` to the same block to change only the embedded copy. The original document stays unchanged.

````md
```cudoc-embed
sources: [reference.md#limits]
replace:
  - find: "**original**"
    replace: "_adapted_"
```
````

`sources` paths are relative to the current document. Use `select` for anchors, titles or heading depths, and `includeChildren: false` to exclude child sections. The [embedding guide](./docs/embedding.md) covers collection setup, multiple documents, table columns and regex replacements.

## Export HTML alongside a site

Run the collector from your host guide, then export the same collection as HTML:

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Use the actual source directory; the Nextra guide uses `content`. The export reuses host-processed documents and prepared embeds without modifying the primary site's output or collected data.

| `--links`            | Behavior                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| `relative` (default) | Link to HTML files inside the shared directory                                       |
| `host`               | Point local document links to `--host-url` plus collected routes; keep external URLs |
| `none`               | Remove every hyperlink, including external URLs; keep text and formatting            |

The policy applies to body content, embeds, navigation and TOC. Local images and CSS remain available. Include the deployment base path in `--host-url` and match collected routes to the primary site. Recollect after edits before exporting HTML. See the [HTML guide](./docs/html.md) for `public`/`static` assets and further configuration.

## Guides and API reference

| What you want to do                                        | Documentation                                   |
| ---------------------------------------------------------- | ----------------------------------------------- |
| Write anchors, badges, callouts and nested lists in tables | [Markdown syntax](./docs/syntax.md)             |
| Reuse sections, create summary tables and replace text     | [Document embedding](./docs/embedding.md)       |
| Generate/share HTML and configure hyperlinks               | [Standalone HTML](./docs/html.md)               |
| Filter collected documents for downstream processing       | [AST datasets](./docs/dataset.md)               |
| Check functions, types, defaults and internal behavior     | [API reference](./docs/api-reference/README.md) |
| Run a real host integration                                | [Runnable examples](./examples/README.md)       |

## Packages and development

Choose the packages required for your host. Packages use ESM and Node.js 20+.

| Package                                                       | Purpose                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@cudoment/cudoc`](./packages/cudoc/README.md)               | Shared document processing, compilation, queries, collection and datasets |
| [`cudoc-remark`](./packages/cudoc-remark/README.md)           | Connect remark and MDX pipelines                                          |
| [`cudoc-docusaurus`](./packages/cudoc-docusaurus/README.md)   | Docusaurus integration                                                    |
| [`cudoc-nextra`](./packages/cudoc-nextra/README.md)           | Nextra integration                                                        |
| [`cudoc-markdown-it`](./packages/cudoc-markdown-it/README.md) | Connect markdown-it pipelines                                             |
| [`cudoc-vitepress`](./packages/cudoc-vitepress/README.md)     | VitePress rendering and collection                                        |
| [`cudoc-eleventy`](./packages/cudoc-eleventy/README.md)       | Eleventy rendering and collection                                         |
| [`cudoc-html`](./packages/cudoc-html/README.md)               | Standalone HTML generation                                                |

Only the core package is scoped: `cudoc` was already taken on npm, so it publishes as `@cudoment/cudoc`. The adapters keep their plain names.

To develop this repository, run from the root:

```sh
npm ci
npm run build
npm run test:run
npm run typecheck
npm run format:check
```

Host examples install separately. Update the relevant guides and API reference alongside changes to APIs or usage workflows.

### Publishing packages

Pushing commits runs CI, not npm publishing. Maintainers run the [Publish workflow](./.github/workflows/publish.yml) manually on the intended commit. It checks all public workspace packages, skips versions already on npm and publishes missing versions in dependency order, then creates package-version tags and GitHub releases for that commit. Partial publication is not rolled back; rerunning skips successful npm publications. Each package needs npm publishing authorization; the workflow uses Trusted Publishing. New packages or missing trust configuration require maintainer setup before unattended releases.

[MIT license](./LICENSE)
