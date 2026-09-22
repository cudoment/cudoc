# cudoc

**English** | [한국어](./README.ko.md)

**Write a fact once. Reuse it everywhere. Keep one source of truth across every document, every site and every index.**

cudoc adds three things to the documentation you already have: Markdown syntax extensions, **document embedding**, and standalone HTML output. It plugs into the site generator you already use — Next.js, Docusaurus, Nextra, VitePress or Eleventy — and authors keep writing ordinary Markdown.

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
- **A corpus an MCP server can serve as-is.** Deduplicated, resolved, filtered and addressable down to `document#anchor` — the refinement an ingestion script usually has to do first. A tool that answers "what is the rate limit?" can return one section rather than a page, and cite the anchor it came from.
- **Source a model can actually read.** Authors never import or register a component, so the `.md` file a model ingests is the same text a person reads. No JSX to strip, no runtime state that only exists after a render.

And when an agent writes the docs, `cudoc check --format json` hands back every broken link, anchor, image and embed in one machine-readable pass, so the loop closes without a human reading a build log. → [Reference checking](./docs/check.md)

One source of truth is the whole point. Everything below exists to make that practical.

---

## Pick your site generator

Each guide is a numbered walkthrough: install, configure, wire up collection, build. Every step is a copy-pasteable command or file, so you can work through one yourself or hand it to a coding agent and have it set the project up for you.

| Your site            | Guide                                       | Install                                             |
| -------------------- | ------------------------------------------- | --------------------------------------------------- |
| **Next.js**          | [Set up Next.js →](./docs/next.md)          | `@cudoment/cudoc cudoc-remark`                      |
| **Docusaurus**       | [Set up Docusaurus →](./docs/docusaurus.md) | `@cudoment/cudoc cudoc-remark cudoc-docusaurus`     |
| **Nextra**           | [Set up Nextra →](./docs/nextra.md)         | `@cudoment/cudoc cudoc-remark cudoc-nextra`         |
| **VitePress**        | [Set up VitePress →](./docs/vitepress.md)   | `@cudoment/cudoc cudoc-markdown-it cudoc-vitepress` |
| **Eleventy**         | [Set up Eleventy →](./docs/eleventy.md)     | `@cudoment/cudoc cudoc-markdown-it cudoc-eleventy`  |
| **No generator yet** | [Standalone HTML →](./docs/export.md)       | `@cudoment/cudoc cudoc-export`                      |

No generator yet? The last row starts from an empty directory: two commands and two documents give you a complete site. → [Your first site](./docs/export.md#your-first-site-from-an-empty-directory)

The install column lists cudoc's own packages; each guide's first step adds the host's peers. ESM, Node.js 20+.

Every host takes `.md`. The three MDX hosts also take `.mdx`, decided per file by its extension, and every cudoc feature behaves identically in both. → [Choosing `.md` or `.mdx`](./docs/README.md#choosing-md-or-mdx)

Standalone HTML is not a seventh choice you make instead of the others. It is an **extra output** available from every host, reusing the same collected documents. → [Export alongside an existing site](./docs/export.md#export-alongside-an-existing-site)

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

`npm test` runs three tiers — package unit tests, the shared fixtures compiled by each example's real compiler, and assertions on built example sites. A tier whose prerequisite is missing skips with the command that satisfies it. See [`tests/README.md`](./tests/README.md).

Host examples install separately with their own lockfiles. Update the affected guide and API reference in the same change as any API or workflow change.

## Release notes

### 0.5.0

- PDF and Word output beside the HTML site, from one call and one set of design tokens.
- A `cudoc-pagebreak` fence forces a page break in the paginated formats and renders nothing on a site.
- Every document set also exports as one bound file, with cross-document links resolved inside it, opening with a cover and a contents page in both PDF and Word.
- One `page` setting gives PDF and Word the same paper, running header and footer, page breaks before headings, landscape pages for wide tables and printed link addresses.
- `annotations: true` ships a review-note runtime with the HTML site: whoever receives the files can select text or a block, leave notes and hand them back as a file or a share token, and `cudoc-export annotations` maps them to Markdown source lines in a facts-only report.
- `themeSwitch: true` adds a System / Light / Dark button to the HTML site's header, remembered per browser; without it the stylesheet keeps following the system setting with no script.
- On an MDX host an embedded section is spliced into the page as it compiles, so the components it contains render through the host's own component mapping and its code blocks reach the host's highlighter; the embed plugin no longer renders an HTML string, `cudoc-remark/runtime` is gone, and `cudoc-remark/loader` keeps a recollection visible to the dev server and the build cache. `cudoc check` reports a copied component whose import stays behind in its source file.
- A table embed can define its own columns: where each cell's text comes from (the section title, its first paragraph, the heading above it, a cell of a table inside it, or a function registered in the collection config), what it links to and how wide it must stay, and `cudoc check` reports every cell a defined column leaves empty.
- `roots: [{ dir, base }]` collects several directories into one library, each under its own URL prefix, so `/docs/…` and `/terms/…` links, embed sources and exports all mean the same document; `exclude` leaves non-documents out, `private` keeps in-house documents collected and checked but out of exports and datasets, and `externalPaths` tells the checker and the exporter which paths on your domain belong to another application.
- `tableColumnWidths` gives a table column a minimum width by its header text, per section or everywhere, so authored tables need no `<div style>` in their cells; the HTML site, the paginated formats and Word all honour it.
- `ignoreDiagnostics` silences a diagnostic code a project has decided to live with, and `loadLibrary(…, { cache: true })` lets a server reuse the loaded library between requests until the collection changes. What a consumer of the stored trees may rely on under `cudocAstVersion: 1` is now written down.
- `cudoc collect --watch` collects again whenever a document changes, compiling only the documents whose text changed and resolving only the embeds that read them; a `previous` library or preparation gives any collector the same saving, and a document that fails to compile is a message rather than a broken library.
- `cudoc-html` is now `cudoc-export`, which is what it builds.

### 0.4.0

- `cudoc check` finds every broken link, anchor, image and embed across a document set in one pass, from the CLI or as a function.
- Embed problems are reported instead of passing silently: an unrenderable component, a `replace` rule that matches nothing, an unknown key, a block that does not parse — each naming the document and the line.
- A duplicate heading ID is a diagnostic rather than a stop.
- Guides reorganized around choosing a host.

### 0.3.0

- Eleventy support, on a markdown-it layer now shared with VitePress.
- Standalone HTML and the host stylesheet rebuilt on redefinable tokens, with dark themes.

### 0.2.0

- Shared document normalization, section embedding and AST datasets.
- VitePress support, and standalone HTML export alongside any host.

### 0.1.0

- The shared AST core moved into `@cudoment/cudoc`, with browser-safe APIs beside the Node entry points.

## License

[MIT](./LICENSE)
