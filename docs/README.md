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
| [Document embedding](./embedding.md) | Collection, section selection, summary tables, find-and-replace, refresh rules                      |
| [Export](./export.md)                | Standalone HTML, PDF and Word, alongside a host or alone; hyperlink policies, assets, configuration |
| [Reference checking](./check.md)     | Finding broken links, anchors, images and embeds across the whole document set                      |
| [AST datasets](./dataset.md)         | Filtering compiled documents into AST JSON for indexing and other consumers                         |

## Reference and examples

[API reference](./api-reference/README.md) documents public imports, signatures, option defaults, AST metadata, persistence and compiler ordering. [Runnable examples](../examples/README.md) are working host integrations you can build locally.

## Scope

cudoc covers Markdown syntax normalization, cross-document embedding, AST projection and HTML generation. Configuration belongs in the site setup; authors write ordinary Markdown and cudoc markers, and never import or register cudoc components.

Native syntax support is limited to the forms each guide lists. Arbitrary host plugins and dynamic components do not automatically become portable: a component whose content depends on runtime state cannot travel through an embed or into exported HTML. Live link monitoring is not provided; collection does repeat on change through `cudoc collect --watch`, described under [collection setup](./embedding.md#set-up-collection).
