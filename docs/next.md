# Next.js

**English** | [한국어](./next.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–4 enable the Markdown extensions. Steps 5–6 add document embedding, which is what lets one document reuse another. Step 7 is optional.

This guide assumes an existing App Router application. Match `@next/mdx` to your Next.js version.

`@next/mdx` is the loader, not a format requirement. The configuration below compiles `.md` and `.mdx` alike, and a project that only ever writes `.md` is a supported setup. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-remark remark-gfm @next/mdx @mdx-js/loader @mdx-js/react
```

## Step 2 — Register the remark plugins

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
export function useMDXComponents(components) {
  return { ...components }
}
```

No cudoc anchor, badge or table component needs registering.

## Step 4 — Import the stylesheet

Once, from your root layout:

```js
import "@cudoment/cudoc/styles.css"
```

Author documents under `docs/` and render them through your existing MDX routing — `app/guide/page.jsx` importing `../../docs/guide.md`, for instance.

**Stop here if you only want the syntax extensions.** Run your app and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 5 — Add the embed plugin

Append it after `cudoc-remark` in the same `remarkPlugins` array:

```js
;["cudoc-remark/embed", { sourceRoot: "docs", outDir: ".cudoc/documents" }]
```

## Step 6 — Collect before every build

Set up `cudoc.config.mjs` as described in [collection setup](./embedding.md#set-up-collection), with `host: "next"`, then:

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

There is no collection watcher, so collection has to run before Next.js does. The embed plugin adds its own runtime and prepared-data imports; authors write no imports in Markdown.

**Match collected routes to your App Router paths.** A `guide.md` served at `/help/guide` needs `routes: { guide: "/help/guide" }`.

## Step 7 — Optionally export standalone HTML

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Your Next.js build and its collected data are not modified. → [Standalone HTML](./html.md)

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

## Next.js specifics

**Both bundlers.** The string-specifier form above builds under Turbopack and webpack alike. The [runnable example](../examples/README.md) exercises both.

**`.md` versus `.mdx`.** `format: "detect"` keeps `.md` as plain Markdown, where `{value}` stays literal text, and treats `.mdx` as MDX for your own React components. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**Optional MDX table of contents.** Adding `toc: true` to the remark options exports a `toc` binding from a compiled `.mdx` module — a two-level outline. Plain `.md` receives no ESM export. → [TOC reference](./api-reference/adapters.md#remark)

**A custom remark pipeline.** The generic collector matches the standard cudoc/GFM setup above. If your pipeline differs, collection and source replacement must use that same compiler. → [Compiler capture](./api-reference/adapters.md#compiler-capture)

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#remark) — plugin ordering and entry points
- [Runnable example](../examples/README.md) — App Router imports under both bundlers
