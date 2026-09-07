# Guides

**English** | [한국어](./README.ko.md)

Setting cudoc up on each supported host, from an empty project to a rendered page.

- [Next.js with `@next/mdx`](./next-mdx.md)
- [Docusaurus](./docusaurus.md)
- [Nextra](./nextra.md)
- [Embedding a document in another](./embedding.md)

For the syntax, the option list and what each package does, see the [main README](../README.md). For three sites you can build and compare, see [`examples/`](../examples).

## The same shape on every host

Every host is set up the same way, in the same order:

1. **Connect the plugins** so cudoc's transforms run before the host reads headings.
2. **Provide the components**, because cudoc emits capitalized elements that MDX has to resolve.
3. **Export the AST for embedding**, by appending the `cudoc/embed` entry from the `cudoc` package to the same plugin list. Load and query it as described in the [embedding guide](./embedding.md).

What differs is only how each host takes those three things:

|             | Next.js                                                      | Docusaurus                         | Nextra                                        |
| ----------- | ------------------------------------------------------------ | ---------------------------------- | --------------------------------------------- |
| Connect     | `remarkPlugins`, named by string                             | `beforeDefaultRemarkPlugins`       | `mdxOptions.remarkPlugins`                    |
| Ordering    | anything, nothing competes                                   | must be _before_ the defaults      | already first, no opt-in                      |
| Heading ids | `cudoc-remark/heading-ids`, required with the default Anchor | in the adapter                     | in the adapter                                |
| Components  | `cudoc-remark/components` in `mdx-components`                | the adapter's theme, automatically | `cudoc-nextra/components` in `mdx-components` |
| Adapter     | none needed                                                  | `cudoc-docusaurus`                 | `cudoc-nextra`                                |

The components are one implementation, in `cudoc-remark/components`. The Nextra adapter re-exports it and the Docusaurus theme imports it, rather than either shipping its own, so a page renders the same markup wherever it is built. The plugin arrangement is likewise one function, `createHostPlugins`, which both adapters call.

## Why Next.js has no adapter

An adapter's job is to return a configured plugin list, which means being _called_ — and under Turbopack the MDX config is handed to a worker that cannot receive a function. Plugins there have to be named by string and resolved on the other side, so `cudocRemarkPlugins(options)` could not run in the first place.

That is a constraint of the bundler rather than something cudoc chose, and it is why the Next.js guide names two cudoc plugins where the other two hosts call one function. Everything after that step is the same.

## Writing an adapter for another host

Two things make a host adapter, and only one of them is host-specific.

`createHostPlugins(options, adapter)` from `cudoc-remark` is the arrangement: the transforms, the anchor ids promoted onto their headings, and an early rejection of a bad option. Both adapters here are a call to it plus a name.

The rest is however that host takes components — a theme for Docusaurus, an `mdx-components` file for Nextra and Next.js — and `cudoc-remark/components` is what you point it at.
