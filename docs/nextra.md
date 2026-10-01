# Nextra

**English** | [한국어](./nextra.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–3 enable the Markdown extensions. Steps 4–6 add document embedding, which is what lets one document reuse another. Step 7 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

Next.js 15 pins `postcss` 8.4.31, and Nextra's math support pins `@xmldom/xmldom` 0.9.10. `npm audit` reports advisories for both, and neither pin lets npm choose the fixed release. The [example site](../examples/nextra/package.json) builds with the fixed releases pinned, so add the same `overrides` to `package.json`, beside any it already has, and install again:

```json
{
  "overrides": {
    "@xmldom/xmldom": "0.9.12",
    "postcss": "8.5.28"
  }
}
```

```sh
npm install
```

Remove an entry once a Next.js or Nextra release depends on the fixed version itself; `npm audit` shows whether one is still needed.

## Step 2 — Register the remark plugins

Merge this into `next.config.mjs`, keeping your site's other settings:

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
// app/layout.jsx — add at the top
import "@cudoment/cudoc/styles.css"
```

No cudoc component mapping is needed.

**Stop here if you only want the syntax extensions.** Run your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the embed plugin and the library loader

The embed plugin goes after the adapter's own plugins, and the library loader on the same files. With both, `next.config.mjs` reads as follows, your site's other settings kept:

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"

const withNextra = nextra({
  mdxOptions: {
    format: "detect",
    remarkPlugins: [
      ...cudocRemarkPlugins({ syntax: {} }),
      [embed, { sourceRoot: "content", outDir: ".cudoc/documents" }],
    ],
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx?$/,
      use: [libraryLoader(".cudoc/documents")],
    })
    return config
  },
})
```

The plugin splices prepared content into the page as it compiles, so the compiled page depends on `.cudoc/documents/embeds.json`; without the loader a recollection does not reach a page the bundler has already compiled.

This is the webpack form only. Passing plugin functions to Nextra, as above, gives its loader options Turbopack cannot serialize, so a site configured this way builds and serves with webpack; the Turbopack rule from the [Next.js guide](./next.md#step-5--add-the-embed-plugin-and-the-library-loader) does not apply here. → [Prepared-embed splicing](./api-reference/adapters.md#prepared-embed-splicing)

## Step 5 — Add the collector

Create `collect.mjs` in your site root. It calls `nextra/compile` with the native plugin pipeline, captures the resulting document, and hands the result to [`collectDocuments`](./api-reference/node.md#watching), which writes the library and the prepared embeds together: a failed run leaves the previous pair in place.

```js
// collect.mjs
import { compileMdx } from "nextra/compile"
import { cudocRemarkPlugins } from "cudoc-nextra"
import { createCompilerCapture } from "cudoc-remark"
import { collectDocuments } from "@cudoment/cudoc/node/watch"

// The options next.config.mjs passes to cudocRemarkPlugins.
const documentOptions = { syntax: {} }

await collectDocuments({
  sourceRoot: "content",
  outDir: ".cudoc/documents",
  host: "nextra",
  // Change it whenever these settings or the Nextra version change.
  compilerId: "nextra-v1",
  ...documentOptions,
  async compiler(source, { filePath, options }) {
    const capture = createCompilerCapture()
    await compileMdx(source, {
      filePath,
      codeHighlight: false,
      mdxOptions: {
        format: options.format,
        remarkPlugins: [...cudocRemarkPlugins(documentOptions), capture.remark],
        rehypePlugins: [capture.rehype],
      },
    })
    return capture.read()
  },
})
```

Match `sourceRoot`, syntax settings, native compiler options and routes to your content configuration. **Collection and rendering must agree.** The collector holds its document options in one `documentOptions` object, which it spreads into the `collectDocuments` configuration and passes to the `cudocRemarkPlugins` call inside its compiler; give that object the options your `next.config.mjs` passes to `cudocRemarkPlugins`. If you change one, change the other, and change `compilerId` when the relevant settings or dependency versions change.

## Step 6 — Collect before every build

Add the scripts to `package.json`:

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

`cudoc check` reads the library the collector published and collects nothing, so it runs after `collect`, and its configuration only has to say where that library is and where the site serves root-relative images from:

```js
// cudoc.config.mjs
export default {
  sourceRoot: "content",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["public"] },
}
```

Collection has to run before Nextra does. To collect again as you write, call [`watchDocuments`](./api-reference/node.md#watching) from `@cudoment/cudoc/node/watch` with the same options instead of `collectDocuments`; the loader rule brings each pass into pages the dev server has already compiled.

`cudoc check` reports every broken link, anchor, image and embed in one pass, and exits non-zero, so a broken reference stops the build before the site is generated. → [Reference checking](./check.md)

## Step 7 — Optionally export standalone HTML

```sh
npm install cudoc-export
npx cudoc-export build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
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

If you enable `both`, change it in the collector's `documentOptions` too. Supported native forms are listed in the [syntax guide](./syntax.md).

**Native TOC stays in charge.** The adapter sets `host: "nextra"` and promotes explicit IDs, then leaves the table of contents to Nextra. Nextra builds it from the finished page, so headings that arrive through an embed are listed too.

**Heading IDs are slugged.** Nextra runs every heading ID through its slugger, its own `[#id]` included, so an ID keeps its spelling only when it is slug-shaped already: `## Version (#v1.2)` renders as `v12`. That slugger takes the IDs in document order, so an ID that an earlier heading's text already produced, `## Setup` followed by `## Intro (#setup)`, comes out as `setup-1` here and on Docusaurus, where VitePress, Eleventy and the standalone export keep `setup` on the explicit one and number the earlier heading. Write anchors in lowercase letters, digits and hyphens, put the heading with the explicit ID before any heading whose text would make the same ID, and links to them resolve the same on every host.

**Static components become document nodes; dynamic ones stay components.** A static `<Callout>` normalizes into a portable callout, which every host and the standalone export can render. A component left in an embedded section renders through Nextra's own component mapping where the copy is spliced in; standalone HTML export still needs a renderer for it, and `cudoc check` names it.

**`.md` versus `.mdx`.** Authored React components belong in `.mdx`. `.md` stays Markdown, where `{value}` is literal text. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#docusaurus-and-nextra) — ordering, capture, what the adapter sets
- [Runnable example](../examples/nextra/next.config.mjs) — a working site
