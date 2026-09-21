# Docusaurus

**English** | [한국어](./docusaurus.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–3 enable the Markdown extensions. Steps 4–6 add document embedding, which is what lets one document reuse another. Step 7 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

## Step 2 — Register the remark plugins

Merge this into `docusaurus.config.mjs`, keeping your site's other settings:

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  markdown: { format: "detect" },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          routeBasePath: "docs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins({ syntax: {} }),
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
}
```

It must be `beforeDefaultRemarkPlugins`, not `remarkPlugins`. cudoc assigns heading anchors, and Docusaurus generates its own heading IDs and table of contents afterwards. Running cudoc second would leave the two disagreeing.

## Step 3 — Import the stylesheet

Add to `src/css/custom.css`:

```css
@import "@cudoment/cudoc/styles.css";
```

This styles callouts and badges. It sets no text colour of its own, so it follows your site's light and dark themes.

**Stop here if you only want the syntax extensions.** Start your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the embed plugin

Inside the same `docs` options, after native processing:

```js
import embed from "cudoc-remark/embed"

// presets → classic → docs:
remarkPlugins: [[embed, { sourceRoot: "docs", outDir: ".cudoc/documents" }]],
```

The plugin splices prepared content into the page as it compiles, so the compiled page depends on `.cudoc/documents/embeds.json`. Register the library loader on the same files through a small plugin, so a recollection reaches pages the dev server and the build cache have already compiled; it leaves your files alone and adds one invisible reference definition to the compiled input:

```js
import path from "node:path"
import { libraryLoader } from "cudoc-remark/loader"

// docusaurus.config.mjs → plugins:
;() => ({
  name: "cudoc-library",
  configureWebpack: () => ({
    module: {
      rules: [
        {
          test: /\.mdx?$/,
          include: [path.resolve("docs")],
          use: [libraryLoader(".cudoc/documents")],
        },
      ],
    },
  }),
})
```

The rule has to name your content directory in `include`: Docusaurus builds its fallback MDX loader from the `include` of every rule matching `.mdx`, and a rule without one stops the build with an invalid webpack configuration. Docusaurus loads the config as CommonJS, so resolve the path from the working directory rather than from `import.meta`.

## Step 5 — Add the collector

Copy [the example collector](../examples/docusaurus/collect.mjs) to `collect.mjs` in your site root. It runs the actual Docusaurus MDX processor, captures what Docusaurus does to the document, and prepares the embeds.

Set `sourceRoot`, `outDir` and `routeBase` to match your site. **Collection and rendering must agree**: the same syntax options, the same native Markdown settings. If you change one, change the other.

> The collector imports an internal Docusaurus processor entry point, pinned to a specific version. Re-check it when you upgrade Docusaurus.

## Step 6 — Collect before every build

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "start": "npm run collect && docusaurus start",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

Collection has to run before the site does. To collect again as you write, wrap the same options in [`watchDocuments`](./api-reference/node.md#watching) from `@cudoment/cudoc/node/watch` instead of `buildDocumentsAsync`. The embed plugin inserts the prepared content automatically.

`cudoc check` reports every broken link, anchor, image and embed in one pass, and exits non-zero, so a broken reference stops the build before the site is generated. → [Reference checking](./check.md)

## Step 7 — Optionally export standalone HTML

Reuse the library you just collected to produce a shareable HTML bundle:

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Your Docusaurus build and its collected data are not modified. → [Standalone HTML](./export.md)

---

## What you can now write

| Feature                     | Example                            | Details                                                    |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Explicit heading anchors    | `## Limits (#limits)`              | [Syntax](./syntax.md#anchors-and-badges)                   |
| Heading badges              | `## Limits (#limits) (@New)`       | [Syntax](./syntax.md#anchors-and-badges)                   |
| Callouts with titles        | `> [!NOTE] Before you start`       | [Syntax](./syntax.md#callouts)                             |
| Nested lists in table cells | `- Account<br />-- Verified email` | [Syntax](./syntax.md#lists-inside-table-cells)             |
| Embed a whole document      | `sources: [reference.md]`          | [Embedding](./embedding.md#reuse-a-section)                |
| Embed one section           | `sources: [reference.md#limits]`   | [Embedding](./embedding.md#reuse-a-section)                |
| Heading summary table       | `select: { depth: 2 }`             | [Embedding](./embedding.md#create-a-heading-summary-table) |
| Replace text in the copy    | `replace: [{ find, replace }]`     | [Embedding](./embedding.md#find-and-replace)               |

## Docusaurus specifics

**Native syntax alongside cudoc syntax.** Docusaurus admonitions and `{#id}` heading IDs keep working. To have cudoc normalize them too, so that embedded copies and HTML export carry the same semantics:

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

Supported native forms are listed in the [syntax guide](./syntax.md).

**Format detection.** `markdown: { format: "detect" }` keeps `.md` as plain Markdown, where `{value}` stays literal text, and treats `.mdx` as MDX. Author your own React components in `.mdx`. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**No theme plugin.** This setup needs no cudoc theme plugin and no component registration. Authors write Markdown.

**Custom slugs.** Supply `routes` to the collector when your document IDs and URLs differ, and bump `compilerId` when you change settings that affect compilation.

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#docusaurus-and-nextra) — ordering, capture, what the adapter sets
- [Runnable example](../examples/docusaurus/docusaurus.config.mjs) — a working site
