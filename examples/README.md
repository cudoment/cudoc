# Runnable examples

[Usage guides](../docs/README.md) · [한국어 가이드](../docs/README.ko.md) · [API reference](../docs/api-reference/README.md)

Five host sites and the HTML export example render the same two documents, [`portable.md`](./fixtures/portable.md) and [`reference.md`](./fixtures/reference.md), each built and checked on its own.

They demonstrate callouts, explicit anchors, badges, lists inside table cells, a heading-summary table and original-source replacement without author-written cudoc components. HTML output can accompany every host; the HTML example also demonstrates use without another host.

## Build an example

Install and build packages from the repository root first:

```sh
npm ci
npm run build
```

Examples install independently, using their own lockfiles and local `file:` package dependencies. For example:

```sh
cd examples/next-mdx
npm ci
npm run build
npm run dev
```

| Directory                                           | Host configuration    | Build           | Development or view                      | Example page         | Published demo                                                                                  |
| --------------------------------------------------- | --------------------- | --------------- | ---------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| [next-mdx](./next-mdx/next.config.mjs)              | Next.js + `@next/mdx` | `npm run build` | `npm run dev`                            | `/portable`          | [demos/next](https://cudoment.github.io/cudoc/demos/next/portable/)                             |
| [docusaurus](./docusaurus/docusaurus.config.mjs)    | Docusaurus            | `npm run build` | `npm start`                              | `/docs/portable`     | [demos/docusaurus](https://cudoment.github.io/cudoc/demos/docusaurus/docs/portable/)            |
| [nextra](./nextra/next.config.mjs)                  | Nextra                | `npm run build` | `npm run dev`                            | `/portable`          | [demos/nextra](https://cudoment.github.io/cudoc/demos/nextra/portable)                          |
| [vitepress](./vitepress/docs/.vitepress/config.mjs) | VitePress             | `npm run build` | `npx vitepress preview docs` after build | `/portable.html`     | [demos/vitepress](https://cudoment.github.io/cudoc/demos/vitepress/portable.html)               |
| [eleventy](./eleventy/eleventy.config.mjs)          | Eleventy              | `npm run build` | `npx eleventy --serve`                   | `/portable/`         | [demos/eleventy](https://cudoment.github.io/cudoc/demos/eleventy/portable/)                     |
| [export](./export/package.json)                     | HTML export           | `npm run build` | Open `site/index.html`                   | `site/portable.html` | its showcase, on the [documentation site](https://cudoment.github.io/cudoc/showcase/index.html) |

Commands in the table run inside the corresponding example directory after `npm ci`. Next.js also provides `dev:webpack` and `build:webpack`.

Each build synchronizes shared fixtures and collects documents before rendering. Edit [fixtures](./fixtures/portable.md), not the generated copies under each example's docs/content directory, and rebuild after editing them. The HTML example can be shared by copying its entire `site/` directory.

Package manifests and lockfiles define the dependency versions; check those when upgrading a host. The locked host releases are the ones the [supported versions](../docs/README.md#supported-versions) table names.

Where a host's own dependency tree carries a published advisory and a fixed release builds the example as before, the lockfile takes that release, pinned under `overrides` where the host's own range does not reach it:

- The Docusaurus example pins `postcss-selector-parser`, `serialize-javascript`, `tinypool` and `uuid` (11.1.1, the fixed release whose CommonJS entry still serves `sockjs`'s one `v4()` call in `webpack-dev-server`).
- The Nextra example pins `@xmldom/xmldom` and `postcss`.
- The Eleventy example depends on `markdown-it` 14.3.3.

The [Docusaurus](../docs/docusaurus.md#step-1--install) and [Nextra](../docs/nextra.md#step-1--install) guides give readers the same pins, and the guide check fails when a site built from a guide reports an advisory its example does not.

`npm audit` reports nothing in the Next.js, Docusaurus, Eleventy and export examples. What it still reports in the others has no fixed release the host accepts, and none of it handles input from a visitor of the built site:

| Example   | Advisories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Why it stays                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nextra    | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) (low, a prototype pollution already present can bypass `trust`) in KaTeX 0.16.47, Nextra's math rendering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Nextra 4.6 depends on KaTeX 0.16, and the fixed 0.18 releases rename KaTeX's CSS classes, which changes how a site's math looks; the example has no math |
| VitePress | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) (high, `server.fs.deny` bypass on Windows), [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) and [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) in Vite 5.4.21, [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) (high, an existence check bypassed on Windows), [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) and [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) in the launch-editor code Vite 5.4.21 bundles to open a file from the development server, [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) (low, cross-origin script execution through custom middleware) and [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) (moderate, files outside `server.fs.allow` served when project paths match system paths) in Vite 5.4.21, and [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) in esbuild 0.21.5, all reached through `vitepress dev` | VitePress 1.6.4 depends on Vite 5, and no Vite 5 release fixes them                                                                                      |

Run `npm audit` in each example before a release; a finding not in this table is fixed first if a compatible release exists, and added here with its reason if none does.

Each lockfile also records the linked workspace packages, their version and their dependencies, as npm saw them when it was written. After a version bump or a dependency change under `packages/`, run `npm run lock:examples` from the repository root to rewrite them without installing anything; `npm run test:examples` fails while they disagree.

The documentation site publishes the five host examples as their hosts build them, so a reader can see a host's own output without building anything. [`docs-site/demos.mjs`](../docs-site/demos.mjs) (`npm run docs:demos` from the repository root, after `npm ci` in each example) builds each one again for the path it is served under, `CUDOC_DEMO_BASE`, into `.cudoc/docs-demos/`, leaving the example's own pages as they were. The collected library is the demo's until the example's next build, which collects again.

A demo build differs from the example's own in two inputs: the path it is served under, and the commit its Markdown and code links name (`CUDOC_DEMO_COMMIT`; `main` in the example's own build). Each host takes the path as:

| Host            | Takes the path as                           |
| --------------- | ------------------------------------------- |
| Next.js, Nextra | `basePath`, exporting static files below it |
| Docusaurus      | `baseUrl`                                   |
| VitePress       | `base`, with the collected routes below it  |
| Eleventy        | `pathPrefix`, through its `HtmlBasePlugin`  |

Each example's navigation names the host release that drew it and links the two Markdown files, its guide, its code and the list of all demos, from [`fixtures/demo.mjs`](./fixtures/demo.mjs). CI builds the demos after the examples and checks every link in them, and the [Pages workflow](../.github/workflows/pages.yml) publishes them under `demos/` when a release completes.

## Export showcase

[`export/showcase/`](./export/showcase/) is a six-document handbook for a fictional weather API, in English with Korean translations of two documents. Four configurations export it, and every output is committed so it can be opened without building anything:

| Configuration                                                           | Writes                                                                                    | Into                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`export/showcase.config.mjs`](./export/showcase.config.mjs)            | a site, per-document PDF and Word files and a bound volume with a cover and contents page | [`export/showcase-output/`](./export/showcase-output/) |
| [`standalone.config.mjs`](./export/standalone.config.mjs), importing it | single pages                                                                              | `standalone-output/`                                   |
| [`annotate.config.mjs`](./export/annotate.config.mjs), importing it     | a page to review                                                                          | `annotate-output/`                                     |
| [`review.config.mjs`](./export/review.config.mjs), importing it         | a hosted review                                                                           | `review-output/`                                       |

[`export/review-samples/`](./export/review-samples/) holds returned notes with the report made from them. `npm run showcase` inside `export/` rebuilds every sample, and `tests/scripts/export-showcase.mjs` checks that the committed copies match the current packages.

The [documentation site](../docs-site/site.config.mjs), which [`pages.yml`](../.github/workflows/pages.yml) deploys when a release completes, publishes the site and the two single-page samples beside the guides. [The export guide](../docs/export.md#complete-examples) walks through what they demonstrate.

## Collection integrations

Each host example collects its documents with its own compiler, through the collector beside its configuration:

| Host       | Collector                                                                   |
| ---------- | --------------------------------------------------------------------------- |
| Next.js    | [collect.mjs](./next-mdx/collect.mjs), standard cudoc compiler              |
| Docusaurus | [collect.mjs](./docusaurus/collect.mjs), actual host MDX processor          |
| Nextra     | [collect.mjs](./nextra/collect.mjs), `nextra/compile`                       |
| VitePress  | [collect.mjs](./vitepress/collect.mjs), actual configured Markdown renderer |
| Eleventy   | [collect.mjs](./eleventy/collect.mjs), the renderer shared with the site    |
| Export     | Collection is part of `cudoc-export build`                                  |

Every collector calls `collectDocuments` from `@cudoment/cudoc/node/watch`, which writes the library and the prepared embeds in one step, so a failed collection leaves the previous pair in place. Collection must finish before a host attempts to render an embed.

Every example also reads [`fixtures/cudoc-options.mjs`](./fixtures/cudoc-options.mjs), VitePress and Eleventy through their `markdown.mjs`, which exists only in this repository so that every example is given the same options. To set up a site of your own, follow the [host guide](../docs/README.md#set-up-your-site), which shows every file it needs.

When adapting a collector, match syntax, plugins and routes to the rendering configuration and change `compilerId` after relevant changes. The Docusaurus and Nextra collectors keep their document options in one `documentOptions` object that they give both to `collectDocuments` and to the host's remark plugins. Internal Docusaurus processor imports are version-specific.

## Export HTML from a host example

After building a host example, export its collected documents from the repository root. For Docusaurus:

```sh
node packages/cudoc-export/dist/cli.js build examples/docusaurus/docs \
  --library examples/docusaurus/.cudoc/documents --out-dir .cudoc-export-preview \
  --links host --host-url https://docs.example.com/project/ \
  --asset-dir examples/docusaurus/static
```

The existing host build and library stay unchanged. Use `--links relative` for local navigation or `--links none` to remove all hyperlinks. Adjust source and library paths for the other examples; Nextra uses `content`, and the Eleventy example needs no `--asset-dir`. Remove the generated preview directory when finished. See the [export guide](../docs/export.md) for deployment routes, shared assets and configuration.

## Verify integrations

Every check is a test. `npm test` runs three tiers, and a tier whose
prerequisite is missing reports skipped cases with the command that satisfies
it, so a fresh clone still finishes with a meaningful result. With
`CUDOC_STRICT=1` set, any skipped case fails the run instead.

| Tier                                          | Needs              | Command                 | What it asserts                                                                                                                                                |
| --------------------------------------------- | ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*/__tests__/`                       | nothing            | `npm run test:run`      | Each package's own contract, against its source                                                                                                                |
| [`tests/integration/`](../tests/integration/) | examples installed | `npm run test:examples` | The shared fixtures compiled by each example's own compiler: syntax, native syntax, cross-host parity and the whole embed and export pipeline                  |
| [`tests/built/`](../tests/built/)             | examples built     | `npm run test:built`    | The built pages themselves: the portable document on all six hosts, the library export under each link policy, and the MDX showcase across the three MDX hosts |

```sh
npm ci
npm run build
npm test
```

The integration tier needs no site build, so it is the fastest way to catch a
syntax, normalization or embedding regression:

```sh
npm run test:examples
```

Its fixtures are [showcase.md](../tests/fixtures/showcase.md), which carries
every configurable feature in portable form, and its embed source
[reference.md](../tests/fixtures/reference.md). Native host syntax cannot live
in a shared fixture because each host spells it differently, so
[native.test.ts](../tests/integration/native.test.ts) composes that half per
host.

The tiers are described in [`tests/README.md`](../tests/README.md). Five
further checks live in [`tests/scripts/`](../tests/scripts/README.md)
rather than in the runner: two of them rewrite a fixture that every example
shares, and the third packs and installs every package. The fourth follows each
host guide in a new project, and the fifth rebuilds the committed export
showcase and compares it with the committed copy. Run
them in sequence, or run everything at once:

```sh
npm run test:scripts
npm run test:all
```

For source or API changes, run `npm run test:examples` first, then `npm test`
once the examples are built, and keep the
[API reference](../docs/api-reference/README.md) up to date. A documentation-only
change does not require rebuilding every host.

The three MDX examples also contain a component-based `showcase.mdx` fixture and a direct-AST consumer for lower-level API coverage. These are implementation fixtures, not required authoring setup. They are covered by [mdx-showcase.test.ts](../tests/built/mdx-showcase.test.ts) in the built tier and by `tests/scripts/rebuild-mdx.mjs`.
