# Standalone HTML

**English** | [한국어](./html.ko.md) · [All guides](./README.md)

Standalone HTML is an optional additional output for cudoc's Markdown extensions and document embedding. Keep Next.js (MDX), Docusaurus, Nextra or VitePress as your primary documentation host and use `cudoc-html` alongside it, reusing the same collected documents and prepared embeds. You do not need to switch hosts or maintain a second document set. It can also be used on its own. The output can be deployed to a static server or opened directly from disk. No application scaffold is required.

## Build from Markdown

```sh
npm install @cudoment/cudoc cudoc-html
npx cudoc-html build docs --out-dir site
```

Write `.md` documents under `docs/`. See the [first-site walkthrough](../README.md#getting-started) for complete content with embeds. The builder collects the documents, resolves embeds and writes HTML, styles and local assets. It adds navigation, a heading TOC, callouts, scrollable tables and highlighted code.

## Export alongside an existing site

Run the collector from your [host guide](./README.md#choose-a-host) first. It must capture the actual host compiler's output and prepare any embeds. Install `cudoc-html` in that project and create `site.config.mjs`:

```js
export default {
  sourceRoot: "docs", // "content" in the Nextra guide
  library: ".cudoc/documents",
  outDir: "shared-html",
  title: "Product documentation",
  links: "host",
  hostUrl: "https://docs.example.com/project/",
  assetDirs: ["public"], // Docusaurus usually uses "static"
}
```

```sh
npm run collect
npx cudoc-html build --config site.config.mjs
```

The regular host build and HTML export both consume the collection and can run in either order afterward. `library` reuses the stored AST, native heading IDs, routes and prepared embeds, including replacements compiled by asynchronous hosts. It reads the library without rebuilding or modifying it. Use separate output directories for the main site and HTML export.

Keep syntax, component mappings and compiler configuration in the collector; do not repeat them in this HTML configuration when `library` is set. Recollect and prepare after editing documents, routes or compiler settings. Export uses the collected snapshot, not unsaved or newly edited source content. Documents without embeds need no prepared-embed file; documents with embeds require it.

For a single command after collection:

```sh
npx cudoc-html build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir public
```

## Choose hyperlink behavior

| `links` / `--links`  | Behavior                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `relative` (default) | Link documents to local `.html` files and copy local linked files. Keep external URLs.                                               |
| `host`               | Point local hyperlinks to the primary deployment; keep external URLs such as HTTPS and `mailto:`. Requires `hostUrl` / `--host-url`. |
| `none`               | Remove all hyperlinks, including external URLs, while preserving their labels, nested formatting and images.                         |

The policy applies to authored links, raw HTML, embedded sections and tables, generated navigation, TOC and footnotes. Local images and styles remain available in every mode. `none` removes clickable anchors, not rendering resources such as the stylesheet's `<link>` element. It also avoids copying files referenced only by removed hyperlinks.

In `host` mode, set `hostUrl` to the full deployment URL including its base path. For example, with `https://docs.example.com/project/` and a collected route `/docs/start`, both `start.md#setup` and `/docs/start#setup` become `https://docs.example.com/project/docs/start#setup`. Already-prefixed routes do not get a duplicate `/project/`. Query strings and fragments are preserved; a fragment-only link targets the current document on the deployed site. Other local paths resolve against the deployment and the current document's route.

Set custom slugs and routes in the collector to match the primary site's URLs. HTML export does not infer routing from host configuration. `links` controls exported hyperlinks; it is separate from `syntax.link`, which controls syntax normalization during collection.

## Configure the site

Create `site.config.mjs`:

```js
export default {
  sourceRoot: "docs",
  outDir: "site",
  title: "Product documentation",
  navigation: ["index", "reference"],
  syntax: { headingAnchor: "cudoc", callout: "cudoc" },
  links: "relative",
  // css: "./custom.css",
}
```

```sh
npx cudoc-html build --config site.config.mjs
```

`navigation` uses document IDs without extensions. Listed documents come first, with remaining documents following. `css` appends a local CSS file to the built-in stylesheet. If there is no `index.md`, the builder creates an index page. JSON config is also accepted.

This configuration collects Markdown directly. Add `library` and remove the collection options such as `syntax` when reusing an existing host library.

## Assets and custom components

Source-relative images are resolved under `sourceRoot`. Use `assetDirs: ["public", "static"]` or repeat `--asset-dir` for additional URL-root asset directories. For example, `/img/logo.svg` can be copied from `public/img/logo.svg`. With `hostUrl` configured, the resolver also accepts its base prefix, such as `/project/img/logo.svg`. Referenced local images and styles are copied and linked relatively even when hyperlinks use `host` or `none`; authored external resources remain external.

Normalized native callouts, headings, links and tables render from the collected AST. React and Vue component code is not executed. If a custom component remains in the AST, provide an explicit HTML callback in ESM config or the `buildSite` API:

```js
const renderOptions = {
  components: {
    ProductMark: () => '<strong class="product-mark">Product</strong>',
  },
}
```

Add this `renderOptions` to the site options. Component callbacks return HTML, and the chosen link policy also applies to their output. See [rendering contracts](./api-reference/document.md#components-and-rendering) for node and child arguments. Unsupported components fail rather than being silently omitted. Source HTML and renderer output are not sanitized by cudoc.

## Share or deploy

Open `site/index.html`, copy the whole `site/` directory to another machine, or upload that directory to a static host. Use `relative` for navigation within the shared directory, `host` to direct readers to the primary site, or `none` for reading without clickable links. CSS and copied local assets use relative paths. The generated shell needs no client-side fetch, JavaScript or CDN. This is a directory export, not a single HTML file containing all assets.

Run the build again to update the site. Keep `outDir` separate from source, library and asset directories, and use an output directory owned by cudoc. A failed staged site write preserves the previous site. Without `library`, the generated document library is a separate output; its default is `.cudoc/documents` under the site directory's parent (`site` → `.cudoc/documents`). With `library`, that input stays unchanged.

## Checks for your deployment

- Confirm collected routes, custom slugs, base paths and `hostUrl` against the primary site's deployed URLs. The exporter rewrites links but does not check remote availability.
- Copy the whole output directory to a different location and open it with `file://` in the browsers your readers use. Check navigation, images, styles, embedded tables and printing; this is not a single-file bundle.
- Inspect host-specific widgets and assets. Dynamic React/Vue code needs an explicit HTML renderer, and CSS imports, CSS `url()` dependencies and responsive `srcset` resources are not recursively bundled.
- Keep the primary build and HTML output separate. Recollect and prepare before exporting changed documents. Review the documents/scopes included before sharing; HTML export is not a publication-permission filter.

The repository's [host-library export check](../scripts/check-html-hosts.mjs) verifies all three link policies against four real host libraries and hashes all source, library and primary output files to verify they remain unchanged.

See [buildSite options and behavior](./api-reference/adapters.md#html) for the programmatic API.
