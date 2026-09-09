# Docusaurus

**English** | [한국어](./docusaurus.ko.md) · [All guides](./README.md)

Install in an existing Docusaurus site:

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

## Configure syntax

Merge the following into your existing config:

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  // Retain the site's other required settings.
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

Add to `src/css/custom.css`:

```css
@import "@cudoment/cudoc/styles.css";
```

Use `beforeDefaultRemarkPlugins` so cudoc anchors exist before native heading IDs and TOC processing. The adapter sets `host: "docusaurus"` and lets Docusaurus handle generated IDs and TOC. No cudoc theme plugin or component registration is needed for this configuration.

Format detection keeps `.md` as Markdown and `.mdx` as MDX. To accept native admonitions and heading IDs alongside cudoc markers, set `syntax: { headingAnchor: "both", callout: "both" }`. Supported forms are listed in the [syntax guide](./syntax.md).

## Add embeds

Import the embed plugin and add it to the docs plugin's `remarkPlugins`, after native processing:

```js
import embed from "cudoc-remark/embed"

// Inside presets → classic → docs:
remarkPlugins: [[embed, {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
}]],
```

Use [the Docusaurus collector](../examples/docusaurus/collect.mjs) as `collect.mjs` in your site. It calls the actual Docusaurus MDX processor, captures native transformations, then prepares embeds. It uses an internal processor entry point pinned to the example's dependency version; check it when changing Docusaurus versions.

Set `sourceRoot`, `outDir` and `routeBase` to match the site. Keep syntax options and native Markdown settings identical in collection and rendering. If you enable `both` above, update both the collector's document options and its `cudocRemarkPlugins` call. Supply `routes` for custom slugs and update `compilerId` when relevant settings change.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "start": "npm run collect && docusaurus start",
    "build": "npm run collect && docusaurus build"
  }
}
```

Recollect after source edits; there is no collection watcher. The plugin inserts prepared embeds automatically. See [embedding](./embedding.md), the [runnable site](../examples/docusaurus/docusaurus.config.mjs) and [adapter internals](./api-reference/adapters.md#docusaurus-and-nextra).

## Also export standalone HTML

After collection and preparation above, install `cudoc-html` to export the same documents as shareable files. Use a separate output directory from the primary site.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Match `--host-url` and collected routes to the actual deployment. Choose `--links relative` for local navigation or `--links none` to remove all hyperlinks. See [standalone HTML](./html.md) for assets and custom component rendering.
