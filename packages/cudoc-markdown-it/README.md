# cudoc-markdown-it

> **A VitePress or Eleventy site does not install this package.** It is the markdown-it layer inside `cudoc-vitepress` and `cudoc-eleventy`, which depend on it and set it up, so follow the [VitePress](https://github.com/cudoment/cudoc/tree/main/docs/vitepress.md) or [Eleventy](https://github.com/cudoment/cudoc/tree/main/docs/eleventy.md) guide instead. Use it directly in one case only: connecting cudoc to another markdown-it host that has no adapter yet. Otherwise start from [your site generator](https://github.com/cudoment/cudoc#pick-your-site-generator).

Connect cudoc Markdown syntax, document collection and embedding to a markdown-it pipeline.

This separate package is a pipeline adapter, not a second implementation of cudoc's rules. Shared document semantics live in `@cudoment/cudoc`. It is the markdown-it counterpart of `cudoc-remark`: the VitePress and Eleventy adapters depend on it, so the two hosts share one token conversion, one embed expansion and one collection path.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-markdown-it
```

```js
import { installHostPlugin, createHostCompiler } from "cudoc-markdown-it"

const host = {
  adapter: "cudoc-my-host",
  host: "markdown",
  documentId: (env) => String(env.documentId),
}

export default function cudocMyHost(md, options = {}) {
  installHostPlugin(md, options, host)
}
export const createDocumentCompiler = (md) => createHostCompiler(md, host)
```

The plugin converts the actual token stream and never parses the Markdown a second time. It reads the host's own anchor, link and container tokens, then copies the resolved heading ids and titles back onto the host tokens so native heading and TOC behavior is preserved. The host still renders its own code blocks, HTML blocks and every token cudoc does not map, such as a table of contents or a code group, so its highlighting and plugins keep working. Diagnostics raised while the site renders go to an `onDiagnostic` option, a warning on stderr by default. `MarkdownItHost` names everything a host does differently: its own tokens, the document id in its markdown-it env, whether it resolves links in renderer rules, and whether it strips front matter outside markdown-it.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [VitePress guide](https://github.com/cudoment/cudoc/tree/main/docs/vitepress.md) · [Eleventy guide](https://github.com/cudoment/cudoc/tree/main/docs/eleventy.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/adapters.md#markdown-it)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)
