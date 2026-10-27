# VitePress

**English** | [한국어](./vitepress.ko.md) · [All guides](./README.md)

Set up cudoc in a VitePress site: the Markdown extensions first, then document embedding, and an optional HTML export at the end.

**See it first:** the [VitePress demo](https://cudoment.github.io/cudoc/demos/vitepress/portable.html) is the [runnable example](../examples/vitepress/docs/.vitepress/config.mjs) built by VitePress 1.6.4, with links to the Markdown it was built from. → [Host demos](./README.md#host-demos)

Follow the steps in order. Steps 1–3 enable the Markdown extensions; steps 4–6 add document embedding, which lets one document reuse another; step 7 is optional.

## Step 1 — Install

Install the core package and the VitePress adapter:

```sh
npm install @cudoment/cudoc cudoc-vitepress
```

cudoc supports VitePress 1, which `npm install vitepress` installs. The VitePress 2 alpha that vitepress.dev's Getting Started installs (`vitepress@next`) is not supported yet, and npm refuses to install `cudoc-vitepress` beside it. → [Supported versions](./README.md#supported-versions)

VitePress uses markdown-it, not remark, so it does not use `cudoc-remark`. `cudoc-vitepress` brings the shared markdown-it layer, `cudoc-markdown-it`, with it.

## Step 2 — Keep the Markdown options in a shared module

Keep the Markdown options in one module that the site and the collector both import, so that both render Markdown with the same options. Merge the second file into your `docs/.vitepress/config.mjs`, keeping your site's title, theme configuration and other settings:

```js
// markdown.mjs
import cudoc from "cudoc-vitepress"

export const syntax = { headingAnchor: "both", callout: "both" }

/** The `markdown` options of the site, and of the collector's renderer. */
export const markdown = (library) => ({
  config(md) {
    md.use(cudoc, { syntax, library })
  },
})
```

```js
// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress"
import { markdown } from "../../markdown.mjs"

export default defineConfig({
  markdown: markdown(),
})
```

`both` is the recommended starting point here: VitePress sites usually already contain `{#id}` anchors and `::: warning` containers, and `both` lets cudoc normalize those alongside its own syntax rather than making you rewrite them.

## Step 3 — Import the stylesheet

Import the stylesheet from your theme entry. Create or extend `docs/.vitepress/theme/index.js`:

```js
// docs/.vitepress/theme/index.js
import DefaultTheme from "vitepress/theme"
import "@cudoment/cudoc/styles.css"
export default DefaultTheme
```

**Stop here if you only want the syntax extensions.** Run your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the collector

Create `collect.mjs` in your site root. It builds the real VitePress renderer from the same options and passes `createDocumentCompiler(md)` to [`collectDocuments`](./api-reference/node.md#watching), which writes the library and the prepared embeds together. A failed run leaves the previous pair in place. `sourceRoot` and the renderer's directory are the directory `vitepress build` is given, `docs` here.

```js
// collect.mjs
import path from "node:path"
import { createMarkdownRenderer, disposeMdItInstance } from "vitepress"
import { createDocumentCompiler } from "cudoc-vitepress"
import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { markdown, syntax } from "./markdown.mjs"

// The renderer the site builds with. It needs no library: collection
// resolves embeds from the documents it collects.
const md = await createMarkdownRenderer(path.resolve("docs"), markdown())
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "vitepress",
  routeSuffix: ".html",
  syntax,
  compiler: createDocumentCompiler(md),
  // Change it whenever markdown.mjs or the VitePress version changes.
  compilerId: "vitepress-v1",
})
disposeMdItInstance()
```

## Step 5 — Load the library into the renderer

Pass `loadLibrary(".cudoc/documents")` into `markdown()` in `docs/.vitepress/config.mjs`, keeping your site's other settings:

```js
// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { markdown } from "../../markdown.mjs"

export default defineConfig({
  markdown: markdown(loadLibrary(".cudoc/documents")),
})
```

**Collection and rendering must agree** on every Markdown option. Both come from `markdown.mjs`, so they agree by construction: keep it that way, and change `compilerId` when relevant settings change.

## Step 6 — Collect before every build

Add the scripts to `package.json`:

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && vitepress dev docs",
    "build": "npm run collect && npm run check && vitepress build docs"
  }
}
```

`cudoc check` runs after `collect`: it reads the library the collector published and collects nothing, so its configuration only has to say where that library is and where the site serves root-relative images from, VitePress's `public` directory:

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["docs/public"] },
}
```

