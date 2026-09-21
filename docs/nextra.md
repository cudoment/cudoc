# Nextra

**English** | [한국어](./nextra.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–3 enable the Markdown extensions. Steps 4–6 add document embedding, which is what lets one document reuse another. Step 7 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

## Step 2 — Register the remark plugins

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"

const withNextra = nextra({
  mdxOptions: {
    format: "detect",
    remarkPlugins: cudocRemarkPlugins({ syntax: {} }),
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
})
```

Keep your existing Nextra theme configuration and MDX component mappings. Nextra runs configured remark plugins before its own heading processing, so cudoc's anchors are in place when Nextra builds the table of contents.

## Step 3 — Import the stylesheet

Once, from your root layout:

```js
import "@cudoment/cudoc/styles.css"
```

No cudoc component mapping is needed.

**Stop here if you only want the syntax extensions.** Run your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the embed plugin

Append it after the adapter's own plugins:

```js
import embed from "cudoc-remark/embed"

remarkPlugins: [
  ...cudocRemarkPlugins({ syntax: {} }),
  [embed, { sourceRoot: "content", outDir: ".cudoc/documents" }],
],
```

The plugin splices prepared content into the page as it compiles, so the compiled page depends on `.cudoc/documents/embeds.json`. Register the library loader on the same files in `next.config.mjs`; without it a recollection does not reach a page the bundler has already compiled:

```js
import { libraryLoader } from "cudoc-remark/loader"

export default withNextra({
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx?$/,
      use: [libraryLoader(".cudoc/documents")],
    })
    return config
  },
})
```

This is the webpack form only. Passing plugin functions to Nextra, as above, gives its loader options Turbopack cannot serialize, so a site configured this way builds and serves with webpack; the Turbopack rule from the [Next.js guide](./next.md#step-5--add-the-embed-plugin) does not apply here. → [Prepared-embed splicing](./api-reference/adapters.md#prepared-embed-splicing)

## Step 5 — Add the collector

Copy [the example collector](../examples/nextra/collect.mjs) to `collect.mjs` in your site root. It calls `nextra/compile` with the native plugin pipeline, captures the resulting document, and prepares the embeds.

Match `sourceRoot`, syntax settings, native compiler options and routes to your content configuration. **Collection and rendering must agree.** If you change one, change the other, and bump `compilerId` when the relevant settings or dependency versions change.

## Step 6 — Collect before every build

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && npm run check && next build"
  }
}
```

Collection has to run before Nextra does. To collect again as you write, wrap the same options in [`watchDocuments`](./api-reference/node.md#watching) from `@cudoment/cudoc/node/watch` instead of `buildDocumentsAsync`; the loader rule brings each pass into pages the dev server has already compiled.

`cudoc check` reports every broken link, anchor, image and embed in one pass, and exits non-zero, so a broken reference stops the build before the site is generated. → [Reference checking](./check.md)

## Step 7 — Optionally export standalone HTML

```sh
npm install cudoc-export
npx cudoc-export build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Note the source directory is `content`, not `docs`. Your Nextra build and its collected data are not modified. → [Standalone HTML](./export.md)

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

## Nextra specifics

**Native syntax alongside cudoc syntax.** Nextra's `[#id]` anchors and static `<Callout>` components keep working. To have cudoc normalize them too, so that embedded copies and HTML export carry the same semantics:

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

If you enable `both`, change it in the collector's document options **and** its adapter options. Supported native forms are listed in the [syntax guide](./syntax.md).

**Native TOC stays in charge.** The adapter sets `host: "nextra"` and promotes explicit IDs, then leaves the table of contents to Nextra.

**Static components become document nodes; dynamic ones stay components.** A static `<Callout>` normalizes into a portable callout, which every host and the standalone export can render. A component left in an embedded section renders through Nextra's own component mapping where the copy is spliced in; standalone HTML export still needs a renderer for it, and `cudoc check` names it.

**`.md` versus `.mdx`.** Authored React components belong in `.mdx`. `.md` stays Markdown, where `{value}` is literal text. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#docusaurus-and-nextra) — ordering, capture, what the adapter sets
- [Runnable example](../examples/nextra/next.config.mjs) — a working site
