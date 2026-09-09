# Runnable examples

[Usage guides](../docs/README.md) · [한국어 가이드](../docs/README.ko.md) · [API reference](../docs/api-reference/README.md)

Four documentation hosts and the optional HTML output render the shared [portable Markdown](./fixtures/portable.md) and [reference document](./fixtures/reference.md). They demonstrate callouts, explicit anchors, badges, lists inside table cells, a heading-summary table and original-source replacement without author-written cudoc components. HTML output can accompany every host; the HTML example also demonstrates use without another host.

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

The existing host build and library stay unchanged. Use `--links relative` for local navigation or `--links none` to remove all hyperlinks. Adjust source and library paths for the other examples; Nextra uses `content`. Remove the generated preview directory when finished. See the [HTML guide](../docs/html.md) for deployment routes, shared assets and configuration.

## Verify integrations

Build all five examples, then run from the repository root:

```sh
node scripts/compare-portable-hosts.mjs
node scripts/check-html-hosts.mjs
node scripts/check-portable-rebuild.mjs
node scripts/check-native-hosts.mjs
```

The comparison checks rendered content and collected ASTs. The HTML check exports all four real host libraries with all three link policies, verifies rendered embeds and destinations, and hashes every source, library and primary output file to confirm they are unchanged. The rebuild check temporarily changes only the referenced document and checks that the unchanged embedding document receives fresh results, then restores the fixture and outputs. Native-host checks exercise host/cudoc normalization and HTML export with actual compilers.

The three MDX examples also contain a component-based `showcase.mdx` fixture and a direct-AST consumer for lower-level API coverage. These are implementation fixtures, not required authoring setup. Their dedicated checks are:

```sh
node scripts/compare-hosts.mjs
node scripts/check-rebuild.mjs
```

For package consumers, `node scripts/verify-pack.mjs` builds temporary packed installations and checks public imports/types. For source/API changes, run the relevant integration checks above and keep the [API reference](../docs/api-reference/README.md) up to date. A documentation-only change does not require rebuilding every host.
