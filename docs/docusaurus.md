# Docusaurus

**English** | [한국어](./docusaurus.ko.md) · [All guides](./README.md)

Follow the steps in order. Steps 1–3 enable the Markdown extensions. Steps 4–6 add document embedding, which is what lets one document reuse another. Step 7 is optional.

## Step 1 — Install

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

Docusaurus 3.10 depends on `serialize-javascript` 6 through its webpack plugins and on `uuid` 8 through its development server. `npm audit` reports advisories for both, and Docusaurus's own ranges do not let npm choose the fixed releases. The [example site](../examples/docusaurus/package.json) builds and runs its development server with the fixed releases pinned, so add the same `overrides` to `package.json`, beside any it already has, and install again:

```json
{
  "overrides": {
    "serialize-javascript": "7.1.2",
    "uuid": "11.1.1"
  }
}
```

```sh
npm install
```

Remove an entry once a Docusaurus release depends on the fixed version itself; `npm audit` shows whether one is still needed.

## Step 2 — Register the remark plugins

Merge this into `docusaurus.config.mjs`, keeping your site's other settings:

```js
// docusaurus.config.mjs
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  // Your site's own settings stay as they are.
  title: "My docs",
  url: "https://docs.example.com",
  baseUrl: "/",
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

It must be `beforeDefaultRemarkPlugins`, not `remarkPlugins`. cudoc assigns heading anchors, and Docusaurus generates its own heading IDs and table of contents afterwards. Running cudoc second would leave the two disagreeing.

## Step 3 — Import the stylesheet

```css
/* src/css/custom.css — add at the top */
@import "@cudoment/cudoc/styles.css";
```

This styles callouts and badges. It sets no text colour of its own, so it follows your site's light and dark themes.

**Stop here if you only want the syntax extensions.** Start your site and the features in [Markdown syntax](./syntax.md) work. Continue for document embedding.

## Step 4 — Add the embed plugin and the library loader

The embed plugin goes in the same `docs` options, in `remarkPlugins`, so it runs after Docusaurus's own processing. The loader goes in a small plugin of the site's own. With both, the configuration reads as follows, your site's other settings kept:

```js
// docusaurus.config.mjs
import path from "node:path"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"

export default {
  // Your site's own settings stay as they are.
  title: "My docs",
  url: "https://docs.example.com",
  baseUrl: "/",
  markdown: { format: "detect" },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          routeBasePath: "docs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins({ syntax: {} }),
          remarkPlugins: [
            [embed, { sourceRoot: "docs", outDir: ".cudoc/documents" }],
          ],
        },
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
  plugins: [
    () => ({
      name: "cudoc-library",
      configureWebpack: () => ({
        module: {
          rules: [
            {
              test: /\.mdx?$/,
              include: [path.resolve("docs")],
              use: [libraryLoader(".cudoc/documents")],
            },
          ],
        },
      }),
    }),
  ],
}
```

The embed plugin splices prepared content into the page as it compiles, so the compiled page depends on `.cudoc/documents/embeds.json`. The loader makes a recollection reach pages the dev server and the build cache have already compiled; it leaves your files alone and adds one invisible reference definition to the compiled input.

The rule has to name your content directory in `include`: Docusaurus builds its fallback MDX loader from the `include` of every rule matching `.mdx`, and a rule without one stops the build with an invalid webpack configuration. Docusaurus loads the config as CommonJS, so resolve the path from the working directory rather than from `import.meta`.

## Step 5 — Add the collector

Create `collect.mjs` in your site root. It runs the actual Docusaurus MDX processor, captures what Docusaurus does to each document, and hands the result to [`collectDocuments`](./api-reference/node.md#watching), which writes the library and the prepared embeds together: a failed run leaves the previous pair in place.

```js
// collect.mjs
import path from "node:path"
import { createRequire } from "node:module"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import { createCompilerCapture } from "cudoc-remark"
import { collectDocuments } from "@cudoment/cudoc/node/watch"

// The options docusaurus.config.mjs passes to cudocRemarkPlugins.
const documentOptions = { syntax: {} }

// Docusaurus's own MDX processor, the one @docusaurus/core depends on. It
// is not a public entry point.
const core = createRequire(import.meta.url).resolve(
  "@docusaurus/core/package.json",
)
const { createProcessorUncached } = createRequire(core)(
  "@docusaurus/mdx-loader/lib/processor.js",
)

