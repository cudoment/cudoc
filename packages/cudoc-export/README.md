# cudoc-export

Add optional HTML, PDF and Word output alongside your documentation host (Next.js, Docusaurus, Nextra, VitePress or Eleventy), reusing its collected content and prepared embeds. All three read one set of design tokens, so they share one appearance. Keep the primary site and document sources unchanged. The generated directory can be deployed or shared as local files, and can also be built without another host.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-export
```

```js
import { buildSite } from "cudoc-export"

const result = buildSite({
  sourceRoot: "docs",
  outDir: "site",
  title: "Product documentation",
  syntax: {},
})
```

The CLI equivalent is `npx cudoc-export build docs --out-dir site`. Open `site/index.html` and share the whole directory. The builder handles collection, embeds, local assets, navigation, TOC and code highlighting. Use a nonexistent output path initially; existing output must be owned by cudoc. The generated shell needs no JavaScript or CDN (unless `annotations: true` adds the review-note script or `themeSwitch: true` the theme button's script; both are local files that make no network request), and does not execute React components.

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

For PDF and Word alongside the site, call `buildExport` with the same options plus `formats` and `granularity`; the bound volume opens with a cover and a contents page, and `page` sets paper, running header and footer for both formats:

```js
import { buildExport } from "cudoc-export"

await buildExport({
  sourceRoot: "docs",
  outDir: "out",
  formats: ["html", "pdf", "docx"],
  granularity: "both",
  page: { paper: "A4", footer: { center: "{page} / {pages}" } },
  volume: { fileName: "handbook", cover: { image: "design/cover.png" } },
})
```

The CLI equivalent is `npx cudoc-export build docs --out-dir out --format html --format pdf --format docx --granularity both`. The PDF is printed from the print-ready HTML the build always writes, by a headless Chromium the package installs; set `CUDOC_SKIP_BROWSER_DOWNLOAD=1` to skip that download and `npx cudoc-export install-browser` to fetch it later.

`library` reads the collected AST and prepared embeds without recompiling or modifying them. Recollect after edits. Keep syntax/compiler options in the collector, and use separate host and HTML output directories. Add `assetDirs` for host asset roots such as `public` or `static`; use `renderOptions.components` for explicit HTML rendering of custom component nodes.

Choose `links: "relative"` (default) for local files, `"host"` for the primary deployment's collected document routes, or `"none"` to remove all hyperlinks while preserving labels and formatting. The policy covers body content, embeds, raw HTML, navigation and TOC. Local images and CSS remain local; `host` keeps external URLs, while `none` removes those hyperlinks too. CLI equivalents are `--library`, `--links`, `--host-url` and repeatable `--asset-dir`.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/export.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/export.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)