After editing a source document, run collection again **and restart the dev server**. [`watchDocuments`](./api-reference/node.md#watching) called with the collector's configuration collects on every change, and so does `cudoc collect --watch` given a configuration file that holds the collector's whole configuration, `compiler` included. The restart is needed because the plugin holds the library it loaded when the configuration was evaluated, and reports a stale source until it is reloaded. → [Reference checking](./check.md)

## Step 7 — Optionally export HTML

Install `cudoc-export` and export the collected library as HTML:

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir docs/public
```

Your VitePress build and its collected data are not modified. → [Export](./export.md)

---

## What you can now write

The syntax rows below work after step 3, and the embedding rows after step 6:

| Feature                           | Example                            | Details                                                       |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| Explicit heading anchors          | `## Limits (#limits)`              | [Syntax](./syntax.md#anchors-and-badges)                      |
| Native heading anchors            | `## Limits {#limits}`              | [Syntax](./syntax.md#anchors-and-badges)                      |
| Heading badges                    | `## Limits (#limits) (@New)`       | [Syntax](./syntax.md#anchors-and-badges)                      |
| Callouts with titles              | `> [!NOTE] Before you start`       | [Syntax](./syntax.md#callouts)                                |
| Native containers                 | `::: warning Title`                | [Syntax](./syntax.md#callouts)                                |
| Nested lists in table cells       | `- Account<br />-- Verified email` | [Syntax](./syntax.md#lists-inside-table-cells)                |
| Merged table cells                | `^^` or `>>` alone in a cell       | [Syntax](./syntax.md#merged-table-cells)                      |
| Code titles and highlighted lines | ` ```js title="retry.js" {2} `     | [Syntax](./syntax.md#code-block-titles-and-highlighted-lines) |
| Tabs                              | `> [!TAB] npm`                     | [Syntax](./syntax.md#tabs)                                    |
| Variables                         | `(=version)`                       | [Syntax](./syntax.md#variables)                               |
| Embed a whole document            | `sources: [reference.md]`          | [Embedding](./embedding.md#reuse-a-section)                   |
| Embed one section                 | `sources: [reference.md#limits]`   | [Embedding](./embedding.md#reuse-a-section)                   |
| Heading summary table             | `select: { depth: 2 }`             | [Embedding](./embedding.md#create-a-heading-summary-table)    |
| Document tree                     | `render: { type: tree }`           | [Embedding](./embedding.md#draw-a-tree-of-documents)          |
| Replace text in the copy          | `replace: [{ find, replace }]`     | [Embedding](./embedding.md#find-and-replace)                  |

`details` containers keep their expandable behaviour.

## VitePress specifics

**Routes carry `.html`.** The collector uses `routeSuffix: ".html"` to match VitePress's default `cleanUrls: false`. Change the collected routes when you change URL behaviour, `base`, rewrites or custom routes.

**Rewrites keep their embeds.** A document is identified by the file it was read from, even when `rewrites` or a dynamic route serves it at another path, so a rewritten page resolves its embeds against the document it was collected as. Links into it still use the collected route, so give the collector `routes` for the paths you rewrite.

**No embeds in a page that includes.** A page that pulls in other files with `<!--@include: ...-->` renders as usual, but if it also has an embed, rendering stops with an error saying so. Collection reads the file without the included text, so the embed cannot be matched to the page. Put embeds in pages that include nothing.

**VitePress keeps its own rendering.** cudoc replaces only what it normalizes, and the rest renders as VitePress renders it:

- Code blocks keep their highlighting, line numbers and copy buttons, and snippet imports still work.
- `<script setup>` and `<style>` blocks still reach the page component.
- `[[toc]]`, `::: code-group`, `::: raw` and emoji render as VitePress renders them, except that a code group becomes a cudoc tab group once `syntax.tabs` takes host syntax.

What a container holds is still read by cudoc, so a heading anchor or an embed inside a code group or `::: raw` works as it does outside one.

**Tables of contents and embedded headings.** The default theme's outline is built in the browser from the rendered headings, so it lists headings that arrive through an embed. A `[[toc]]` in the page is rendered from VitePress's own tokens and lists the page's own headings only.

**Warnings while building.** A diagnostic, such as an unregistered callout type or two headings with the same ID, is printed as a warning naming the page and line while VitePress renders it. The line counts from the top of the file when the plugin has the collected library, and from the end of the front matter otherwise. Pass `onDiagnostic(diagnostic, documentId)` in the plugin options to handle them yourself. → [markdown-it internals](./api-reference/adapters.md#markdown-it)

**Markdown only.** Write `.md`. React `.mdx` is not processed. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**Static markup normalizes; dynamic Vue does not.** With `badge: "host"` or `"both"` in `syntax`, a static `<Badge type="tip" text="1.0" />` becomes a cudoc badge, read from its `text` attribute. A badge carrying a Vue binding stays raw HTML, because its text is not known until the component runs. Arbitrary Vue expressions and custom plugin tokens are not guaranteed to travel through an embed.

**Shared with Eleventy.** This adapter and the [Eleventy adapter](./eleventy.md) both sit on `cudoc-markdown-it`, so the two hosts convert the actual native token stream through the same code and keep heading and TOC integration identical.

## Next

Continue with the embedding guide, the markdown-it internals or the runnable example:

- [Document embedding](./embedding.md): selection, multiple sources, refresh rules
- [markdown-it internals](./api-reference/adapters.md#markdown-it): token conversion and host definitions
- [Runnable example](../examples/vitepress/docs/.vitepress/config.mjs): a working site
