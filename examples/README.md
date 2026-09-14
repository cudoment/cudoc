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
| [html](./html/package.json)                         | Standalone HTML       | `npm run build` | Open `site/index.html`                   | `site/portable.html` |

Commands in the table run inside the corresponding example directory after `npm ci`. Next.js also provides `dev:webpack` and `build:webpack`. Package manifests and lockfiles define the dependency versions; check those when upgrading a host.

Each build synchronizes shared fixtures and collects documents before rendering. Edit [fixtures](./fixtures/portable.md), not the generated copies under each example's docs/content directory. Rebuild after editing fixtures. The HTML example can be shared by copying its entire `site/` directory.

## Collection integrations

| Host       | Collector                                                                   |
| ---------- | --------------------------------------------------------------------------- |
| Next.js    | [collect.mjs](./next-mdx/collect.mjs), standard cudoc compiler              |
| Docusaurus | [collect.mjs](./docusaurus/collect.mjs), actual host MDX processor          |
| Nextra     | [collect.mjs](./nextra/collect.mjs), `nextra/compile`                       |
| VitePress  | [collect.mjs](./vitepress/collect.mjs), actual configured Markdown renderer |
| Eleventy   | [collect.mjs](./eleventy/collect.mjs), the renderer shared with the site    |
| HTML       | Collection is part of `cudoc-html build`                                    |

When adapting a collector, match syntax, plugins and routes to the rendering configuration and change `compilerId` after relevant changes. Internal Docusaurus processor imports are version-specific. Preparation must finish before a host attempts to render an embed.

## Export HTML from a host example

After building a host example, export its collected documents from the repository root. For Docusaurus:

```sh
node packages/cudoc-html/dist/cli.js build examples/docusaurus/docs \
  --library examples/docusaurus/.cudoc/documents --out-dir .cudoc-html-preview \
  --links host --host-url https://docs.example.com/project/ \
  --asset-dir examples/docusaurus/static
```

The existing host build and library stay unchanged. Use `--links relative` for local navigation or `--links none` to remove all hyperlinks. Adjust source and library paths for the other examples; Nextra uses `content`, and the Eleventy example needs no `--asset-dir`. Remove the generated preview directory when finished. See the [HTML guide](../docs/html.md) for deployment routes, shared assets and configuration.

## Verify integrations

Every check is a test. `npm test` runs three tiers, and a tier whose
prerequisite is missing reports skipped cases with the command that satisfies
it, so a fresh clone still finishes with a meaningful result.

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

The tiers are described in [`tests/README.md`](../tests/README.md). Three
further checks live in [`tests/scripts/`](../tests/scripts/README.md)
rather than in the runner, because two of them rewrite a fixture that every
example shares and the third packs and installs every package. Run them in
sequence, or run everything at once:

```sh
npm run test:scripts
npm run test:all
```

For source or API changes, run `npm run test:examples` first, then `npm test`
once the examples are built, and keep the
[API reference](../docs/api-reference/README.md) up to date. A documentation-only
change does not require rebuilding every host.

The three MDX examples also contain a component-based `showcase.mdx` fixture and a direct-AST consumer for lower-level API coverage. These are implementation fixtures, not required authoring setup. They are covered by [mdx-showcase.test.ts](../tests/built/mdx-showcase.test.ts) in the built tier and by `tests/scripts/rebuild-mdx.mjs`.
