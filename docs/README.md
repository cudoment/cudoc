# cudoc guides

**English** | [한국어](./README.ko.md) · [Project home](../README.md)

Guides teach the workflow. The [API reference](./api-reference/README.md) holds signatures, defaults and contracts.

## Set up your site

Each guide is a numbered walkthrough: install, configure, wire up collection, build. Every step is a copy-pasteable command or file, so you can work through one yourself or hand it to a coding agent. Every guide ends with a table of what you can then write, and the host-specific details worth knowing.

| Your site            | Guide                            |
| -------------------- | -------------------------------- |
| **Next.js**          | [Next.js →](./next.md)           |
| **Docusaurus**       | [Docusaurus →](./docusaurus.md)  |
| **Nextra**           | [Nextra →](./nextra.md)          |
| **VitePress**        | [VitePress →](./vitepress.md)    |
| **Eleventy**         | [Eleventy →](./eleventy.md)      |
| **No generator yet** | [Standalone HTML →](./export.md) |

Setting up syntax extensions alone stops after host configuration. Document embedding needs collection to run before the site build; each guide marks where that line falls.

## Supported versions

cudoc needs Node.js 20 or later, and every package is ESM. The table gives, for each host, the release every cudoc change is tested against, the releases cudoc supports, and the peer range the adapter declares to npm.

| Host       | Tested with                            | Supported                              | Declared peer range                                     |
| ---------- | -------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| Next.js    | Next.js 16.3.8 with `@next/mdx` 16.3.8 | Next.js 16.3 and later 16.x            | no host peer: `cudoc-remark` is a remark plugin         |
| Docusaurus | Docusaurus 3.10.2                      | 3.10 and later 3.x                     | `@docusaurus/core` `^3.10.0`                            |
| Nextra     | Nextra 4.6.0 on Next.js 15.5.25        | Nextra 4.6 and later 4.x on Next.js 15 | no host peer: `cudoc-nextra` is a set of remark plugins |
| VitePress  | VitePress 1.6.4                        | 1.6.4 and later 1.x                    | `vitepress` `^1.6.4`, `markdown-it` `^14.1.0`           |
| Eleventy   | Eleventy 3.1.6                         | Eleventy 3.1 and later 3.x             | `@11ty/eleventy` `^3.1.0`, `markdown-it` `^14.1.0`      |

**Tested** is the exact release the [runnable examples](../examples/README.md) lock and that continuous integration builds, checks, and follows each guide against. **Supported** means a failure on that release is a defect to report and fix, although only the tested release is run. A declared range starts where support starts, so where an adapter names its host as a peer, npm installs it only beside a supported host release: it raises the host to one the site's own range allows, or refuses with `ERESOLVE`, as it does beside Docusaurus 3.5.

A few integration details depend on the host's own version, and are the ones to re-check when you upgrade it:

