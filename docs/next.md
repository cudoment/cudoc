# Next.js

**English** | [한국어](./next.ko.md) · [All guides](./README.md)

Set up cudoc in a Next.js App Router site: the Markdown extensions first, then document embedding, and an optional HTML export at the end.

**See it first:** the [Next.js demo](https://cudoment.github.io/cudoc/demos/next/portable/) is the [runnable example](../examples/next-mdx/next.config.mjs) built by Next.js 16.4.2, with links to the Markdown it was built from. → [Host demos](./README.md#host-demos)

Follow the steps in order. Steps 1–4 enable the Markdown extensions; steps 5–6 add document embedding, which lets one document reuse another; step 7 is optional.

This guide assumes an existing App Router application. Match `@next/mdx` to your Next.js version.

`@next/mdx` is the loader, not a format requirement. The configuration below compiles `.md` and `.mdx` alike, and a project that only ever writes `.md` is a supported setup. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

## Step 1 — Install

Install cudoc, its remark adapter, `remark-gfm`, `@next/mdx` and the two packages it needs:

```sh
npm install @cudoment/cudoc cudoc-remark remark-gfm @next/mdx @mdx-js/loader @mdx-js/react
```

## Step 2 — Register the remark plugins

Merge this into `next.config.mjs`, keeping your site's other settings:

```js
// next.config.mjs
import createMDX from "@next/mdx"

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    format: "detect",
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", { host: "next", syntax: {} }],
    ],
  },
})

export default withMDX({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
})
```

**Keep plugin names as strings and their options JSON-serializable.** Turbopack passes them across a worker boundary, so a function reference does not survive. This form works under webpack too.

## Step 3 — Provide `mdx-components.jsx`

Next.js requires the file. If your project already has one, keep its mappings and add nothing:

```jsx
// mdx-components.jsx
export function useMDXComponents(components) {
  return { ...components }
}
```

No cudoc anchor, badge or table component needs registering.

## Step 4 — Import the stylesheet

Import the stylesheet once, from your root layout:

```js
// app/layout.jsx — add at the top
import "@cudoment/cudoc/styles.css"
```

Author documents under `docs/` and render them through your existing MDX routing, for instance `app/guide/page.jsx` importing `../../docs/guide.md`.

**Stop here if you only want the syntax extensions.** Run your app and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 5 — Add the embed plugin and the library loader

The embed plugin goes after `cudoc-remark` in the same `remarkPlugins` array, and the pass-through loader on the same files, for both bundlers. With both, `next.config.mjs` reads as follows, your site's other settings kept:

```js
// next.config.mjs
import createMDX from "@next/mdx"
import { libraryLoader } from "cudoc-remark/loader"

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    format: "detect",
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", { host: "next", syntax: {} }],
      [
        "cudoc-remark/embed",
        { sourceRoot: "docs", outDir: ".cudoc/documents" },
      ],
    ],
  },
})

const library = libraryLoader(".cudoc/documents")

export default withMDX({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  webpack(config) {
    config.module.rules.push({ test: /\.mdx?$/, use: [library] })
    return config
  },
  turbopack: { rules: { "*.{md,mdx}": { loaders: [library] } } },
})
```

If collection uses `roots`, pass the same list to the embed plugin instead of `sourceRoot`, so a file maps to the id it was collected under.

The embed plugin splices each embed's prepared content into the page while it compiles, so a component in an embedded section renders through your `mdx-components.jsx` like any other. The compiled page therefore depends on `.cudoc/documents/embeds.json`, which the bundler cannot see.

The loader makes the bundler see that dependency. It leaves your files alone and adds one invisible line to what the bundler compiles, a reference definition carrying the library's hash. So the dev server and both bundlers' build caches see that a page changed when the library did, and `cudoc collect` reaches pages that were already compiled. → [Prepared-embed splicing](./api-reference/adapters.md#prepared-embed-splicing)

## Step 6 — Collect before every build

Create the collection configuration. `host: "next"` makes collection read documents the way `cudoc-remark` compiles them; keep `syntax` equal to the options in `next.config.mjs`. `check.assetDirs` tells `cudoc check` where root-relative images such as `/img/logo.png` come from:

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "next",
  syntax: {},
  check: { assetDirs: ["public"] },
}
```

Then add the scripts to `package.json`:

```json
{
  "scripts": {
    "collect": "cudoc collect --config cudoc.config.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && npm run check && next build"
  }
}
```

Collection has to run before Next.js does. While you write, run `cudoc collect --watch --config cudoc.config.mjs` beside `next dev`: it collects again on every change under `docs/`, and the loader rule from the previous step brings the result into pages the dev server has already compiled. → [Collection setup](./embedding.md#set-up-collection)

The embed plugin generates no imports and no runtime component, and authors write no imports in Markdown.

**Match collected routes to your App Router paths.** A `guide.md` served at `/help/guide` needs `routes: { guide: "/help/guide" }`. A site with a `basePath` serves every route below it, and a Markdown link renders as a plain `<a>` that Next.js does not prefix: map `a` to `next/link` in `mdx-components.jsx`, which adds it, as the [example](../examples/next-mdx/mdx-components.jsx) does.

## Step 7 — Optionally export HTML

Reuse the library you just collected to produce a shareable HTML bundle:

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

Your Next.js build and its collected data are not modified. → [Export](./export.md)

---

## What you can now write

The first eight rows are the syntax extensions from steps 1–4 and the last five the embed shapes from steps 5–6; each row links to its reference:

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

## Next.js specifics

**Both bundlers.** The string-specifier form above builds under Turbopack and webpack alike. The [runnable example](../examples/README.md) exercises both.

**`.md` versus `.mdx`.** `format: "detect"` keeps `.md` as plain Markdown, where `{value}` stays literal text, and treats `.mdx` as MDX for your own React components. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**Optional MDX table of contents.** Adding `toc: true` to the remark options exports a `toc` binding, a two-level outline, from a compiled `.mdx` module. Plain `.md` receives no ESM export. The outline is collected before the embed plugin runs, so headings an embed brings in are anchors on the page but not entries in it. → [TOC reference](./api-reference/adapters.md#remark)

**Links to `.md` files stay as written.** Next.js routes pages by the files under `app/`, and `@next/mdx` leaves a link's address alone, so `[Limits](reference.md#limits)` points at a file the site does not serve. Link to the route, `/reference#limits`, in documents and in `linkReferences` alike; the links an embed draws already use the collected routes.

**A custom remark pipeline.** The generic collector matches the standard cudoc/GFM setup above. If your pipeline differs, collection and source replacement must use that same compiler. → [Compiler capture](./api-reference/adapters.md#compiler-capture)

## Next

Continue with the embedding guide, the adapter internals or the runnable example:

- [Document embedding](./embedding.md): selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#remark): plugin ordering and entry points
- [Runnable example](../examples/README.md): App Router imports under both bundlers
