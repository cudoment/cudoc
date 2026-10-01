# Runnable examples

[Usage guides](../docs/README.md) · [한국어 가이드](../docs/README.ko.md) · [API reference](../docs/api-reference/README.md)

Five documentation hosts and the optional HTML output render the shared [portable Markdown](./fixtures/portable.md) and [reference document](./fixtures/reference.md). They demonstrate callouts, explicit anchors, badges, lists inside table cells, a heading-summary table and original-source replacement without author-written cudoc components. HTML output can accompany every host; the HTML example also demonstrates use without another host.

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

| Directory                                           | Host configuration    | Build           | Development or view                      | Example page         |
| --------------------------------------------------- | --------------------- | --------------- | ---------------------------------------- | -------------------- |
| [next-mdx](./next-mdx/next.config.mjs)              | Next.js + `@next/mdx` | `npm run build` | `npm run dev`                            | `/portable`          |
| [docusaurus](./docusaurus/docusaurus.config.mjs)    | Docusaurus            | `npm run build` | `npm start`                              | `/docs/portable`     |
| [nextra](./nextra/next.config.mjs)                  | Nextra                | `npm run build` | `npm run dev`                            | `/portable`          |
| [vitepress](./vitepress/docs/.vitepress/config.mjs) | VitePress             | `npm run build` | `npx vitepress preview docs` after build | `/portable.html`     |
| [eleventy](./eleventy/eleventy.config.mjs)          | Eleventy              | `npm run build` | `npx eleventy --serve`                   | `/portable/`         |
| [export](./export/package.json)                     | HTML export           | `npm run build` | Open `site/index.html`                   | `site/portable.html` |

Commands in the table run inside the corresponding example directory after `npm ci`. Next.js also provides `dev:webpack` and `build:webpack`. Package manifests and lockfiles define the dependency versions; check those when upgrading a host. The locked host releases are the ones the [supported versions](../docs/README.md#supported-versions) table names. Where a host's own dependency tree carries a published advisory and a fixed release builds the example as before, the lockfile takes that release, pinned under `overrides` where the host's own range does not reach it: the Docusaurus example pins `serialize-javascript` and `uuid` (11.1.1, the fixed release whose CommonJS entry still serves `sockjs`'s one `v4()` call in `webpack-dev-server`), the Nextra example `@xmldom/xmldom` and `postcss`, and the Eleventy example depends on `markdown-it` 14.3.2. The [Docusaurus](../docs/docusaurus.md#step-1--install) and [Nextra](../docs/nextra.md#step-1--install) guides give readers the same pins, and the guide check fails when a site built from a guide reports an advisory its example does not. `npm audit` reports nothing in the Next.js, Docusaurus, Nextra, Eleventy and export examples. What it still reports in the VitePress example has no fixed release the host accepts, and concerns only the development server, never the built site:

| Example   | Advisories                                                                                                                                                                                                                                                                                                                                                                                                                     | Why it stays                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| VitePress | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) (high, `server.fs.deny` bypass on Windows), [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) and [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) in Vite 5.4.21, and [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) in esbuild 0.21.5, all reached through `vitepress dev` | VitePress 1.6.4 depends on Vite 5, and no Vite 5 release fixes them |

Run `npm audit` in each example before a release; a finding not in this table is fixed first if a compatible release exists, and added here with its reason if none does. Each lockfile also records the linked workspace packages, their version and their dependencies, as npm saw them when it was written, so after a version bump or a dependency change under `packages/` run `npm run lock:examples` from the repository root to rewrite them without installing anything; `npm run test:examples` fails while they disagree.

Each build synchronizes shared fixtures and collects documents before rendering. Edit [fixtures](./fixtures/portable.md), not the generated copies under each example's docs/content directory. Rebuild after editing fixtures. The HTML example can be shared by copying its entire `site/` directory.

## Export showcase

[`export/showcase/`](./export/showcase/) is a six-document handbook for a fictional weather API, in English with Korean translations of two documents. [`export/showcase.config.mjs`](./export/showcase.config.mjs) exports it as a site, per-document PDF and Word files and a bound volume with a cover and contents page into [`export/showcase-output/`](./export/showcase-output/); [`standalone.config.mjs`](./export/standalone.config.mjs), [`annotate.config.mjs`](./export/annotate.config.mjs) and [`review.config.mjs`](./export/review.config.mjs) import it and write single pages, a page to review and a hosted review into `standalone-output/`, `annotate-output/` and `review-output/`, and [`export/review-samples/`](./export/review-samples/) holds returned notes with the report made from them. All of it is committed so the output can be opened without building anything. `npm run showcase` inside `export/` rebuilds every sample, and `tests/scripts/export-showcase.mjs` checks that the committed copies match the current packages. The [documentation site](../docs-site/site.config.mjs), which [`pages.yml`](../.github/workflows/pages.yml) deploys when a release completes, publishes the site and the two single-page samples beside the guides. [The export guide](../docs/export.md#complete-examples) walks through what they demonstrate.

## Collection integrations

| Host       | Collector                                                                   |
| ---------- | --------------------------------------------------------------------------- |
| Next.js    | [collect.mjs](./next-mdx/collect.mjs), standard cudoc compiler              |
| Docusaurus | [collect.mjs](./docusaurus/collect.mjs), actual host MDX processor          |
| Nextra     | [collect.mjs](./nextra/collect.mjs), `nextra/compile`                       |
| VitePress  | [collect.mjs](./vitepress/collect.mjs), actual configured Markdown renderer |
| Eleventy   | [collect.mjs](./eleventy/collect.mjs), the renderer shared with the site    |
| Export     | Collection is part of `cudoc-export build`                                  |

Every collector calls `collectDocuments` from `@cudoment/cudoc/node/watch`, which writes the library and the prepared embeds in one step, so a failed collection leaves the previous pair in place. The Next.js, Docusaurus and Nextra collectors also read [`fixtures/cudoc-options.mjs`](./fixtures/cudoc-options.mjs), which exists only in this repository so that every example is given the same options; to set up a site of your own, follow the [host guide](../docs/README.md#set-up-your-site), which shows every file it needs. When adapting a collector, match syntax, plugins and routes to the rendering configuration and change `compilerId` after relevant changes; the Docusaurus and Nextra collectors keep their document options in one `documentOptions` object that they give both to `collectDocuments` and to the host's remark plugins. Internal Docusaurus processor imports are version-specific. Collection must finish before a host attempts to render an embed.

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
shares, the third packs and installs every package, the fourth follows each
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
