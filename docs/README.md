# cudoc guides

**English** | [한국어](./README.ko.md) · [Project home](../README.md)

This page leads to the setup guide for each host, the host demos, the supported versions, the `.md`/`.mdx` choice and the guide to each cudoc feature.

Guides teach the workflow. The [API reference](./api-reference/README.md) holds signatures, defaults and contracts.

## Set up your site

Each guide is a numbered walkthrough: install, configure, wire up collection, build. Every step is a copy-pasteable command or file, so you can work through one yourself or hand it to a coding agent. Every guide ends with a table of what you can then write, and the host-specific details worth knowing.

| Your site            | Guide                           |
| -------------------- | ------------------------------- |
| **Next.js**          | [Next.js →](./next.md)          |
| **Docusaurus**       | [Docusaurus →](./docusaurus.md) |
| **Nextra**           | [Nextra →](./nextra.md)         |
| **VitePress**        | [VitePress →](./vitepress.md)   |
| **Eleventy**         | [Eleventy →](./eleventy.md)     |
| **No generator yet** | [HTML export →](./export.md)    |

A syntax-only setup ends at host configuration. Document embedding needs collection to run before the site build, and each guide marks where that line falls.

## Host demos

Each host renders the same two Markdown files with cudoc. Each demo is published as that host built it. [`portable.md`](../examples/fixtures/portable.md) uses the syntax extensions and embeds three views of [`reference.md`](../examples/fixtures/reference.md): a summary of its headings, one section reworded, and an outline. Open a demo beside the two files to compare what an author writes with what the host draws.

