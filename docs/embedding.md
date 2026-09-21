# Document embedding

**English** | [한국어](./embedding.ko.md) · [All guides](./README.md)

An embed reuses collected content from another document. Authors write a `cudoc-embed` code block; the host integration inserts the rendered result. Syntax extensions can be used independently, but cross-document embedding requires persisted ASTs and source snapshots.

An embed is resolved into real document nodes at build time rather than left as a reference, which is what separates it from importing a shared partial. → [Why not a shared component?](../README.md#cant-i-just-import-a-shared-component)

## Set up collection

For plain Markdown, or Next.js using the standard cudoc pipeline, create `cudoc.config.mjs`:

```js
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "markdown", // Use "next" for the Next.js guide.
  syntax: {},
}
```

Run:

```sh
npx cudoc collect --config cudoc.config.mjs
```

This collects documents and prepares embeds. Then build or start your host using the same source directory and syntax settings. Configure the [Next.js](./next.md), [Docusaurus](./docusaurus.md), [Nextra](./nextra.md), [VitePress](./vitepress.md) or [Eleventy](./eleventy.md) integration to consume the collected results. [Standalone HTML](./export.md) performs these steps inside its build command.

Documents in several directories, each served under its own path, are collected with `roots` instead of `sourceRoot`; `exclude` leaves files such as `**/AGENTS.md` out, and `private` marks documents that are collected and checked but never exported. [Collection](./api-reference/node.md#collection) describes the options and how ids are derived.

```js
export default {
  roots: [
    { dir: "content", base: "docs" }, // content/ko/guide.md → /docs/ko/guide
    { dir: "glossary", base: "terms" },
  ],
  exclude: ["**/AGENTS.md", "docs/ko/drafts/**"],
  private: ["docs/in/**"],
  outDir: ".cudoc/documents",
  host: "markdown",
}
```

Docusaurus, Nextra, VitePress and Eleventy collection must use the actual configured host compiler. Their guides link to runnable collectors. A generic second parse cannot reproduce every native transform. If your Next.js setup adds custom plugins, use a matching compiler there too. Custom compilers require a `compilerId`, updated when compiler versions or relevant settings change.

## Reuse a section

In `docs/index.md`:

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

This includes the Limits heading, body and child sections. → [Why a code block, not a component?](#why-a-code-block-not-a-component) The section ends at the next heading of the same or shallower depth. Omit `#limits` to include the whole document; extensions are optional. Paths are relative to the embedding document. A leading `/` starts at `sourceRoot`, not the operating system root. Sources must be local collected documents.

To exclude child sections:

````md
```cudoc-embed
sources: [reference.md]
select:
  anchors: [limits]
  includeChildren: false
render: section
```
````

Selection supports `anchors`, exact `titles`, and `depth` as a number or array from 1 to 6. Specified filters are combined. Prefer explicit anchors when a title may change. Avoid selecting both parent and child sections unless repeating the child content is intended.

## Create a heading summary table

````md
```cudoc-embed
sources: [reference.md, advanced.md]
select:
  depth: 2
render:
  type: table
  columns: [title, link, summary]
```
````

Each selected heading produces a row. `title` is the visible title, `link` points to the original section, and `summary` is its first paragraph as plain text. Choose and order columns as needed. The default column order is `title`, `link`, `summary`.

### Define the columns yourself

A column written as a mapping says where its text comes from, what it links to and how wide it must stay. This turns one "Basic information" section per API into one row of an overview table:

````md
```cudoc-embed
sources: [/docs/rest-api.md]
select:
  depth: 5
  titles: [Basic information]
render:
  type: table
  columns:
    - { header: API, value: parent, link: parent, minWidth: 10rem }
    - header: Method
      value: { row: 1, column: 0, skipTablesWithHeaders: [Requirements] }
    - header: URL
      value: { row: 1, column: 1, skipTablesWithHeaders: [Requirements] }
    - { header: Description, value: summary }
    - { header: Reference, value: { extractor: sdkReference } }
```
````

| Key                                                      | Meaning                                                                                                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `header`                                                 | The header cell's text. Defaults to the value name.                                                                                                                                                                    |
| `value: title`                                           | The row section's heading text.                                                                                                                                                                                        |
| `value: summary`                                         | The section's first paragraph, as plain text.                                                                                                                                                                          |
| `value: parent`                                          | The text of the nearest heading above the section that is shallower than it: the API name above its "Basic information".                                                                                               |
| `value: { row, column, table?, skipTablesWithHeaders? }` | One cell of one table inside the section, counted from 0 with the header row as row 0. `table` picks among the section's tables in order, after leaving out any whose header row names one of `skipTablesWithHeaders`. |
| `value: { extractor }`                                   | A function registered under that name in the collection options; see below.                                                                                                                                            |
| `link`                                                   | `section` links the cell to the row's section, `parent` to the heading above it, `document` to the document. Omit it for plain text.                                                                                   |
| `minWidth`                                               | A CSS length such as `120px` or `10rem`, written onto the header cell as `min-width`. The HTML site honours it as a style, and the Word export keeps that column at least as wide.                                     |

The shorthand columns are the same as `{ value: title }`, `{ value: title, link: section }` and `{ value: summary }` with their names as headers.

When a fixed vocabulary is not enough, register a function in the collection options and name it from a column. It receives the row — the source document, the selected section, the heading above it and the section's address — and returns text, or text with a link:

```js
// cudoc.config.mjs
export default {
  sourceRoot: "docs",
  extractors: {
    sdkReference: {
      version: "2026-09-21", // change it when the function's output changes
      extract(row) {
        const language = row.document.id.split("/")[1]
        return {
          text: `${row.section.title} (${language})`,
          url: `/sdk/${language}/${row.section.anchorId}`,
        }
      },
    },
  },
}
```

`version` is part of the library configuration, so a changed extractor invalidates prepared embeds the way a changed compiler does. A column that finds nothing renders an empty cell; `cudoc check` reports each such cell as an `empty-embed-cell` warning saying what the column asked for and what the section has, for columns written as mappings. → [Reference checking](./check.md)

## Find and replace

````md
```cudoc-embed
sources: [reference.md#limits]
replace:
  - find: "**original**"
    replace: "_adapted_"
  - find: "v[0-9]+"
    replace: "current"
    regex: true
    flags: g
```
````

Rules run in order on the selected **original Markdown source**, including child sections by default. Literal rules replace every occurrence and are case-sensitive. Regex is opt-in; its default flags are `g`. Markdown formatting is preserved and the result is compiled with the source document's compiler settings. Source files and collected ASTs remain unchanged.

External reference definitions needed by the selected content remain available. The replacement target is the selected source range; appended definitions outside that range are not rewritten.

### Where replacement applies

Replacement happens on the source slice, before anything is selected out of the tree, so it applies to **every embed shape**: a section with or without its children, a whole document, several sources at once, and a selection by title or depth. It also reaches a `render: { type: table }` embed, where it changes the title and summary columns — but not the link, which still points at the source document's real anchor.

Two things it does not reach. A `cudoc-embed` block inside the section you are copying is resolved separately — nested embeds are expanded, with their own rules — so your rules do not apply to what that nested block pulls in. And a rule list is applied to every selected section, so a rule aimed at one section of a `depth: 2` selection simply finds nothing in the others. That is expected, not an error.

### Writing `find` safely

`find` is a YAML scalar, and YAML has opinions about unquoted text. **Quote it.** The failures below are silent or confusing otherwise:

| You write                  | What happens                                        |
| -------------------------- | --------------------------------------------------- |
| `find: "**bold**"`         | correct                                             |
| `find: **bold**`           | YAML error: `*` opens an alias                      |
| `find: limit # per minute` | **silently becomes `limit`** — `#` starts a comment |
| `find: Note: this`         | YAML error: a second colon                          |
| `find: @New`               | YAML error: `@` is reserved                         |

Regex patterns need one more step, because `\` is an escape character inside double quotes:

| You write      | Pattern received                              |
| -------------- | --------------------------------------------- |
| `find: "\d+"`  | YAML error: invalid escape sequence           |
| `find: "\\d+"` | `\d+`                                         |
| `find: '\d+'`  | `\d+` — single quotes take the text literally |

Prefer single quotes for anything with a backslash. A multi-line target works as a block scalar:

```yaml
- find: |-
    first line
    second line
  replace: "one line"
```

### When a rule finds nothing

Nothing fails. The embed renders the source's own wording in a place written to expect something else, and no build ever complains. [`cudoc check`](./check.md) reports it:

```
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies
        from reference, so nothing was changed. …
```

It reports a rule only when it matches **none** of the selected sections, so the per-section case above stays quiet.

## Why a code block, not a component

An embed could have been spelled `<Embed sources={...} />`. It is a fenced block because three things rule the component form out, and a fourth makes the block a better carrier anyway.

**`.md` has no components.** MDX disables JSX for `.md`, so `<Embed />` there is not an element — it parses as raw HTML inside a paragraph. Making embedding a component would mean every document that uses it has to become `.mdx`, which contradicts the one rule this project keeps everywhere: authors write Markdown and register nothing.

**Two of the six hosts have no MDX at all.** VitePress and Eleventy sit on markdown-it, which cannot parse JSX; collection refuses an `.mdx` file outright. A component syntax would either exclude them or need a different spelling per host — exactly the fragmentation that makes shared partials hard to move. A fenced block is one `code` node everywhere, and the whole pipeline finds it with a single predicate:

```js
node.type === "code" && node.lang === "cudoc-embed"
```

**The spec is read before anything renders.** `prepareEmbeds` walks the _stored_ ASTs at build time, long before React runs. As JSX props, `replace={[{ find: "a", replace: "b" }]}` is an attribute expression whose parsed form lives in `estree` — and collection strips `estree`, because a portable document AST should not carry a JavaScript syntax tree. What survives is the source text `[{ find: "a", replace: "b" }]`, so reading the spec back would mean re-parsing or evaluating JavaScript from inside a document. A code block's value is already a string, and YAML reads it.

**It degrades quietly everywhere else.** A parser that has never heard of cudoc sees a `code` node, renders a grey block, and writes the document back unchanged. GitHub shows it as-is. The component form in the same place is broken markup or literal text — and documents that travel are the premise of the whole feature. Source replacement relies on the same property: a fence survives being sliced out of the original Markdown and recompiled.

## Build and refresh

1. Collect all source documents.
2. Prepare embeds; `cudoc collect` includes this step.
3. Run the host build or start development.
4. Repeat collection and preparation after changing source documents, syntax, routes or compiler settings. Restart a running host if it retains a loaded library.

On an MDX host the embed plugin splices the prepared content into the page as it compiles, so the compiled page holds the library's content and a bundler will keep serving it until the page's own file changes. Register `cudoc-remark/loader` on the same files — the [Next.js](./next.md#step-5--add-the-embed-plugin), [Nextra](./nextra.md#step-4--add-the-embed-plugin) and [Docusaurus](./docusaurus.md#step-4--add-the-embed-plugin) guides show where — and a recollection reaches pages the dev server and the persistent build cache have already compiled. It leaves your files alone; what it adds to the compiled input is one reference definition that renders nothing.

Add collection before both `dev` and `build` in your package scripts, so a build never runs against a stale library. While you write, `cudoc collect --watch --config cudoc.config.mjs` beside the dev server collects again whenever a document under a root changes: only the documents whose text changed are compiled and only the embeds that read a changed document are resolved again, and a document that does not compile is a message rather than a broken library. Host-native collectors use `node collect.mjs` instead of the generic command; the same loop is available to them through [`watchDocuments`](./api-reference/node.md#watching). Keep generated `.cudoc/` output out of source control and regenerate it in CI.

Set `routeBase` to the host's document prefix, such as `/docs`. VitePress with `cleanUrls: false` needs `routeSuffix: ".html"`, and Eleventy's default directory URLs need `routeSuffix: "/"`. Supply `routes: { "guide/start": "/custom/start" }` for custom host routes or frontmatter slugs; those are not inferred automatically. This makes summary links and embedded document links target actual pages.

## Resolve problems

| Symptom                              | Action                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Prepared embeds missing or stale     | Collect and prepare again before running the host; check both output paths agree                  |
| Missing document or section          | Check relative paths, source-root coverage and explicit anchor IDs                                |
| Conflicting or duplicate IDs         | Give headings unique IDs; manual API consumers must use distinct prefixes for separate embeds     |
| Circular embed                       | Remove the document or section dependency cycle                                                   |
| No portable renderer for a component | Use Markdown, configure a static semantic mapping, or supply a renderer through the rendering API |
| Correct content but wrong links      | Match `routeBase`, `routeSuffix` and `routes` to the host's actual routing                        |

Embedding adjusts IDs and references to avoid collisions and rebases document links and images. See the [Node API reference](./api-reference/node.md) for programmatic collection, async compilers, storage and manual rendering.
