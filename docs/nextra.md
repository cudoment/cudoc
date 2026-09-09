# Nextra

**English** | [한국어](./nextra.ko.md) · [All guides](./README.md)

Install in an existing Nextra application:

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

## Configure syntax

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

Keep your existing Nextra theme configuration and MDX component mappings. Import `@cudoment/cudoc/styles.css` once from the root layout. No cudoc component mapping is needed.

Nextra runs configured remark plugins before its own heading processing. The adapter selects `host: "nextra"`, promotes explicit IDs and leaves the native TOC in charge. Both `.mdx` and `.md` use standard HTML semantics by default; `syntax: {}` makes that choice explicit.

To accept `[#id]` anchors and static `<Callout>` components together with cudoc syntax, set `syntax: { headingAnchor: "both", callout: "both" }`. Authored React components belong in `.mdx`; `.md` remains Markdown.

## Add embeds

Append the embed plugin after the adapter's plugins:

```js
import embed from "cudoc-remark/embed"

remarkPlugins: [
  ...cudocRemarkPlugins({ syntax: {} }),
  [embed, { sourceRoot: "content", outDir: ".cudoc/documents" }],
],
```

Use [the Nextra collector](../examples/nextra/collect.mjs) as your site's `collect.mjs`. It calls `nextra/compile` with the native plugin pipeline, captures the resulting document, and prepares embeds.

Match `sourceRoot`, syntax settings, native compiler options and routes to the site's content configuration. If you enable `both`, change both the collector's document options and its adapter options. Update `compilerId` when the relevant settings or dependency versions change.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "dev": "npm run collect && next dev",
    "build": "npm run collect && next build"
  }
}
```

Run collection again after source edits. Static native components can become common document nodes; dynamic component code is not evaluated when rendering portable embeds. See [embedding](./embedding.md), [the runnable config](../examples/nextra/next.config.mjs) and [adapter internals](./api-reference/adapters.md#docusaurus-and-nextra).

## Also export standalone HTML

After collection and preparation above, install `cudoc-html` to export the same documents as shareable files. Use a separate output directory from the primary site.

```sh
npm install cudoc-html
npx cudoc-html build content --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Match `--host-url` and collected routes to the actual deployment. Choose `--links relative` for local navigation or `--links none` to remove all hyperlinks. See [standalone HTML](./html.md) for assets and custom component rendering.
