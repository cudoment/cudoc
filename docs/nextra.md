# Nextra

**English** | [한국어](./nextra.ko.md) · [All guides](./README.md)

Set up cudoc in a Nextra site: the Markdown extensions first, then document embedding, and an optional HTML export at the end.

**See it first:** the [Nextra demo](https://cudoment.github.io/cudoc/demos/nextra/portable) is the [runnable example](../examples/nextra/next.config.mjs) built by Nextra 4.6.0, with links to the Markdown it was built from. → [Host demos](./README.md#host-demos)

Follow the steps in order. Steps 1–3 enable the Markdown extensions; steps 4–6 add document embedding, which lets one document reuse another; step 7 is optional.

## Step 1 — Install

Install cudoc, its remark adapter and the Nextra adapter:

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

Stay on Nextra 4.6.0, the release cudoc is tested with, which builds as installed. If `npm ls nextra` shows 4.6.1, run `npm install --save-exact nextra@4.6.0 nextra-theme-docs@4.6.0`. Nextra 4.6.1, the release npm installs today, builds no page beside zod 4.4 or later, which its own range installs, with or without cudoc ([shuding/nextra#4989](https://github.com/shuding/nextra/issues/4989)). → [Supported versions](./README.md#supported-versions)

Adding `"zod": "4.3.6"` to the `overrides` below builds 4.6.1 too. Both run a zod older than 4.6.6, the release that fixes [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (high, memory exhaustion on oversized input), and 4.6.1 does not build with zod 4.6.6. `npm audit` reports the advisory for the 4.3.6 pin only, not for the zod 4.0 beta that Nextra 4.6.0 ships.

Pin the fixed releases of two advisories with `overrides`. Next.js 15 pins `postcss` 8.4.31 and Nextra's math support pins `@xmldom/xmldom` 0.9.10; `npm audit` reports advisories for both, and neither pin lets npm choose the fixed release. The [example site](../examples/nextra/package.json) builds with the fixed releases pinned, so add the same `overrides` to `package.json`, beside any it already has, and install again:

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

The site runs with webpack: `cudocRemarkPlugins` hands Nextra plugin functions, which Turbopack cannot serialize. Next.js 15 uses webpack by default. Next.js 16 builds with Turbopack unless told otherwise, so on it run `next dev --webpack` and `next build --webpack` from here on; Next.js 15 does not accept the flag.

## Step 3 — Import the stylesheet

Import the stylesheet once, from your root layout:

```js
// app/layout.jsx — add at the top
import "@cudoment/cudoc/styles.css"
```

No cudoc component mapping is needed.

**Stop here if you only want the syntax extensions.** Run your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the embed plugin and the library loader

Add the embed plugin after the adapter's own plugins, and the library loader on the same files. With both, `next.config.mjs` reads as follows, your site's other settings kept:

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

The loader is what brings a recollection into a page the bundler has already compiled. The plugin splices prepared content into the page as it compiles, so the compiled page depends on `.cudoc/documents/embeds.json`; without the loader a recollection does not reach it.

This is the webpack form only. Passing plugin functions to Nextra, as above, gives its loader options Turbopack cannot serialize, so a site configured this way builds and serves with webpack, as step 2 says; the Turbopack rule from the [Next.js guide](./next.md#step-5--add-the-embed-plugin-and-the-library-loader) does not apply here. → [Prepared-embed splicing](./api-reference/adapters.md#prepared-embed-splicing)

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

**Collection and rendering must agree.** Match `sourceRoot`, syntax settings, native compiler options and routes to your content configuration, and change `compilerId` when the relevant settings or dependency versions change.

The collector holds its document options in one `documentOptions` object, which it spreads into the `collectDocuments` configuration and passes to the `cudocRemarkPlugins` call inside its compiler. Give that object the options your `next.config.mjs` passes to `cudocRemarkPlugins`, and change one whenever you change the other.

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

These are the Next.js 15 commands. On Next.js 16 write `next dev --webpack` and `next build --webpack`, as step 2 says.

`cudoc check` runs after `collect`: it reads the library the collector published and collects nothing, so its configuration only has to say where that library is and where the site serves root-relative images from:

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

## Step 7 — Optionally export HTML

Install `cudoc-export` and export the collected library as HTML:

```sh
npm install cudoc-export
npx cudoc-export build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

The source directory is `content`, not `docs`. Your Nextra build and its collected data are not modified. → [Export](./export.md)

---

## What you can now write

The syntax rows below work after step 3, and the embedding rows after step 6:

| Feature                           | Example                            | Details                                                       |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| Explicit heading anchors          | `## Limits (#limits)`              | [Syntax](./syntax.md#anchors-and-badges)                      |
| Heading badges                    | `## Limits (#limits) (@New)`       | [Syntax](./syntax.md#anchors-and-badges)                      |
| Callouts with titles              | `> [!NOTE] Before you start`       | [Syntax](./syntax.md#callouts)                                |
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

## Nextra specifics

**Native syntax alongside cudoc syntax.** Nextra's `[#id]` anchors and static `<Callout>` components keep working. To have cudoc normalize them too, so that embedded copies and HTML export carry the same semantics:

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

If you enable `both`, change it in the collector's `documentOptions` too. Supported native forms are listed in the [syntax guide](./syntax.md).

**Native TOC stays in charge.** The adapter sets `host: "nextra"`, normalization puts each explicit ID on its heading, and the table of contents is left to Nextra. Nextra builds it from the finished page, so headings that arrive through an embed are listed too.

**Heading IDs are slugged.** Nextra runs every heading ID through its slugger, its own `[#id]` included, so an ID keeps its spelling only when it is slug-shaped already: `## Version (#v1.2)` renders as `v12`. Write anchors in lowercase letters, digits and hyphens.

The slugger takes the IDs in document order. So an ID that an earlier heading's text already produced, `## Setup` followed by `## Intro (#setup)`, comes out as `setup-1` here and on Docusaurus. VitePress, Eleventy and the standalone export keep `setup` on the explicit one and number the earlier heading. Put the heading with the explicit ID before any heading whose text would make the same ID; with slug-shaped anchors, links to it then resolve the same on every host.

**Static components become document nodes; dynamic ones stay components.** A static `<Callout>` normalizes into a portable callout, which every host and the HTML export can render. A component left in an embedded section renders through Nextra's own component mapping where the copy is spliced in; HTML export still needs a renderer for it, and `cudoc check` names it.

**`.md` versus `.mdx`.** Authored React components belong in `.mdx`. `.md` stays Markdown, where `{value}` is literal text. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

## Next

Continue with the embedding guide, the adapter internals or the runnable example:

- [Document embedding](./embedding.md): selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#docusaurus-and-nextra): ordering, capture, what the adapter sets
- [Runnable example](../examples/nextra/next.config.mjs): a working site
