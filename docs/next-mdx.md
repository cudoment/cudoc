# Next.js with MDX

**English** | [한국어](./next-mdx.ko.md) · [All guides](./README.md)

Add cudoc to an existing Next.js App Router application. Match `@next/mdx` to your Next.js version.

```sh
npm install @cudoment/cudoc cudoc-remark remark-gfm @next/mdx @mdx-js/loader @mdx-js/react
```

## Configure syntax

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

Keep plugin names as strings and their options JSON-serializable for Turbopack's worker boundary. This form also works with webpack. Both document formats use cudoc's standard HTML output by default; `syntax: {}` makes the default selection explicit.

Next.js requires `mdx-components.jsx`; if your project already has one, retain its existing mappings:

```jsx
export function useMDXComponents(components) {
  return { ...components }
}
```

Import the styles once from your root layout:

```js
import "@cudoment/cudoc/styles.css"
```

Author `.md` documents under `docs/`. Import a document into an App Router page or use your application's existing MDX routing. For example, `app/guide/page.jsx` can render `../../docs/guide.md`. No cudoc `Anchor`, `Badge` or table component registration is required.

## Add embeds

Follow [collection setup](./embedding.md#set-up-collection), with `host: "next"`. Append this plugin after `cudoc-remark`:

```js
;[
  "cudoc-remark/embed",
  {
    sourceRoot: "docs",
    outDir: ".cudoc/documents",
  },
]
```

Run collection before the Next.js command:

```json
{
  "scripts": {
    "collect": "cudoc collect --config cudoc.config.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && next build"
  }
}
```

The embed plugin adds its own runtime and prepared-data imports. Authors do not write imports in Markdown or register an embed component. Match collected document routes to your App Router paths using `routes`; for example `guide.md` rendered at `/help/guide` needs `routes: { guide: "/help/guide" }`.

The generic collector matches the standard cudoc/GFM setup above. A custom remark pipeline needs the same compiler during collection and replacements. See the [compiler capture API](./api-reference/adapters.md#compiler-capture).

## Optional MDX TOC

On `.mdx`, adding `toc: true` to the remark options exports a `toc` binding from the compiled module. It is a two-level document outline; the [TOC reference](./api-reference/adapters.md#remark) describes its shape and defaults. Plain `.md` does not receive an ESM TOC export.

See the [running Next.js example](../examples/README.md) for App Router imports and both bundlers. Its additional component fixtures exercise lower-level APIs; the configuration above is the usage-guide starting point.

## Also export standalone HTML

After collection and preparation above, install `cudoc-html` to export the same documents as shareable files. Use a separate output directory from the primary site.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Match `--host-url` and collected routes to the actual deployment. Choose `--links relative` for local navigation or `--links none` to remove all hyperlinks. See [standalone HTML](./html.md) for assets and custom component rendering.
