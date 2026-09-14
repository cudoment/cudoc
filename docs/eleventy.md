# Eleventy

**English** | [한국어](./eleventy.ko.md) · [All guides](./README.md)

Install in an existing Eleventy site:

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-eleventy
```

## Configure syntax

Eleventy owns the markdown-it instance, so build it once in a module both the
configuration and the collector import:

```js
// markdown.mjs
import attrs from "markdown-it-attrs"
import anchor from "markdown-it-anchor"
import container from "markdown-it-container"
import { createMarkdownRenderer } from "cudoc-eleventy"

export const syntax = { headingAnchor: "both", callout: "both" }

export const createRenderer = (library) =>
  createMarkdownRenderer({ syntax, library }, (md) => {
    md.use(attrs, { allowedAttributes: ["id"] })
    md.use(anchor, { permalink: anchor.permalink.linkInsideHeader() })
    for (const type of ["warning", "tip", "info", "danger", "details"])
      md.use(container, type)
  })
```

```js
// eleventy.config.mjs
import { createRenderer } from "./markdown.mjs"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", createRenderer())
  eleventyConfig.addPassthroughCopy({
    "node_modules/@cudoment/cudoc/styles.css": "cudoc.css",
  })
  return {
    dir: { input: "docs", output: "_site" },
    markdownTemplateEngine: false,
  }
}
```

Link `/cudoc.css` from your layout. Eleventy has no bundled theme, so the layout is where the stylesheet and navigation belong.

Two settings are required rather than optional. `markdownTemplateEngine: false` keeps Liquid from rewriting Markdown before markdown-it: cudoc reads source positions out of the token stream, and the adapter raises an error when it detects a source another engine already rendered. Heading permalinks must be inserted inside the heading, as `anchor.permalink.linkInsideHeader()` does, because a permalink that wraps the heading puts the heading's own text inside a link where cudoc's `(#id)` anchors are no longer part of it.

Eleventy uses Markdown-it, so it does not use `cudoc-remark`. It shares `cudoc-markdown-it` with the VitePress adapter, so both hosts convert the actual native token stream through the same code and keep heading/TOC integration. Write `.md`; React `.mdx` is not supported.

With the settings above, both `(#id)` and native `{#id}` anchors work, as do `[!WARNING]` blockquotes and native `::: warning Title` containers. `details` retains its expandable behavior. Native syntax comes from the markdown-it plugins the site registers: `callout: "host"` has nothing to normalize until `markdown-it-container` is registered, and `headingAnchor: "host"` needs `markdown-it-attrs`.

## Add embeds

Use [the Eleventy collector](../examples/eleventy/collect.mjs) as `collect.mjs`. It builds the renderer from the same module the site uses, passes `createDocumentCompiler(md)` to collection, and prepares embeds.

Then load the library into the renderer:

```js
// eleventy.config.mjs
import { loadLibrary } from "@cudoment/cudoc/node/library"

eleventyConfig.setLibrary("md", createRenderer(loadLibrary(".cudoc/documents")))
```

Run commands from the site project root:

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "dev": "npm run collect && eleventy --serve",
    "build": "npm run collect && eleventy"
  }
}
```

The collector uses `routeSuffix: "/"` for Eleventy's default directory URLs, so `reference.md` is collected as `/reference/`. Change collected routes when changing `permalink`, output extensions or path prefixes. Match all Markdown options between collection and rendering, and update `compilerId` after relevant changes. Run collection again and restart development after source edits so the loaded library is refreshed.

If your documents are gitignored, as the synced fixtures in this repository's example are, add `eleventyConfig.setUseGitIgnore(false)`; Eleventy skips gitignored input by default.

See [embedding](./embedding.md), [the runnable config](../examples/eleventy/eleventy.config.mjs) and [markdown-it API internals](./api-reference/adapters.md#markdown-it).

## Also export standalone HTML

After collection and preparation above, install `cudoc-html` to export the same documents as shareable files. Use a separate output directory from the primary site.

```sh
npm install cudoc-html
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/
```

Match `--host-url` and collected routes to the actual deployment. Choose `--links relative` for local navigation or `--links none` to remove all hyperlinks. See [standalone HTML](./html.md) for assets and custom component rendering.
