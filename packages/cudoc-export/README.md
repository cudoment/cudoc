# cudoc-export

`cudoc-export` exports the documents of a Next.js, Docusaurus, Nextra, VitePress or Eleventy site, or hostless Markdown, as HTML, PDF and Word with one look.

The export reuses the host's collected content and prepared embeds and leaves the primary site and the document sources unchanged. All three formats read one set of design tokens. The generated directory can be deployed or shared as local files.

ESM · Node.js 22+

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

The CLI equivalent is `npx cudoc-export build docs --out-dir site`. Open `site/index.html` and share the whole directory. The builder handles collection, embeds, local assets, navigation, TOC and code highlighting. Use a nonexistent output path initially; existing output must be owned by cudoc.

The generated shell needs no JavaScript or CDN and does not execute React components. `themeSwitch: true` adds the theme menu's script, a local file that makes no network request.

`navigation` (a YAML file or a list) decides what the site lists and publishes, `locales` adds languages found by file suffix, and `home`, `header`, `toc`, `css`, `sourceLinks` and `mounts` shape the rest.

`mode: "standalone"` writes each document as one HTML file that carries its styles and pictures, to send on its own. `mode: "annotate"` writes pages that collect review notes, as single files or, with `annotate.target: "hosted"`, as a site with a GitHub issue form as its inbox.

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

`links` chooses the hyperlink policy. The policy covers body content, embeds, raw HTML, navigation and TOC, and local images and CSS remain local under every policy:

| `links`      | Hyperlinks become                                                               |
| ------------ | ------------------------------------------------------------------------------- |
| `"relative"` | relative paths, for local files (the default)                                   |
| `"host"`     | the primary deployment's collected document routes; external URLs are kept      |
| `"none"`     | plain text with labels and formatting kept; external hyperlinks are removed too |

CLI equivalents are `--library`, `--links`, `--host-url` and repeatable `--asset-dir`.

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

The CLI equivalent is `npx cudoc-export build docs --out-dir out --format html --format pdf --format docx --granularity both`. The PDF is printed from the print-ready HTML the build always writes, by a headless Chromium the package's install script fetches; set `CUDOC_SKIP_BROWSER_DOWNLOAD=1` to skip that download and `npx cudoc-export install-browser` to fetch it later.

npm 12 and later run the install script only once the project approves it with `npm install-scripts approve cudoc-export` and installs again; `npx cudoc-export install-browser` works either way.

Each of `headingAnchor`, `badge`, `tableCellList`, `tableCellSpan`, `tableNote`, `callout`, `link`, `codeMeta` and `tabs` takes `host`, `cudoc`, `both` or `off` independently. The representative callout is `> [!NOTE] Title`. Authors do not register any cudoc components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

## See the output

The repository keeps finished exports of a six-document API handbook, so each output can be opened before anything is installed. They are built by [`showcase.config.mjs`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase.config.mjs) and three configurations beside it from [these Markdown sources](https://github.com/cudoment/cudoc/tree/main/examples/export/showcase).

The [documentation site](https://cudoment.github.io/cudoc/index.html), itself exported by `cudoc-export`, serves the [site](https://cudoment.github.io/cudoc/showcase/index.html), a [standalone page](https://cudoment.github.io/cudoc/samples/standalone/getting-started.html) and a [page to review](https://cudoment.github.io/cudoc/samples/annotate/getting-started.html); the other formats are in the repository:

| Format           | One document                                                                                                                           | Bound volume                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML site        | [`getting-started.html`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/getting-started.html)             | [`index.html`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/index.html), the landing page                       |
| Print-ready HTML | [`getting-started.print.html`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/getting-started.print.html) | [`northlight-handbook.print.html`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/northlight-handbook.print.html) |
| PDF              | [`getting-started.pdf`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/getting-started.pdf)               | [`northlight-handbook.pdf`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/northlight-handbook.pdf)               |
| Word             | [`getting-started.docx`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/getting-started.docx)             | [`northlight-handbook.docx`](https://github.com/cudoment/cudoc/blob/main/examples/export/showcase-output/northlight-handbook.docx)             |

The PDFs open in GitHub's viewer and the Word files download; the HTML files show as source there and open as pages on the documentation site. [What the samples demonstrate](https://github.com/cudoment/cudoc/blob/main/docs/export.md#complete-examples) is described in the usage guide.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/export.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/export.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)
