# Eleventy

**English** | [한국어](./eleventy.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–4 enable the Markdown extensions. Steps 5–7 add document embedding, which is what lets one document reuse another. Step 8 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-eleventy
```

Eleventy uses markdown-it, not remark, so it does not use `cudoc-remark`.

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

Copy [the example collector](../examples/eleventy/collect.mjs) to `collect.mjs` in your site root. It builds the renderer from the same `markdown.mjs` the site uses, passes `createDocumentCompiler(md)` to collection, and prepares the embeds.

## Step 6 — Load the library into the renderer

```js
// eleventy.config.mjs
import { loadLibrary } from "@cudoment/cudoc/node/library"

eleventyConfig.setLibrary("md", createRenderer(loadLibrary(".cudoc/documents")))
```

**Collection and rendering must agree** on every Markdown option. Because both come from `markdown.mjs`, that happens by construction — keep it that way. Bump `compilerId` when relevant settings change.

## Step 7 — Collect before every build

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

There is no collection watcher. After editing a source document, run collection again **and restart the dev server** so the loaded library is refreshed.

## Step 8 — Optionally export standalone HTML

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Your Eleventy build and its collected data are not modified. → [Standalone HTML](./html.md)

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
| Replace text in the copy    | `replace: [{ find, replace }]`     | [Embedding](./embedding.md#find-and-replace)               |

`details` containers keep their expandable behaviour.

## Eleventy specifics

**Routes are directory URLs.** The collector uses `routeSuffix: "/"` to match Eleventy's default, so `reference.md` is collected as `/reference/`. Change the collected routes when you change `permalink`, output extensions or path prefixes.

**Gitignored input.** Eleventy skips gitignored files by default. If your documents are gitignored — as the synced fixtures in this repository's example are — add `eleventyConfig.setUseGitIgnore(false)`.

**Markdown only.** Write `.md`. React `.mdx` is not processed. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**Shared with VitePress.** This adapter and the [VitePress adapter](./vitepress.md) both sit on `cudoc-markdown-it`, so the two hosts convert the actual native token stream through the same code and keep heading and TOC integration identical.

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [markdown-it internals](./api-reference/adapters.md#markdown-it) — token conversion and host definitions
- [Runnable example](../examples/eleventy/eleventy.config.mjs) — a working site
