# VitePress

**English** | [한국어](./vitepress.ko.md) · [All guides](./README.md)

Install in an existing VitePress site:

```sh
npm install @cudoment/cudoc cudoc-vitepress
```

## Configure syntax

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

Import `@cudoment/cudoc/styles.css` from your theme entry. If using the default theme, create or extend `docs/.vitepress/theme/index.js`:

```js
import DefaultTheme from "vitepress/theme"
import "@cudoment/cudoc/styles.css"
export default DefaultTheme
```

VitePress uses Markdown-it, so it does not use `cudoc-remark`. The adapter works with the actual native token stream and keeps heading/TOC integration. Write `.md`; React `.mdx` is not supported. Static supported native markup can be normalized, but arbitrary Vue expressions and custom plugin tokens are not guaranteed to render through the adapter.

With the settings above, both `(#id)` and native `{#id}` anchors work, as do `[!WARNING]` blockquotes and native `::: warning Title` containers. `details` retains its expandable behavior.

## Add embeds

Use [the VitePress collector](../examples/vitepress/collect.mjs) as `collect.mjs`. It configures the real VitePress renderer with the same cudoc options, passes `createDocumentCompiler(md)` to collection, and prepares embeds.

Then add a library to the plugin configuration:

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"

// Inside markdown.config(md):
md.use(cudoc, {
  syntax: { headingAnchor: "both", callout: "both" },
  library: loadLibrary(".cudoc/documents"),
  outDir: ".cudoc/documents",
})
```

Run commands from the site project root:

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "dev": "npm run collect && vitepress dev docs",
    "build": "npm run collect && vitepress build docs"
  }
}
```

The collector uses `routeSuffix: ".html"` for VitePress's default `cleanUrls: false`. Change collected routes when changing URL behavior, `base`, rewrites or custom routes. Match all Markdown options between collection and rendering, and update `compilerId` after relevant changes. Run collection again and restart development after source edits so the loaded library is refreshed.

See [embedding](./embedding.md), [the runnable config](../examples/vitepress/docs/.vitepress/config.mjs) and [VitePress API internals](./api-reference/adapters.md#vitepress).

## Also export standalone HTML

After collection and preparation above, install `cudoc-html` to export the same documents as shareable files. Use a separate output directory from the primary site.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Match `--host-url` and collected routes to the actual deployment. Choose `--links relative` for local navigation or `--links none` to remove all hyperlinks. See [standalone HTML](./html.md) for assets and custom component rendering.
