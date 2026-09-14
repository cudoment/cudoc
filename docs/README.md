# cudoc usage guide

**English** | [한국어](./README.ko.md) · [Project home](../README.md)

Markdown extensions and document embedding are the two core capabilities. Standalone HTML is optional additional output, usable alongside any supported documentation host or on its own. A documentation host is the site generator or web framework that builds and serves the primary site. Configuration belongs in the site setup; document authors write ordinary Markdown and cudoc markers.

## Learn in order

1. [Getting started](../README.md#getting-started): create a document and build HTML.
2. [Markdown syntax](./syntax.md): choose syntax per feature and write callouts, anchors, badges and tables.
3. [Document embedding](./embedding.md): collect documents, select sections, create summary tables and replace text.
4. [AST datasets](./dataset.md): filter compiled documents for your own consumer.
5. [Standalone HTML](./html.md): export files alongside your main site and choose a hyperlink policy.

## Choose a host

| Host                         | Guide                             | Document format                     |
| ---------------------------- | --------------------------------- | ----------------------------------- |
| Existing Next.js application | [Next.js with MDX](./next-mdx.md) | `.md`, `.mdx`                       |
| Docusaurus site              | [Docusaurus](./docusaurus.md)     | `.md`, `.mdx` with format detection |
| Nextra site                  | [Nextra](./nextra.md)             | `.md`, `.mdx` with format detection |
| VitePress site               | [VitePress](./vitepress.md)       | `.md`; React MDX is unsupported     |
| Eleventy site                | [Eleventy](./eleventy.md)         | `.md`; React MDX is unsupported     |

Syntax-only integration stops after host configuration. For cross-document embedding, add collection and preparation before starting the host. The [embedding guide](./embedding.md) explains when to run those steps again.

Standalone HTML can accompany any of the five host integrations. Reuse the host's collected library to keep native semantics and prepared embeds, and choose local links, deployment links or no hyperlinks. See [exporting alongside a site](./html.md#export-alongside-an-existing-site).

## For developers

[API reference](./api-reference/README.md) documents imports, signatures, defaults, AST metadata, persistence and compiler ordering. [Examples](../examples/README.md) provide executable host integrations and validation commands.

The current scope covers syntax, embedding, AST projection and HTML generation. Link monitoring and replacement of a separate Docs project are not included. Native syntax support is limited to the forms listed in the guides; arbitrary host plugins and dynamic components do not automatically become portable.
