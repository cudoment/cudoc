# Eleventy

**English** | [한국어](./eleventy.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–4 enable the Markdown extensions. Steps 5–7 add document embedding, which is what lets one document reuse another. Step 8 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-eleventy markdown-it-attrs markdown-it-anchor markdown-it-container
```

Eleventy uses markdown-it, not remark, so it does not use `cudoc-remark`. `cudoc-eleventy` brings the shared markdown-it layer, `cudoc-markdown-it`, with it. The three `markdown-it-*` plugins are the native syntax the next step registers.

## Step 2 — Build the renderer in a shared module

Eleventy owns the markdown-it instance, so create it once in a module that both the configuration and the collector import:

```js
// markdown.mjs
import attrs from "markdown-it-attrs"
import anchor from "markdown-it-anchor"
import container from "markdown-it-container"
import { createMarkdownRenderer } from "cudoc-eleventy"

export const syntax = { headingAnchor: "both", callout: "both" }

export const createRenderer = (library) =>
  createMarkdownRenderer({ syntax, library }, (md) => {
    md.use(attrs, { allowedAttributes: ["id"] })
    md.use(anchor, { permalink: anchor.permalink.linkInsideHeader() })
    for (const type of ["warning", "tip", "info", "danger", "details"])
      md.use(container, type)
  })
```

Native syntax comes from the plugins **you** register. `callout: "host"` has nothing to normalize until `markdown-it-container` is registered, and `headingAnchor: "host"` needs `markdown-it-attrs`.

## Step 3 — Wire it into the config

Merge this into `eleventy.config.mjs`, keeping your site's plugins, filters and other settings. `dir.input` is the directory the collector will collect, `docs` here:

```js
// eleventy.config.mjs
import { createRenderer } from "./markdown.mjs"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", createRenderer())
  eleventyConfig.addPassthroughCopy({
    "node_modules/@cudoment/cudoc/styles.css": "cudoc.css",
  })
  return {
    dir: { input: "docs", output: "_site" },
    markdownTemplateEngine: false,
  }
}
```

> **Two of these settings are required, not preferences.**
>
> `markdownTemplateEngine: false` stops Liquid rewriting the Markdown before markdown-it sees it. cudoc reads source positions out of the token stream, and the adapter raises an error when it detects a source another engine already rendered.
>
> `anchor.permalink.linkInsideHeader()` puts the permalink **inside** the heading. A permalink that wraps the heading puts the heading's own text inside a link, where cudoc's `(#id)` anchors are no longer part of it.

## Step 4 — Link the stylesheet from your layout

Eleventy ships no theme, so your layout is where the stylesheet and navigation belong. Link `/cudoc.css`, copied through by step 3.

**Stop here if you only want the syntax extensions.** Build your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 5 — Add the collector

Create `collect.mjs` in your site root. It builds the renderer from the same `markdown.mjs` the site uses and passes `createDocumentCompiler(md)` to [`collectDocuments`](./api-reference/node.md#watching), which writes the library and the prepared embeds together: a failed run leaves the previous pair in place.

```js
// collect.mjs
import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { createDocumentCompiler } from "cudoc-eleventy"
import { createRenderer, syntax } from "./markdown.mjs"

// The renderer the site builds with. It needs no library: collection
// resolves embeds from the documents it collects.
const md = createRenderer()
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "eleventy",
  // Eleventy writes directory URLs, so `reference.md` is served at `/reference/`.
  routeSuffix: "/",
  syntax,
  compiler: createDocumentCompiler(md),
  // Change it whenever markdown.mjs or the Eleventy version changes.
  compilerId: "eleventy-v1",
})
```

## Step 6 — Load the library into the renderer

`eleventy.config.mjs` then reads as follows, your site's other settings kept:

```js
// eleventy.config.mjs
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { createRenderer } from "./markdown.mjs"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary(
    "md",
    createRenderer(loadLibrary(".cudoc/documents")),
  )
  eleventyConfig.addPassthroughCopy({
    "node_modules/@cudoment/cudoc/styles.css": "cudoc.css",
  })
  return {
    dir: { input: "docs", output: "_site" },
    markdownTemplateEngine: false,
  }
}
```

**Collection and rendering must agree** on every Markdown option. Because both come from `markdown.mjs`, that happens by construction — keep it that way, and change `compilerId` when relevant settings change.

## Step 7 — Collect before every build

Add the scripts to `package.json`:

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && eleventy --serve",
    "build": "npm run collect && npm run check && eleventy"
  }
}
```

`cudoc check` reads the library the collector published and collects nothing, so it runs after `collect`, and its configuration only has to say where that library is:

```js
// cudoc.config.mjs
export default { sourceRoot: "docs", outDir: ".cudoc/documents" }
```

Root-relative images, such as `/img/logo.png`, are looked up under `docs`. If your passthrough copies them from a directory outside it, name that directory in `check: { assetDirs: [...] }` here and with `--asset-dir` in step 8.

After editing a source document, run collection again — [`watchDocuments`](./api-reference/node.md#watching) called with the collector's configuration does that on every change, and so does `cudoc collect --watch` given a configuration file that holds the collector's whole configuration, `compiler` included — **and restart the dev server**: the plugin holds the library it loaded when the configuration was evaluated, and reports a stale source until it is reloaded. Front matter does not count: Eleventy hands the renderer the page without it, and a page whose text after the front matter is what was collected is current. → [Reference checking](./check.md)

## Step 8 — Optionally export HTML

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Your Eleventy build and its collected data are not modified. → [Export](./export.md)

---

## What you can now write

| Feature                     | Example                            | Details                                                    |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Explicit heading anchors    | `## Limits (#limits)`              | [Syntax](./syntax.md#anchors-and-badges)                   |
| Native heading anchors      | `## Limits {#limits}`              | [Syntax](./syntax.md#anchors-and-badges)                   |
| Heading badges              | `## Limits (#limits) (@New)`       | [Syntax](./syntax.md#anchors-and-badges)                   |
| Callouts with titles        | `> [!NOTE] Before you start`       | [Syntax](./syntax.md#callouts)                             |
| Native containers           | `::: warning Title`                | [Syntax](./syntax.md#callouts)                             |
| Nested lists in table cells | `- Account<br />-- Verified email` | [Syntax](./syntax.md#lists-inside-table-cells)             |
| Embed a whole document      | `sources: [reference.md]`          | [Embedding](./embedding.md#reuse-a-section)                |
| Embed one section           | `sources: [reference.md#limits]`   | [Embedding](./embedding.md#reuse-a-section)                |
| Heading summary table       | `select: { depth: 2 }`             | [Embedding](./embedding.md#create-a-heading-summary-table) |
| Document tree               | `render: { type: tree }`           | [Embedding](./embedding.md#draw-a-tree-of-documents)       |
| Replace text in the copy    | `replace: [{ find, replace }]`     | [Embedding](./embedding.md#find-and-replace)               |

`details` containers keep their expandable behaviour.

## Eleventy specifics

**Routes are directory URLs.** The collector uses `routeSuffix: "/"` to match Eleventy's default, so `reference.md` is collected as `/reference/`. Change the collected routes when you change `permalink`, output extensions or path prefixes.

**Gitignored input.** Eleventy skips gitignored files by default. If your documents are gitignored — as the synced fixtures in this repository's example are — add `eleventyConfig.setUseGitIgnore(false)`.

**Markdown only.** Write `.md`. React `.mdx` is not processed. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**Your plugins keep their rendering.** A code block goes through the fence renderer your site registered, and a `markdown-it-container` whose name is not a callout type, such as a site's own `::: demo`, opens and closes as that plugin renders it, around content cudoc reads like the rest of the page, so a heading anchor or an embed inside it still works. cudoc replaces only what it normalizes.

**Tables of contents and embedded headings.** Eleventy has none of its own. One built by a markdown-it plugin reads the tokens and lists the page's own headings; one built from the rendered HTML, such as an Eleventy transform, also lists headings that arrive through an embed.

**Warnings while building.** A diagnostic, such as an unregistered callout type or two headings with the same ID, is printed as a warning naming the page and line while Eleventy renders it; the line counts from the top of the file when the renderer has the collected library, and from the end of the front matter otherwise. Pass `onDiagnostic(diagnostic, documentId)` in the renderer options to handle them yourself. → [markdown-it internals](./api-reference/adapters.md#markdown-it)

**Shared with VitePress.** This adapter and the [VitePress adapter](./vitepress.md) both sit on `cudoc-markdown-it`, so the two hosts convert the actual native token stream through the same code and keep heading and TOC integration identical.

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [markdown-it internals](./api-reference/adapters.md#markdown-it) — token conversion and host definitions
- [Runnable example](../examples/eleventy/eleventy.config.mjs) — a working site
