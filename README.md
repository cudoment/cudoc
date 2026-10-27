# cudoc

**English** | [한국어](./README.ko.md)

**Write a fact once. Reuse it everywhere. Keep one source of truth across every document, every site and every index.**

cudoc adds three features to the Markdown documentation and the site generator you already use:

- **Syntax extensions** let a page say what plain Markdown cannot, such as lists inside table cells, titled callouts and tabs.
- **Document embedding** brings another document, or a section of it, into a page at build time, so each fact is written once.
- **Export** writes the same documents as an HTML site, single HTML pages, PDF and Word.

Authors keep writing ordinary Markdown, with no component to import. Your documentation now has two readers: the people who open it, and the machines that read it far more often, such as retrieval pipelines, agents and models. cudoc serves both from one source.

**Set it up:** [Next.js](./docs/next.md) · [Docusaurus](./docs/docusaurus.md) · [Nextra](./docs/nextra.md) · [VitePress](./docs/vitepress.md) · [Eleventy](./docs/eleventy.md) · [no generator yet](./docs/export.md) · [what each host asks of you](#pick-your-site-generator)

**This README is also a [website](https://cudoment.github.io/cudoc/index.html)**, built by `cudoc-export` from this file and `docs/` with no static site generator: cudoc's documentation, exported by cudoc.

---

## The problem: the same sentence in eleven places

A fact that belongs on several pages gets copied, and the copies drift apart as soon as one of them changes. A rate limit, a required permission, a supported version table: one copy is corrected, and the other ten quietly become wrong.

**cudoc removes the copies.** A fact lives in exactly one document, and every other document points at it:

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

At build time cudoc pulls the real content in. Readers see a complete page, and authors maintain one paragraph.

---

## "Can't I just import a shared component?"

You can, and it removes the copies too, but an import and an embed produce different things. Every MDX host lets you write a partial and import it, and the markdown-it hosts have include directives that do the same.

An import is a **reference that stays a reference**: the page holds a component node, and the text appears only once the host renders it with that component registered.

```mdx
import Limits from "./_limits.mdx"

<Limits />
```

An embed is **resolved before anything renders**: at build time cudoc replaces the block with the real headings, paragraphs and tables from the source document, as ordinary document nodes.

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

That single difference decides the rest:

|                               | Shared component                                                                                       | `cudoc-embed`                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Unit of reuse                 | a whole file; VitePress can also include lines or a region marked in the file                          | any section of a real page, by anchor, title or depth, with nothing marked |
| Where the fact lives          | a partial with no URL, no anchor, no place in the nav; a VitePress region is marked inside a page      | a published document readers can link to                                   |
| Authoring                     | `.mdx`, plus an import line on every page that uses it                                                 | plain `.md`, nothing to import or register                                 |
| Across hosts                  | each host spells it differently                                                                        | the same block on all six                                                  |
| Adapting a copy               | add props, or fork the partial                                                                         | `replace` rewords this copy; the source is untouched                       |
| Derived views                 | include only                                                                                           | `render: { type: table }` builds a summary of headings                     |
| Checking                      | a missing import fails the build, one at a time; a missing VitePress include or region passes silently | `cudoc check` reports every broken source and anchor in one pass           |
| What a non-host consumer gets | a component name it cannot render                                                                      | the text                                                                   |

### Reuse should not force you to fragment your documents

cudoc leaves the document whole: `reference.md` stays a page with a URL, `#limits` stays an anchor someone can link to, and the reuse is written where it happens. You do not predict the reuse boundary before you need it, and you do not restructure anything when it changes.

A partial makes the unit of reuse equal to the unit of file. To share one section, you cut it out into `_limits.mdx` and import it back into the page it came from; after a few rounds the canonical text lives in fragments no reader opens, and the real pages become assembly manifests.

### And the copy is real text

cudoc's resolved output is the actual content, so every destination receives the same complete document. A component node is opaque to anything that is not the host: HTML export, an AST dataset, a retriever reading your corpus. → [Document embedding](./docs/embedding.md)

---

## The second reader: your retrieval pipeline

Duplicated documentation now **poisons your retrieval index** as well as costing you maintenance. Over duplicated docs, a RAG pipeline turns the eleven near-identical copies into chunks: a query retrieves several of them, spends the context window repeating one sentence, and dilutes the relevance score of the chunk that actually answers the question. When a fact is updated in one page and not the others, stale copies compete with the fresh one, and the model has no way to tell which is current.

Single-sourcing fixes that at the root. cudoc then gives the machine side four more things:

- **Resolved output, not a pointer.** Embeds are expanded at build time, so the HTML a crawler or retriever reads is whole. Authors maintain a reference, and machines receive the full text.
- **Chunks by meaning, not by character count.** `cudoc dataset` exports compiled documents as AST JSON with a manifest, keeping heading hierarchy, anchors and section boundaries, so a chunk can be a section rather than a window that lands mid-sentence. One config line drops `code` blocks or internal-only components from what you index. → [AST datasets](./docs/dataset.md)
- **A corpus that holds each shared fact once.** The dataset keeps each document as collected: an embed stays the `cudoc-embed` block that names its source, not a second copy of the text, so a fact shared through embeds is indexed once, at the document that owns it. Every section is addressable as `document#anchor`, so a tool can answer "what is the rate limit?" with one section and cite the anchor it came from. The dataset filters; it does not look for duplicates, so text copied by hand stays copied.
- **Source a model can read.** Authors never import or register a component, so the `.md` file a model ingests is the same text a person reads: no JSX to strip, no runtime state that only exists after a render.

When an agent writes the docs, `cudoc check --format json` hands back every broken link, anchor, image and embed in one machine-readable pass, so the loop closes without a human reading a build log. `cudoc lsp` runs the same check in an editor, on every save, with the likely corrections as quick fixes. → [Reference checking](./docs/check.md)

---

## Pick your site generator

Each guide is a numbered walkthrough (install, configure, wire up collection, build). Every step is a copy-pasteable command or file, so you can work through one yourself or hand it to a coding agent and have it set the project up for you.

| Your site            | Guide                                       | Demo                                                                                    | Install                                         |
| -------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Next.js**          | [Set up Next.js →](./docs/next.md)          | [Built by Next.js](https://cudoment.github.io/cudoc/demos/next/portable/)               | `@cudoment/cudoc cudoc-remark`                  |
| **Docusaurus**       | [Set up Docusaurus →](./docs/docusaurus.md) | [Built by Docusaurus](https://cudoment.github.io/cudoc/demos/docusaurus/docs/portable/) | `@cudoment/cudoc cudoc-remark cudoc-docusaurus` |
| **Nextra**           | [Set up Nextra →](./docs/nextra.md)         | [Built by Nextra](https://cudoment.github.io/cudoc/demos/nextra/portable)               | `@cudoment/cudoc cudoc-remark cudoc-nextra`     |
| **VitePress**        | [Set up VitePress →](./docs/vitepress.md)   | [Built by VitePress](https://cudoment.github.io/cudoc/demos/vitepress/portable.html)    | `@cudoment/cudoc cudoc-vitepress`               |
| **Eleventy**         | [Set up Eleventy →](./docs/eleventy.md)     | [Built by Eleventy](https://cudoment.github.io/cudoc/demos/eleventy/portable/)          | `@cudoment/cudoc cudoc-eleventy`                |
| **No generator yet** | [HTML export →](./docs/export.md)           | [This README as a site](https://cudoment.github.io/cudoc/index.html)                    | `@cudoment/cudoc cudoc-export`                  |

Each host demo is the same two Markdown files, built by that host from the [runnable example](./examples/README.md); [Host demos](./docs/README.md#host-demos) links the files beside each one. With no generator yet, the last row starts from an empty directory: two commands and two documents give you a complete site. → [Your first site](./docs/export.md#your-first-site-from-an-empty-directory)

The install column lists cudoc's own packages, and a guide's first step installs anything else its host needs. Every package is ESM and needs Node.js 22 or later. [Supported versions](./docs/README.md#supported-versions) lists the host releases every change is tested against, and gives the details of what each host asks of your setup:

- **Docusaurus.** Collection runs Docusaurus's own MDX processor from `@docusaurus/mdx-loader/lib/processor.js`, an internal module rather than a public API, so re-check it when you upgrade Docusaurus.
- **Nextra.** The site builds and serves with webpack rather than Turbopack, which cannot carry the plugin functions the adapter hands Nextra; on Next.js 16 that takes `--webpack`. Nextra 4.6.1, the release npm installs today, builds nothing beside zod 4.4 or later with or without cudoc, so the guide has you stay on 4.6.0; pinning zod below 4.4 also builds 4.6.1.
- **VitePress and Eleventy.** The plugin holds the library it loaded at startup, so restart the development server after collecting again.
- **VitePress.** VitePress 1 runs Vite 5, whose development server has published advisories no Vite 5 release fixes; they do not reach the built site.

Every host takes `.md`, and the three MDX hosts also take `.mdx`, decided per file by its extension. Every cudoc feature works in both; only on Nextra are a code title and named tab components drawn differently in `.md`. → [Choosing `.md` or `.mdx`](./docs/README.md#choosing-md-or-mdx)

HTML, PDF and Word export is an **extra output** available from every host, reusing the same collected documents, rather than a seventh choice you make instead of the others. → [Export alongside an existing site](./docs/export.md#export-alongside-an-existing-site)

---

## What you get

A site takes up the three features in this order: syntax extensions within the pages you have, document embedding between those pages, and export of the same documents to other formats.

### Markdown that does more, without components

Authors never import or register a React component; the page stays Markdown.

```md
## Requirements (#requirements) (@New)

> [!NOTE] Before you start
> Prepare your account and access token.

| Item   | What you need                                        |
| ------ | ---------------------------------------------------- |
| Access | - Account<br />-- Verified email<br />- Access token |
```

The extensions are explicit heading anchors, badges, callouts with real titles, nested lists inside table cells, merged cells, table notes, titled code blocks with highlighted lines, tabs, shared variables and shared link definitions. Each feature your host also spells its own way accepts cudoc syntax, your host's native syntax, or both, so you can adopt cudoc without rewriting a single existing page. A feature you do not use can be turned off, and its syntax stays the text it is written as. → [Markdown syntax](./docs/syntax.md)

### Embedding that selects, not just includes

An embed names a whole document, one section or a folder, and can summarize, outline or reword what it brings in.

| You want                               | You write                                             |
| -------------------------------------- | ----------------------------------------------------- |
| A whole document                       | `sources: [reference.md]`                             |
| One section and its children           | `sources: [reference.md#limits]`                      |
| A section without its children         | `includeChildren: false`                              |
| A summary table of headings            | `select: { depth: 2 }` with `render: { type: table }` |
| A folding tree of a folder's documents | `sources: [guides/]` with `render: { type: tree }`    |
| The same content, worded for this page | `replace: [{ find: "...", replace: "..." }]`          |

The source document never changes. → [Document embedding](./docs/embedding.md)

### Edit the source, and every copy follows while you write

`cudoc collect --watch` beside your dev server collects a saved document again in the time it takes to compile that one file. Only the documents whose text changed are compiled, only the embeds that read one of them are resolved again, and everything else is reused.

```sh
cudoc collect --watch --config cudoc.config.mjs
```

On the MDX hosts the loader you registered tells the dev server that the pages embedding it changed, so the copy in the browser updates without a restart. A document that fails to compile is a message in the terminal while the last good result stays in place. VitePress and Eleventy load the library when their configuration is evaluated, so there the dev server is restarted after the change. → [Collection setup](./docs/embedding.md#set-up-collection), [Watching](./docs/api-reference/node.md#watching)

### One set of documents, three destinations

Your site, HTML to hand over and a machine-readable AST corpus all come from the same Markdown, resolved the same way.

| Output             | Command              | Use it for                                                              |
| ------------------ | -------------------- | ----------------------------------------------------------------------- |
| Your existing site | your normal build    | production docs, for people                                             |
| HTML export        | `cudoc-export build` | offline handoff, one-file attachments, review rounds, static deployment |
| AST dataset        | `cudoc dataset`      | RAG pipelines, search indexes, MCP servers, agent context               |

HTML export writes a site, single pages that carry their own styles and pictures, or pages that collect review notes. Hyperlinks follow one of three policies: links to local files, links to deployed URLs, or no links at all. So the same content works browsed from disk, attached to a message or published.

Complete samples are committed with the repository. A six-document API handbook is exported from [one configuration](./examples/export/showcase.config.mjs) into a site in two languages, per-document files and a bound volume with a cover and a contents page. It is exported from three more configurations into [single pages](./examples/export/standalone-output/getting-started.html), [a page to review](./examples/export/annotate-output/getting-started.html) and [a hosted review](./examples/export/review-output/). Open [the PDF](./examples/export/showcase-output/northlight-handbook.pdf) or [the Word file](./examples/export/showcase-output/northlight-handbook.docx) directly, browse [the site](./examples/export/showcase-output/index.html) on the documentation site or from a clone, and compare them with the [sources](./examples/export/showcase/) that produced them. → [Complete examples](./docs/export.md#complete-examples)

---

## Reference

Guides teach the workflow, and the reference is where signatures, defaults and contracts live.

| Looking for                                                    | Go to                                               |
| -------------------------------------------------------------- | --------------------------------------------------- |
| Syntax modes, callout types, native forms, column layouts      | [Markdown syntax](./docs/syntax.md)                 |
| Collection setup, selection, replacement, refresh rules        | [Document embedding](./docs/embedding.md)           |
| HTML modes, site structure, link policies, PDF and Word        | [Export](./docs/export.md)                          |
| Broken links, anchors, images and embeds across a document set | [Reference checking](./docs/check.md)               |
| Projection options, manifest format, consumer contract         | [AST datasets](./docs/dataset.md)                   |
| Imports, signatures, option defaults, AST metadata, internals  | [API reference](./docs/api-reference/README.md)     |
| Which package does what, and what each one exports             | [Packages](./docs/api-reference/README.md#packages) |
| A real site you can run                                        | [Runnable examples](./examples/README.md)           |

---

## Contributing

A clone builds and tests with three commands:

```sh
npm ci
npm run build
npm test
```

`npm test` runs three tiers: package unit tests, the shared fixtures compiled by each example's real compiler, and assertions on built example sites. A tier whose prerequisite is missing skips with the command that satisfies it, and `CUDOC_STRICT=1` turns any skip into a failure. See [`tests/README.md`](./tests/README.md).

Host examples install separately with their own lockfiles. Update the affected guide and API reference in the same change as any API or workflow change. [CONTRIBUTING.md](./CONTRIBUTING.md) covers reporting a problem, making a change and writing a page.

## Release notes

What changed in each version is in the [release notes](./docs/release-notes.md).

## License

cudoc is released under the [MIT License](./LICENSE).
