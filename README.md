# cudoc

**English** | [한국어](./README.ko.md)

**Write a fact once. Reuse it everywhere. Keep one source of truth across every document, every site and every index.**

cudoc adds three things to the documentation you already have: Markdown syntax extensions, **document embedding**, and export of the same documents as a standalone HTML site, PDF and Word. It plugs into the site generator you already use, and authors keep writing ordinary Markdown.

**Set it up:** [Next.js](./docs/next.md) · [Docusaurus](./docs/docusaurus.md) · [Nextra](./docs/nextra.md) · [VitePress](./docs/vitepress.md) · [Eleventy](./docs/eleventy.md) · [no generator yet](./docs/export.md) · [what each host asks of you](#pick-your-site-generator)

That matters more than it used to, because your documentation now has two audiences: the people who read it, and the retrieval pipelines, agents and models that read it far more often.

---

## The problem: the same sentence in eleven places

Every documentation set has facts that belong in more than one page. A rate limit. A required permission. A supported version table. So they get copied. Then one copy changes and the other ten quietly become wrong.

**cudoc removes the copies.** A fact lives in exactly one document. Every other document points at it:

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

At build time cudoc pulls the real content in. Readers see a complete page. Authors maintain one paragraph.

---

## "Can't I just import a shared component?"

You can, and it does remove the copies. Every MDX host lets you write a partial and import it; the markdown-it hosts have include directives that do the same. If duplication were the only problem, that would be the end of it.

It is not the end of it, because an import and an embed produce different things.

An import is a **reference that stays a reference**. The page holds a component node; the text appears only once the host renders it, with that component registered.

```mdx
import Limits from "./_limits.mdx"

<Limits />
```

An embed is **resolved before anything renders**. At build time cudoc replaces the block with the real headings, paragraphs and tables from the source document, as ordinary document nodes.

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

That single difference decides the rest:

|                               | Shared component                                       | `cudoc-embed`                                                    |
| ----------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Unit of reuse                 | a whole file                                           | any section of a real page, by anchor, title or depth            |
| Where the fact lives          | a partial with no URL, no anchor, no place in the nav  | a published document readers can link to                         |
| Authoring                     | `.mdx`, plus an import line on every page that uses it | plain `.md`, nothing to import or register                       |
| Across hosts                  | each host spells it differently                        | the same block on all six                                        |
| Adapting a copy               | add props, or fork the partial                         | `replace` rewords this copy; the source is untouched             |
| Derived views                 | include only                                           | `render: { type: table }` builds a summary of headings           |
| Checking                      | the build fails, one at a time                         | `cudoc check` reports every broken source and anchor in one pass |
| What a non-host consumer gets | a component name it cannot render                      | the text                                                         |

### Reuse should not force you to fragment your documents

The partial approach makes the unit of reuse equal to the unit of file. To share one section, you cut it out into `_limits.mdx` and import it back into the page it came from. Do that a few times and your canonical text lives in fragments that no reader ever opens directly, while your real pages become assembly manifests.

cudoc leaves the document whole. `reference.md` stays a page with a URL, `#limits` stays an anchor someone can link to, and the reuse is expressed where the reuse happens. You do not have to predict the reuse boundary before you need it, and you do not have to restructure anything when it changes.

### And the copy is real text

This is what the next section rests on. A component node is opaque to anything that is not the host: standalone HTML export, an AST dataset, a retriever reading your corpus. cudoc's resolved output is the actual content, so every destination receives the same complete document. → [Document embedding](./docs/embedding.md)

---

## The second reader: your retrieval pipeline

Duplicated documentation used to cost you maintenance. Now it also **poisons your retrieval index**.

> **Build a RAG pipeline over duplicated docs and the eleven near-identical copies all become chunks.** A query retrieves several of them, spends your context window repeating one sentence, and dilutes the relevance score of the chunk that actually answers the question. Worse, when a fact is updated in one page and not the others, the index holds stale copies competing with the fresh one, and the model has no way to tell which is current.

Single-sourcing fixes that at the root. cudoc then gives the machine side four more things:

- **Resolved output, not a pointer.** Embeds are expanded at build time, so the HTML a crawler or retriever reads is whole. Authors maintain a reference; machines receive the full text. You do not choose between them.
- **Chunk by meaning, not by character count.** `cudoc dataset` exports compiled documents as AST JSON with a manifest, preserving heading hierarchy, anchors and section boundaries, so a chunk can be a section rather than a window that happens to land mid-sentence. One config line drops `code` blocks or internal-only components from what you index. → [AST datasets](./docs/dataset.md)
- **A corpus that holds each shared fact once.** The dataset keeps each document as collected: an embed stays the `cudoc-embed` block that names its source, not a second copy of the text, so a fact shared through embeds is indexed once, at the document that owns it. Every section is addressable down to `document#anchor`, so a tool that answers "what is the rate limit?" can return one section rather than a page, and cite the anchor it came from. The dataset filters; it does not look for duplicates, so text copied by hand stays copied.
- **Source a model can actually read.** Authors never import or register a component, so the `.md` file a model ingests is the same text a person reads. No JSX to strip, no runtime state that only exists after a render.

And when an agent writes the docs, `cudoc check --format json` hands back every broken link, anchor, image and embed in one machine-readable pass, so the loop closes without a human reading a build log. → [Reference checking](./docs/check.md)

One source of truth is the whole point. Everything below exists to make that practical.

---

## Pick your site generator

Each guide is a numbered walkthrough: install, configure, wire up collection, build. Every step is a copy-pasteable command or file, so you can work through one yourself or hand it to a coding agent and have it set the project up for you.

| Your site            | Guide                                       | Install                                         |
| -------------------- | ------------------------------------------- | ----------------------------------------------- |
| **Next.js**          | [Set up Next.js →](./docs/next.md)          | `@cudoment/cudoc cudoc-remark`                  |
| **Docusaurus**       | [Set up Docusaurus →](./docs/docusaurus.md) | `@cudoment/cudoc cudoc-remark cudoc-docusaurus` |
| **Nextra**           | [Set up Nextra →](./docs/nextra.md)         | `@cudoment/cudoc cudoc-remark cudoc-nextra`     |
| **VitePress**        | [Set up VitePress →](./docs/vitepress.md)   | `@cudoment/cudoc cudoc-vitepress`               |
| **Eleventy**         | [Set up Eleventy →](./docs/eleventy.md)     | `@cudoment/cudoc cudoc-eleventy`                |
| **No generator yet** | [Standalone HTML →](./docs/export.md)       | `@cudoment/cudoc cudoc-export`                  |

No generator yet? The last row starts from an empty directory: two commands and two documents give you a complete site. → [Your first site](./docs/export.md#your-first-site-from-an-empty-directory)

The install column lists cudoc's own packages; a guide's first step installs anything else its host needs. ESM, Node.js 20+. [Supported versions](./docs/README.md#supported-versions) lists the host releases every change is tested against.

What each host asks of your setup, before you choose (the same page gives the details):

- **Docusaurus.** Collection runs Docusaurus's own MDX processor from `@docusaurus/mdx-loader/lib/processor.js`, an internal module rather than a public API, so re-check it when you upgrade Docusaurus.
- **Nextra.** The site builds and serves with webpack rather than Turbopack, which cannot carry the plugin functions the adapter hands Nextra.
- **VitePress and Eleventy.** The plugin holds the library it loaded at startup, so restart the development server after collecting again.
- **VitePress.** VitePress 1 runs Vite 5, whose development server has published advisories no Vite 5 release fixes; they do not reach the built site.

Every host takes `.md`. The three MDX hosts also take `.mdx`, decided per file by its extension, and every cudoc feature behaves identically in both. → [Choosing `.md` or `.mdx`](./docs/README.md#choosing-md-or-mdx)

Standalone HTML, PDF and Word are not a seventh choice you make instead of the others. They are an **extra output** available from every host, reusing the same collected documents. → [Export alongside an existing site](./docs/export.md#export-alongside-an-existing-site)

---

## What you get

### Markdown that does more, without components

Authors never import or register a React component. It stays Markdown.

```md
## Requirements (#requirements) (@New)

> [!NOTE] Before you start
> Prepare your account and access token.

| Item   | What you need                                        |
| ------ | ---------------------------------------------------- |
| Access | - Account<br />-- Verified email<br />- Access token |
```

Explicit heading anchors, badges, callouts with real titles, and nested lists inside table cells. Each feature accepts cudoc syntax, your host's native syntax, or both — so you can adopt cudoc without rewriting a single existing page. → [Markdown syntax](./docs/syntax.md)

### Embedding that selects, not just includes

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

Run `cudoc collect --watch` beside your dev server. Saving a document collects it again in the time it takes to compile that one file: the documents whose text changed are compiled, the embeds that read one of them are resolved again, everything else is reused. On the MDX hosts the loader you registered tells the dev server that the pages embedding it changed, so the copy in the browser updates without a restart, and a document that fails to compile is a message in the terminal while the last good result stays in place.

```sh
cudoc collect --watch --config cudoc.config.mjs
```

VitePress and Eleventy load the library when their configuration is evaluated, so there the dev server is restarted after the change. → [Collection setup](./docs/embedding.md#set-up-collection), [Watching](./docs/api-reference/node.md#watching)

### One set of documents, three destinations

Your site, a shareable HTML bundle, and a machine-readable AST corpus — all from the same Markdown, all resolved the same way.

| Output             | Command              | Use it for                                                |
| ------------------ | -------------------- | --------------------------------------------------------- |
| Your existing site | your normal build    | production docs, for people                               |
| Standalone HTML    | `cudoc-export build` | offline handoff, air-gapped review, static deployment     |
| AST dataset        | `cudoc dataset`      | RAG pipelines, search indexes, MCP servers, agent context |

HTML export offers three hyperlink policies — local files, deployed URLs, or no links at all — so the same content works whether it is browsed from disk or published.

A complete sample is committed with the repository: a six-document API handbook exported from [one configuration](./examples/export/showcase.config.mjs) into a site, per-document files and a bound volume with a cover and a contents page. Open [the PDF](./examples/export/showcase-output/northlight-handbook.pdf) or [the Word file](./examples/export/showcase-output/northlight-handbook.docx) directly, and clone the repository to browse [the site](./examples/export/showcase-output/index.html) from disk; the [sources](./examples/export/showcase/) show the Markdown that produced them. → [A complete example](./docs/export.md#a-complete-example)

---

## Reference

Guides teach the workflow. The reference is where signatures, defaults and contracts live.

| Looking for                                                    | Go to                                               |
| -------------------------------------------------------------- | --------------------------------------------------- |
| Syntax modes, callout types, native forms, column layouts      | [Markdown syntax](./docs/syntax.md)                 |
| Collection setup, selection, replacement, refresh rules        | [Document embedding](./docs/embedding.md)           |
| Link policies, assets, configuration, deployment routes        | [Standalone HTML](./docs/export.md)                 |
| Broken links, anchors, images and embeds across a document set | [Reference checking](./docs/check.md)               |
| Projection options, manifest format, consumer contract         | [AST datasets](./docs/dataset.md)                   |
| Imports, signatures, option defaults, AST metadata, internals  | [API reference](./docs/api-reference/README.md)     |
| Which package does what, and what each one exports             | [Packages](./docs/api-reference/README.md#packages) |
| A real site you can run                                        | [Runnable examples](./examples/README.md)           |

---

## Contributing

```sh
npm ci
npm run build
npm test
```

`npm test` runs three tiers — package unit tests, the shared fixtures compiled by each example's real compiler, and assertions on built example sites. A tier whose prerequisite is missing skips with the command that satisfies it, and `CUDOC_STRICT=1` turns any skip into a failure. See [`tests/README.md`](./tests/README.md).

Host examples install separately with their own lockfiles. Update the affected guide and API reference in the same change as any API or workflow change.

## Release notes

What changed in each version is in the [release notes](./docs/release-notes.md).

## License

[MIT](./LICENSE)