| Host              | Demo, built by the host                                                                | Guide                         | Runnable example                                                         |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Next.js 16.4.2    | [Portable documents](https://cudoment.github.io/cudoc/demos/next/portable/)            | [Next.js](./next.md)          | [`examples/next-mdx`](../examples/next-mdx/next.config.mjs)              |
| Docusaurus 3.10.2 | [Portable documents](https://cudoment.github.io/cudoc/demos/docusaurus/docs/portable/) | [Docusaurus](./docusaurus.md) | [`examples/docusaurus`](../examples/docusaurus/docusaurus.config.mjs)    |
| Nextra 4.6.0      | [Portable documents](https://cudoment.github.io/cudoc/demos/nextra/portable)           | [Nextra](./nextra.md)         | [`examples/nextra`](../examples/nextra/next.config.mjs)                  |
| VitePress 1.6.4   | [Portable documents](https://cudoment.github.io/cudoc/demos/vitepress/portable.html)   | [VitePress](./vitepress.md)   | [`examples/vitepress`](../examples/vitepress/docs/.vitepress/config.mjs) |
| Eleventy 3.1.7    | [Portable documents](https://cudoment.github.io/cudoc/demos/eleventy/portable/)        | [Eleventy](./eleventy.md)     | [`examples/eleventy`](../examples/eleventy/eleventy.config.mjs)          |

A demo is its example built from the example's own lockfile, so it shows the tested release the next table names, and its navigation links to the two Markdown files, its guide and its code. The demos deploy with this documentation site when a release completes. The site itself is not a host demo: `cudoc-export` built it from the README and `docs/` with no site generator, and [Export](./export.md#complete-examples) shows the other pages it makes.

Two differences between the demos come from the hosts rather than from cudoc:

- Next.js and Eleventy leave a link to a `.md` file as written, so the shared link under _Shared values_ points at `reference.md`, which those sites do not serve. Give a link on those hosts the page's address, in `linkReferences` too.
- Each host draws headings, code blocks and tables with its own theme and anchor style. Nextra keeps a code block's title only in `.mdx`, so a `.md` page shows it the way the hosts without a title of their own do.

## Supported versions

cudoc needs Node.js 22 or later, and every package is ESM. For each host the table gives the release every cudoc change is tested against, what a new project installed on the date shown was checked with, the releases cudoc supports, and the peer range the adapter declares to npm.

| Host       | Tested with                            | Checked on a fresh install, 2026-10-19                                                                                                                                                                                     | Supported                                                                    | Declared peer range                                     |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Next.js    | Next.js 16.4.2 with `@next/mdx` 16.4.2 | the same releases                                                                                                                                                                                                          | Next.js 16.4 and later 16.x                                                  | no host peer: `cudoc-remark` is a remark plugin         |
| Docusaurus | Docusaurus 3.10.2                      | the same release                                                                                                                                                                                                           | 3.10 and later 3.x                                                           | `@docusaurus/core` `^3.10.0`                            |
| Nextra     | Nextra 4.6.0 on Next.js 15.5.28        | fails: Nextra 4.6.1 on Next.js 16.4.2 beside zod 4.6.7, the Nextra defect below. It builds with zod pinned to 4.3.6 or Nextra pinned to 4.6.0, and on Next.js 15.5.28 with zod 4.3.6; on Next.js 16 each needs `--webpack` | Nextra 4.6.0, and 4.6.1 with zod below 4.4, on Next.js 15 or 16 with webpack | no host peer: `cudoc-nextra` is a set of remark plugins |
| VitePress  | VitePress 1.6.4                        | the same release                                                                                                                                                                                                           | 1.6.4 and later 1.x                                                          | `vitepress` `^1.6.4`, `markdown-it` `^14.1.0`           |
| Eleventy   | Eleventy 3.1.7                         | the same release, with `markdown-it-attrs` 5.0.1 and `markdown-it-anchor` 10.0.0                                                                                                                                           | Eleventy 3.1 and later 3.x                                                   | `@11ty/eleventy` `^3.1.0`, `markdown-it` `^14.1.0`      |

The four columns mean the following:

- **Tested** is the exact release the [runnable examples](../examples/README.md) lock and that continuous integration builds, checks and follows each guide against, on every change.
- **Checked on a fresh install** is what following each guide in a new project found on that date, with the host packages left for npm to choose as it does for anyone starting then. The cell names a release only where npm chose one the examples do not lock, and where that failed, it says so and names the pinned releases that then build, checked the same way. It is not repeated on every change: `node tests/scripts/guide-consumers.mjs --latest` repeats it, and `name@version` arguments pin a release.
- **Supported** is the range in which a failure is a cudoc defect to report and fix. A release in it that neither **Tested** nor **Checked on a fresh install** names has not been run.
- **Declared peer range** starts where support starts. So where an adapter names its host as a peer, npm installs it only beside a supported host release. npm then raises the host to one the site's own range allows, or refuses with `ERESOLVE`, as it does beside Docusaurus 3.5.

Four setups are outside support:

- **Nextra 4.6.1 with zod 4.4 or later**, which its `^4.1.12` range installs today: no Nextra site builds then, with or without cudoc, because `nextra-theme-docs` checks the layout's props without `children` and fails with `expected nonoptional, received undefined`. Nextra tracks it as [shuding/nextra#4989](https://github.com/shuding/nextra/issues/4989); the fix is merged, but no release since 4.6.1 carries it. Stay on Nextra 4.6.0, which pins its own zod, or pin zod to 4.3.6; both build, and both run a zod from before the fix for an advisory the [Nextra guide](./nextra.md#step-1--install) names.
- **Nextra under Turbopack.** The adapter hands Nextra plugin functions, which Turbopack cannot serialize, so the site builds and serves with webpack. Next.js 15 does by default; Next.js 16 builds with Turbopack unless `next dev` and `next build` are given `--webpack`.
- **VitePress 2**, the alpha (`vitepress@next`) that vitepress.dev's Getting Started installs. `cudoc-vitepress` declares `^1.6.4`, so npm refuses to install it beside a 2.0 alpha. VitePress 2 changes how pages render and how includes resolve links, and support for it is planned for a minor release once it reaches a beta; until then start from VitePress 1, which `npm install vitepress` installs.
- **markdown-it 15**, the release npm installs by default. The markdown-it adapters declare `^14.1.0`, VitePress 1 and Eleventy 3 install 14, and cudoc has not been run on 15.

Five integration details depend on the host's own version; re-check them when you upgrade it:

- **Docusaurus.** The [collector](./docusaurus.md#step-5--add-the-collector) runs Docusaurus's own MDX processor from `@docusaurus/mdx-loader/lib/processor.js`, which is an internal module rather than a public API, and the library loader is a webpack rule whose `include` has to name the content directory.
- **Nextra.** The [library loader](./nextra.md#step-4--add-the-embed-plugin-and-the-library-loader) is a webpack rule, for the reason above.
- **Next.js.** Plugin names are strings with JSON options, which both Turbopack and webpack accept; both are tested.
- **VitePress development server.** VitePress 1 runs Vite 5, which has published advisories for its development server, the worst a `server.fs.deny` bypass on Windows, and no Vite 5 release fixes them. They concern `vitepress dev` only, not the site `vitepress build` writes; keep the development server on your own machine or a trusted network. The [examples](../examples/README.md#build-an-example) list each advisory still reported and why it stays.
- **VitePress and Eleventy.** The plugin holds the library it loaded when the configuration was evaluated, so the dev server is restarted after a recollection ([VitePress](./vitepress.md#step-6--collect-before-every-build), [Eleventy](./eleventy.md#step-7--collect-before-every-build)).

cudoc follows semantic versioning, and all eight packages share one version. The compatibility it promises covers what the [API reference](./api-reference/README.md) documents of the following, and a module a package does not export is not part of it at all:

- the public imports and their signatures, options and defaults
- the Markdown syntax
- the `cudoc` and `cudoc-export` commands and their flags
- diagnostic codes and their severities
- the stored formats
- the shape of `cudoc check --format json` and of the language server's messages

The reference also describes how the current release works, and that part is no promise. It covers which problems the check finds, message wording, the positions and suggestions it reports, the layout of a text report, and processing details such as thresholds, retries and the order of steps. A minor release may change these, and so may a patch release that fixes a defect.

- A **patch** release fixes defects and keeps all of it.
- A **minor** release adds to it, such as a feature, an option or a newly supported host release, and keeps what was there.
- Only a **major** release changes or removes any of it, with the [release notes](./release-notes.md) saying what to change.

Report a defect at [github.com/cudoment/cudoc/issues](https://github.com/cudoment/cudoc/issues); the form asks, among other things, for the host with its version, the cudoc version and the smallest document that shows the problem.

## Choosing `.md` or `.mdx`

**Every cudoc feature works in both.** Anchors, badges, callouts and lists inside table cells compile to plain HTML elements on every host and in either format, so nothing in this project asks you to write `.mdx`. The choice is about your own content: `.mdx` exists so that _you_ can author React components.

On Nextra alone the format changes how two features are drawn. A code block's title goes to Nextra's own code component only in `.mdx`, so a `.md` page shows it framed as on hosts without one. Tab components named in `tabElements` are used only in `.mdx`, so a `.md` page shows cudoc's own tabs.

The format is decided **per file, by its extension**, not per project. Collection reads the extension the same way the host does, so one directory can hold both.

| Your site   | `.md` | `.mdx`                         | How the choice is made                        |
| ----------- | ----- | ------------------------------ | --------------------------------------------- |
| Next.js     | yes   | yes                            | `format: "detect"` in the `@next/mdx` options |
| Docusaurus  | yes   | yes                            | `markdown: { format: "detect" }`              |
| Nextra      | yes   | yes                            | `format: "detect"` in `mdxOptions`            |
| VitePress   | yes   | no                             | markdown-it has no MDX parser                 |
| Eleventy    | yes   | no                             | markdown-it has no MDX parser                 |
| HTML export | yes   | needs a renderer per component | components have nowhere to resolve from       |

The two markdown-it hosts do not mangle an `.mdx` file they cannot read. Collection stops with the reason:

```
cudoc-vitepress: markdown-it hosts compile Markdown .md documents, not React .mdx
```

That is a parser boundary rather than a policy. Components are still available on those hosts by their own route: VitePress renders Vue components written directly in `.md`, and cudoc normalizes a static `<Badge>` when `badge` takes host syntax. → [VitePress](./vitepress.md#vitepress-specifics)

### What a component costs you

A component renders only where it is registered. That is fine in the document that owns it. It stops being fine once an embed copies that section into another document, because HTML export has no registry to resolve the name against. [`cudoc check`](./check.md#the-unportable-component-warning) reports that at check time instead of leaving it for export time.

So the rule of thumb is narrow: keep sections that other documents embed in Markdown, and put components wherever else you like.

## Learn the features

One guide per feature:

| Guide                                | What it covers                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Markdown syntax](./syntax.md)       | Anchors, badges, callouts, lists and merged cells in tables, table notes, code titles, tabs, variables, shared link references, column layouts, syntax modes    |
| [Document embedding](./embedding.md) | Collection, section selection, summary tables, document trees, find-and-replace, refresh rules                                                                  |
| [Export](./export.md)                | HTML sites, single pages and review pages, PDF and Word, alongside a host or alone; site structure, hyperlink policies, assets                                  |
| [Reference checking](./check.md)     | Finding broken links, anchors, images, embeds and tables, letter case and missing translations across the whole document set, and the same check in your editor |
| [AST datasets](./dataset.md)         | Filtering compiled documents into AST JSON for indexing and other consumers                                                                                     |

## Reference and examples

[API reference](./api-reference/README.md) documents public imports, signatures, option defaults, AST metadata, persistence and compiler ordering. [Runnable examples](../examples/README.md) are working host integrations you can build locally.

## Scope

cudoc covers Markdown syntax normalization, cross-document embedding, AST projection and HTML generation. Configuration belongs in the site setup; authors write ordinary Markdown and cudoc markers, and never import or register cudoc components.

Native syntax support is limited to the forms each guide lists. Arbitrary host plugins and dynamic components do not automatically become portable: a component whose content depends on runtime state cannot travel through an embed or into exported HTML. Live link monitoring is not provided; collection does repeat on change through `cudoc collect --watch`, described under [Build and refresh](./embedding.md#build-and-refresh).