- **Docusaurus.** The [collector](./docusaurus.md#step-5--add-the-collector) runs Docusaurus's own MDX processor from `@docusaurus/mdx-loader/lib/processor.js`, which is an internal module rather than a public API, and the library loader is a webpack rule whose `include` has to name the content directory.
- **Nextra.** The adapter hands Nextra plugin functions, which Turbopack cannot serialize, so the site builds and serves with webpack, where the [library loader](./nextra.md#step-4--add-the-embed-plugin-and-the-library-loader) is registered.
- **Next.js.** Plugin names are strings with JSON options, which both Turbopack and webpack accept; both are tested.
- **VitePress development server.** VitePress 1 runs Vite 5, which has published advisories for its development server, the worst a `server.fs.deny` bypass on Windows, and no Vite 5 release fixes them. They concern `vitepress dev` only, not the site `vitepress build` writes; keep the development server on your own machine or a trusted network. The [examples](../examples/README.md#build-an-example) list each advisory still reported and why it stays.
- **VitePress and Eleventy.** The plugin holds the library it loaded when the configuration was evaluated, so the dev server is restarted after a recollection ([VitePress](./vitepress.md#step-6--collect-before-every-build), [Eleventy](./eleventy.md#step-7--collect-before-every-build)).

cudoc follows semantic versioning, and all eight packages share one version. The compatibility it describes is what the [API reference](./api-reference/README.md) documents: the public imports and their signatures, options and defaults, the Markdown syntax, the `cudoc` and `cudoc-export` commands, and the stored formats. Before 1.0.0 a patch release keeps all of it, and a minor release may change it, with the [release notes](./release-notes.md) saying what to change; a module a package does not export is not part of it at all.

Report a defect at [github.com/cudoment/cudoc/issues](https://github.com/cudoment/cudoc/issues); the form asks for the host and its version, the cudoc version, and the smallest document that shows the problem.

## Choosing `.md` or `.mdx`

**Every cudoc feature works the same in both.** Anchors, badges, callouts and lists inside table cells compile to plain HTML elements on every host and in either format, so nothing in this project asks you to write `.mdx`. The choice is about your own content: `.mdx` exists so that _you_ can author React components.

The format is decided **per file, by its extension**, not per project. Collection reads the extension the same way the host does, so one directory can hold both.

| Your site       | `.md` | `.mdx`                         | How the choice is made                        |
| --------------- | ----- | ------------------------------ | --------------------------------------------- |
| Next.js         | yes   | yes                            | `format: "detect"` in the `@next/mdx` options |
| Docusaurus      | yes   | yes                            | `markdown: { format: "detect" }`              |
| Nextra          | yes   | yes                            | `format: "detect"` in `mdxOptions`            |
| VitePress       | yes   | no                             | markdown-it has no MDX parser                 |
| Eleventy        | yes   | no                             | markdown-it has no MDX parser                 |
| Standalone HTML | yes   | needs a renderer per component | components have nowhere to resolve from       |

The two markdown-it hosts do not mangle an `.mdx` file they cannot read. Collection stops with the reason:

```
cudoc-vitepress: markdown-it hosts compile Markdown .md documents, not React .mdx
```

That is a parser boundary rather than a policy. Components are still available on those hosts by their own route: VitePress renders Vue components written directly in `.md`, and cudoc normalizes the static forms of them. → [VitePress](./vitepress.md#vitepress-specifics)

### What a component costs you

A component renders only where it is registered. That is fine in the document that owns it, and it stops being fine once an embed copies that section into another document, because standalone HTML export has no registry to resolve the name against. [`cudoc check`](./check.md#the-unportable-component-warning) reports that at check time instead of leaving it for export time.

So the rule of thumb is narrow: keep sections that other documents embed in Markdown, and put components wherever else you like.

## Learn the features

| Guide                                | What it covers                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [Markdown syntax](./syntax.md)       | Anchors, badges, callouts, lists inside table cells, column layouts, syntax modes                   |
| [Document embedding](./embedding.md) | Collection, section selection, summary tables, document trees, find-and-replace, refresh rules      |
| [Export](./export.md)                | Standalone HTML, PDF and Word, alongside a host or alone; hyperlink policies, assets, configuration |
| [Reference checking](./check.md)     | Finding broken links, anchors, images and embeds across the whole document set                      |
| [AST datasets](./dataset.md)         | Filtering compiled documents into AST JSON for indexing and other consumers                         |

## Reference and examples

[API reference](./api-reference/README.md) documents public imports, signatures, option defaults, AST metadata, persistence and compiler ordering. [Runnable examples](../examples/README.md) are working host integrations you can build locally.

## Scope

cudoc covers Markdown syntax normalization, cross-document embedding, AST projection and HTML generation. Configuration belongs in the site setup; authors write ordinary Markdown and cudoc markers, and never import or register cudoc components.

Native syntax support is limited to the forms each guide lists. Arbitrary host plugins and dynamic components do not automatically become portable: a component whose content depends on runtime state cannot travel through an embed or into exported HTML. Live link monitoring is not provided; collection does repeat on change through `cudoc collect --watch`, described under [collection setup](./embedding.md#set-up-collection).
