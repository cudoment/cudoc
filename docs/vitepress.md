# VitePress

**English** | [한국어](./vitepress.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–3 enable the Markdown extensions. Steps 4–6 add document embedding, which is what lets one document reuse another. Step 7 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-vitepress
```

VitePress uses markdown-it, not remark, so it does not use `cudoc-remark`.

## Step 2 — Register the plugin

```js
// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress"
import cudoc from "cudoc-vitepress"

export default defineConfig({
  markdown: {
    config(md) {
      md.use(cudoc, {
        syntax: { headingAnchor: "both", callout: "both" },
      })
    },
  },
})
```

`both` is the recommended starting point here: VitePress sites usually already contain `{#id}` anchors and `::: warning` containers, and `both` lets cudoc normalize those alongside its own syntax rather than making you rewrite them.

## Step 3 — Import the stylesheet

From your theme entry. Create or extend `docs/.vitepress/theme/index.js`:

```js
import DefaultTheme from "vitepress/theme"
import "@cudoment/cudoc/styles.css"
export default DefaultTheme
```

**Stop here if you only want the syntax extensions.** Run your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the collector

Copy [the example collector](../examples/vitepress/collect.mjs) to `collect.mjs` in your site root. It configures the real VitePress renderer with the same cudoc options, passes `createDocumentCompiler(md)` to collection, and prepares the embeds.

## Step 5 — Load the library into the renderer

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"

// inside markdown.config(md):
md.use(cudoc, {
  syntax: { headingAnchor: "both", callout: "both" },
  library: loadLibrary(".cudoc/documents"),
  outDir: ".cudoc/documents",
})
```

**Collection and rendering must agree** on every Markdown option. If you change one, change the other, and bump `compilerId` when relevant settings change.

## Step 6 — Collect before every build

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

After editing a source document, run collection again — `cudoc collect --watch` or [`watchDocuments`](./api-reference/node.md#watching) does that on every change — **and restart the dev server**: the plugin holds the library it loaded when the configuration was evaluated, and reports a stale source until it is reloaded.

## Step 7 — Optionally export standalone HTML

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Your VitePress build and its collected data are not modified. → [Standalone HTML](./export.md)

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

## VitePress specifics

**Routes carry `.html`.** The collector uses `routeSuffix: ".html"` to match VitePress's default `cleanUrls: false`. Change the collected routes when you change URL behaviour, `base`, rewrites or custom routes.

**Markdown only.** Write `.md`. React `.mdx` is not processed. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**Static markup normalizes; dynamic Vue does not.** A static `<Badge type="tip" text="1.0" />` becomes a cudoc badge. A badge carrying a Vue binding stays raw HTML, because its text is not known until the component runs. Arbitrary Vue expressions and custom plugin tokens are not guaranteed to travel through an embed.

**Shared with Eleventy.** This adapter and the [Eleventy adapter](./eleventy.md) both sit on `cudoc-markdown-it`, so the two hosts convert the actual native token stream through the same code and keep heading and TOC integration identical.

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [markdown-it internals](./api-reference/adapters.md#markdown-it) — token conversion and host definitions
- [Runnable example](../examples/vitepress/docs/.vitepress/config.mjs) — a working site
