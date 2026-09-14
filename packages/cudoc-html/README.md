# cudoc-html

Add an optional HTML output alongside your documentation host (Next.js with MDX, Docusaurus, Nextra, VitePress or Eleventy), reusing its collected content and prepared embeds. Keep the primary site and document sources unchanged. The generated directory can be deployed or shared as local files, and can also be built without another host.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-html
```

```js
import { buildSite } from "cudoc-html"

const result = buildSite({
  sourceRoot: "docs",
  outDir: "site",
  title: "Product documentation",
  syntax: {},
})
```

The CLI equivalent is `npx cudoc-html build docs --out-dir site`. Open `site/index.html` and share the whole directory. The builder handles collection, embeds, local assets, navigation, TOC and code highlighting. Use a nonexistent output path initially; existing output must be owned by cudoc. The generated shell needs no JavaScript or CDN, and does not execute React components.

To export alongside an existing site, first run that host's collector and embed preparation, then reuse its library:

```js
buildSite({
  sourceRoot: "docs",
  library: ".cudoc/documents",
  outDir: "shared-html",
  links: "host",
  hostUrl: "https://docs.example.com/project/",
  assetDirs: ["public"],
})
```

`library` reads the collected AST and prepared embeds without recompiling or modifying them. Recollect after edits. Keep syntax/compiler options in the collector, and use separate host and HTML output directories. Add `assetDirs` for host asset roots such as `public` or `static`; use `renderOptions.components` for explicit HTML rendering of custom component nodes.

Choose `links: "relative"` (default) for local files, `"host"` for the primary deployment's collected document routes, or `"none"` to remove all hyperlinks while preserving labels and formatting. The policy covers body content, embeds, raw HTML, navigation and TOC. Local images and CSS remain local; `host` keeps external URLs, while `none` removes those hyperlinks too. CLI equivalents are `--library`, `--links`, `--host-url` and repeatable `--asset-dir`.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/html.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/html.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)