await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  routeBase: "/docs",
  host: "docusaurus",
  // Change it whenever these settings or the Docusaurus version change.
  compilerId: "docusaurus-v1",
  ...documentOptions,
  async compiler(source, { filePath, options }) {
    // An image named through Docusaurus's `@site` alias is recorded at the
    // address the site serves it from, which the check and the export find.
    const capture = createCompilerCapture({ aliases: { "@site/static/": "/" } })
    const processor = await createProcessorUncached({
      format: options.format,
      options: {
        siteDir: process.cwd(),
        // The site's `staticDirectories`, where `/img/…` images resolve.
        staticDirs: [path.resolve("static")],
        admonitions: true,
        removeContentTitle: false,
        // The `markdown` settings of docusaurus.config.mjs, with Docusaurus's
        // defaults for anything the site does not set.
        markdownConfig: {
          anchors: { maintainCase: false },
          hooks: {
            onBrokenMarkdownLinks: "warn",
            onBrokenMarkdownImages: "throw",
          },
          mdx1Compat: { comments: true, admonitions: true, headingIds: true },
          emoji: true,
          mermaid: false,
        },
        beforeDefaultRemarkPlugins: [
          ...cudocRemarkPlugins(documentOptions),
          capture.remark,
        ],
        rehypePlugins: [capture.rehype],
      },
    })
    await processor.process({
      content: source,
      filePath,
      frontMatter: {},
      compilerName: "server",
    })
    return capture.read()
  },
})
```

Set `sourceRoot`, `outDir` and `routeBase` to match your site. **Collection and rendering must agree**: the same syntax options, the same native Markdown settings. The collector holds its document options in one `documentOptions` object, which it spreads into the `collectDocuments` configuration and passes to the `cudocRemarkPlugins` call inside its compiler; give that object the options your site configuration passes to `cudocRemarkPlugins`. If you change one, change the other. The same goes for your static directories: `staticDirs` lists each of them, `aliases` maps `@site/` followed by each one to `/`, the address Docusaurus serves its files at, and `check.assetDirs` in `cudoc.config.mjs` and each export's `--asset-dir` name each of them too, so an image written as `@site/static/img/logo.png` is checked and exported as `/img/logo.png` ([compiler capture](./api-reference/adapters.md#compiler-capture)).

> The collector reads Docusaurus's internal processor module, `@docusaurus/mdx-loader/lib/processor.js`, which is not a public API. Check it when you upgrade Docusaurus; [supported versions](./README.md#supported-versions) lists the version it is tested with.

## Step 6 — Collect before every build

Add the scripts to `package.json`:

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "start": "npm run collect && docusaurus start",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

`cudoc check` reads the library the collector published and collects nothing, so it runs after `collect`, and its configuration only has to say where that library is and where the site serves root-relative images from:

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["static"] },
}
```

Collection has to run before the site does. To collect again as you write, call [`watchDocuments`](./api-reference/node.md#watching) from `@cudoment/cudoc/node/watch` with the same options instead of `collectDocuments`. The embed plugin inserts the prepared content automatically.

`cudoc check` reports every broken link, anchor, image and embed in one pass, and exits non-zero, so a broken reference stops the build before the site is generated. → [Reference checking](./check.md)

## Step 7 — Optionally export standalone HTML

Reuse the library you just collected to produce a shareable HTML bundle:

```sh
npm install cudoc-export
npx cudoc-export build docs --library .cudoc/documents --out-dir shared-html \
  --links host --host-url https://docs.example.com/project/ --asset-dir static
```

Your Docusaurus build and its collected data are not modified. → [Standalone HTML](./export.md)

---

## What you can now write

| Feature                     | Example                            | Details                                                    |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Explicit heading anchors    | `## Limits (#limits)`              | [Syntax](./syntax.md#anchors-and-badges)                   |
| Heading badges              | `## Limits (#limits) (@New)`       | [Syntax](./syntax.md#anchors-and-badges)                   |
| Callouts with titles        | `> [!NOTE] Before you start`       | [Syntax](./syntax.md#callouts)                             |
| Nested lists in table cells | `- Account<br />-- Verified email` | [Syntax](./syntax.md#lists-inside-table-cells)             |
| Embed a whole document      | `sources: [reference.md]`          | [Embedding](./embedding.md#reuse-a-section)                |
| Embed one section           | `sources: [reference.md#limits]`   | [Embedding](./embedding.md#reuse-a-section)                |
| Heading summary table       | `select: { depth: 2 }`             | [Embedding](./embedding.md#create-a-heading-summary-table) |
| Document tree               | `render: { type: tree }`           | [Embedding](./embedding.md#draw-a-tree-of-documents)       |
| Replace text in the copy    | `replace: [{ find, replace }]`     | [Embedding](./embedding.md#find-and-replace)               |

## Docusaurus specifics

**Native syntax alongside cudoc syntax.** Docusaurus admonitions and `{#id}` heading IDs keep working. To have cudoc normalize them too, so that embedded copies and HTML export carry the same semantics:

```js
cudocRemarkPlugins({ syntax: { headingAnchor: "both", callout: "both" } })
```

Supported native forms are listed in the [syntax guide](./syntax.md).

**Heading IDs are kept as written.** The adapter hands a heading ID that Docusaurus's slugger would change to Docusaurus as a trailing `{#id}`, which Docusaurus keeps rather than slugging again, so `## Version (#v1.2)` stays `v1.2` in the page and in its table of contents. Other IDs stay on the heading, where the slugger leaves them as they are and numbers a later heading that slugs to the same value past them. The reverse order differs between hosts: an ID that an earlier heading's text already produced, `## Setup` followed by `## Intro (#setup)`, comes out as `setup-1` here and on Nextra, where VitePress, Eleventy and the standalone export keep `setup` on the explicit one and number the earlier heading, so write the heading with the explicit ID first or give the other heading its own ID. The page's `#` heading always keeps its ID on the heading, because Docusaurus reads the page title from its text before taking a `{#id}` out; give that heading a slug-shaped ID, since one such as `(#v1.0)` comes out as `v10` there. Headings that arrive through an embed are anchors on the page but not entries in the table of contents, which Docusaurus builds before the embed plugin runs.

**Format detection.** `markdown: { format: "detect" }` keeps `.md` as plain Markdown, where `{value}` stays literal text, and treats `.mdx` as MDX. Author your own React components in `.mdx`. → [Choosing `.md` or `.mdx`](./README.md#choosing-md-or-mdx)

**No theme plugin.** This setup needs no cudoc theme plugin and no component registration. Authors write Markdown.

**Custom slugs.** Supply `routes` to the collector when your document IDs and URLs differ, and bump `compilerId` when you change settings that affect compilation.

## Next

- [Document embedding](./embedding.md) — selection, multiple sources, refresh rules
- [Adapter internals](./api-reference/adapters.md#docusaurus-and-nextra) — ordering, capture, what the adapter sets
- [Runnable example](../examples/docusaurus/docusaurus.config.mjs) — a working site
