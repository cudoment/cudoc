# Document embedding

**English** | [한국어](./embedding.ko.md) · [All guides](./README.md)

An embed reuses a collected document or section in another page. This page covers collection, selection, summary tables, trees, replacement and refresh.

Authors write a `cudoc-embed` code block, and the host integration inserts the result. cudoc resolves the block into real document nodes at build time rather than leaving a reference, which is what separates an embed from an imported partial. → [Why not a shared component?](../README.md#cant-i-just-import-a-shared-component)

## Set up collection

Collection writes the persisted ASTs and source snapshots that cross-document embedding reads; syntax extensions alone need no collection. For plain Markdown, or for Next.js on the standard cudoc pipeline, create `cudoc.config.mjs`:

```js
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "markdown", // Use "next" for the Next.js guide.
  syntax: {},
}
```

Then collect; the command prepares the embeds as well:

```sh
npx cudoc collect --config cudoc.config.mjs
```

Build or start your host with the same source directory and syntax settings, configured to read the collected results; the [Next.js](./next.md), [Docusaurus](./docusaurus.md), [Nextra](./nextra.md), [VitePress](./vitepress.md) and [Eleventy](./eleventy.md) guides show how. [HTML export](./export.md) runs these steps inside its build command.

`roots` replaces `sourceRoot` for documents in several directories, each served under its own path. `exclude` leaves files such as `**/AGENTS.md` out, and `private` marks documents that are collected and checked but never exported. [Collection](./api-reference/node.md#collection) describes the options and how ids are derived.

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

Docusaurus, Nextra, VitePress and Eleventy collect with the host's own configured compiler, because a generic second parse cannot reproduce every native transform; each guide gives the collector for its host. A Next.js setup that adds custom plugins uses a matching compiler too. A custom compiler needs a `compilerId`, updated when the compiler version or a relevant setting changes.

## Reuse a section

In `docs/index.md`, one block names the section to copy:

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

The block brings in the Limits heading, its body and its child sections; the section ends at the next heading of the same or shallower depth. → [Why a code block, not a component?](#why-a-code-block-not-a-component)

Omit `#limits` to bring in the whole document; the extension is optional. A path is relative to the embedding document, a leading `/` starts at `sourceRoot` rather than the operating system root, and a source must be a local collected document.

To leave the child sections out, select the section with `includeChildren: false`:

````md
```cudoc-embed
sources: [reference.md]
select:
  anchors: [limits]
  includeChildren: false
render: section
```
````

`select` takes `anchors`, exact `titles` and `depth`, a number or an array from 1 to 6, and a section must pass every filter written. Prefer an anchor where a title may change, and do not select a parent and its child together unless the child's content is meant to repeat.

## Create a heading summary table

A table embed makes one row per selected heading; this one lists the `##` sections of two documents:

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

`title` is the visible title, `link` points to the original section, and `summary` is its first paragraph as plain text. Choose and order the columns as you need; the default order is `title`, `link`, `summary`.

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

| Key                                                      | Meaning                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `header`                                                 | The header cell's text. Defaults to the value name, and to an empty cell for a cell coordinate or an `{ extractor }` value.                                                                                                                                                                                                        |
| `value: title`                                           | The row section's heading text.                                                                                                                                                                                                                                                                                                    |
| `value: summary`                                         | The section's first paragraph, as plain text.                                                                                                                                                                                                                                                                                      |
| `value: parent`                                          | The text of the nearest heading above the section that is shallower than it: the API name above its "Basic information".                                                                                                                                                                                                           |
| `value: { row, column, table?, skipTablesWithHeaders? }` | One cell of one table inside the section, counted from 0 with the header row as row 0. `table` picks among the section's tables in order, after leaving out any whose header row names one of `skipTablesWithHeaders`. In a table with [merged cells](./syntax.md#merged-table-cells), a row counts only the cells it still holds. |
| `value: { extractor }`                                   | A function registered under that name in the collection options; see below.                                                                                                                                                                                                                                                        |
| `link`                                                   | `section` links the cell to the row's section, `parent` to the heading above it, `document` to the document. Omit it for plain text.                                                                                                                                                                                               |
| `minWidth`                                               | A CSS length such as `120px` or `10rem`, written onto the header cell as `min-width`. The HTML site honours it as a style, and the Word export keeps that column at least as wide.                                                                                                                                                 |

The shorthand columns are the same as `{ value: title }`, `{ value: title, link: section }` and `{ value: summary }` with their names as headers.

An extractor covers what the fixed vocabulary cannot: register a function in the collection options and name it from a column. It receives the row (the source document, the selected section, the heading above it and the section's address) and returns text, or text with a link:

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

`version` is part of the library configuration, so a changed extractor invalidates prepared embeds as a changed compiler does. A column that finds nothing renders an empty cell, and for a column written as a mapping `cudoc check` reports each such cell as an `empty-embed-cell` warning that says what the column asked for and what the section has. → [Reference checking](./check.md)

## Draw a tree of documents

A tree lists documents the way their folders nest them, one line per document, and folds the levels below `open` until a reader opens them. It needs nothing beyond the collection every embed uses: write the block, collect, build. Its look comes from `@cudoment/cudoc/styles.css`, which every host guide imports; without it, a host draws each folded level the way it draws an authored `details`, which on Docusaurus and Nextra is a box.

### A first tree

Take a set of guides, each file a `#` title and a one-sentence summary:

```text
docs/
├── index.md
├── reference.md          # API reference, with ## and ### sections
└── guides/
    └── payments/
        ├── index.md          # Payments: the page that gets the tree
        ├── overview.md       # Overview
        ├── checkout.md       # Checkout
        ├── checkout/
        │   ├── cards.md      # Cards
        │   └── wallets.md    # Wallets
        └── refunds/
            ├── index.md      # Refunds
            └── partial.md    # Partial refunds
```

In `docs/guides/payments/index.md`:

````md
```cudoc-embed
sources: [./]
render:
  type: tree
  order: [Overview, ...]
```
````

The page then shows this, each title linked to its document. Here ▾ marks a line that starts unfolded, ▸ one that starts folded, and • one with nothing below it:

```text
• Overview · Where to start.
▾ Checkout · Take a payment.
    • Cards · Card payments.
    • Wallets · Wallet payments.
▾ Refunds · Give money back.
    • Partial refunds · Refund part of a payment.
```

`./` is the folder the page is in, and the page itself, its `index.md`, stands for the folder rather than taking a line. `checkout.md` takes the folder `checkout/` beside it, and `refunds/index.md` stands for its own folder. A page that stands for a folder beside it, such as `checkout.md`, names that folder instead, `sources: [checkout/]`: its own `./` is the folder it sits in and would list Checkout among its siblings.

`order` puts Overview first, and the rest follow by title. A line with lines below it folds them in an HTML `details` element, so the tree opens and closes without a script on every host and in exported HTML. The print HTML, the PDF and Word have nothing to fold and write the tree out as a nested list.

### Four common trees

**An overview page for a set of documents** is the tree above: `sources: [./]` in a folder's `index.md`.

**A collapsible outline of a long reference** lists the document's own sections under it. In `docs/index.md`, beside `reference.md`, `headings: 2` takes its `##` and `###` headings, and `open: 2` starts both levels unfolded:

````md
```cudoc-embed
sources: [reference.md]
render:
  type: tree
  headings: 2
  open: 2
```
````

```text
▾ API reference · Every endpoint, its limits and how to call it.
    ▾ Limits · How many calls you may make.
        • Rate limits · Calls per minute.
        • Quotas · Calls per day.
    ▾ Authentication · How to sign a call.
        • Tokens · Where a token comes from.
```

**The outline of one section** starts from an anchor. `headings` counts from `##` whatever the section's own level, so a `##` section needs `headings: 2` to bring its `###` headings:

````md
```cudoc-embed
sources: [reference.md#limits]
render:
  type: tree
  headings: 2
```
````

```text
▾ Limits · How many calls you may make.
    • Rate limits · Calls per minute.
    • Quotas · Calls per day.
```

**A map of every document** starts from the top of the library. `depth: 2` keeps two levels, `open: 0` starts them folded, and `columns: [link]` shows titles only:

````md
```cudoc-embed
sources: [/]
render:
  type: tree
  depth: 2
  open: 0
  columns: [link]
```
````

```text
• API reference
▸ Payments
```

Payments unfolds to Checkout, Overview and Refunds; Cards, Wallets and Partial refunds are a third level, past `depth`. `guides/` adds no level of its own, because no document stands for it.

### Which document goes under which

Five rules decide where a document or a section appears in a tree.

- A source ending in `/` is a folder, and the documents directly below it make the first level. Any other source is a document, or with `#anchor` one of its sections, and is a first-level line itself. A source resolves as every embed source does, relative to the embedding document or from the top of the library with a leading `/`, and several sources make one first level in the order written.
- The documents under `X.md` are the ones in the folder `X/` beside it. This is how an outliner keeps one page per file, where no page can be called `index`.
- Where there is no `X.md`, the folder's own `X/index.md` stands for it, as a static site generator reads it, and the folder's other documents go under that one. A folder source starts below it.
- A folder that nothing stands for passes its documents up to the nearest folder that has such a document, so a category folder such as `projects/` adds no level.
- With `headings`, a document's sections go under it, before the documents below it. The `#` title names the document's own line.

### Options

`render` takes these keys beside `type: tree`:

| Key        | Meaning                                                                                                                                                       | Default             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `open`     | Levels whose lines start unfolded on the web: `0` shows the first level only, `1` the first two                                                               | `1`                 |
| `print`    | Levels the print HTML, the PDF and Word show                                                                                                                  | every level         |
| `depth`    | Levels the tree holds, heading lines counted with document lines                                                                                              | every level         |
| `headings` | Heading levels under each document's title that become its lines: `1` takes `##`, `2` takes `##` and `###`, up to `5`                                         | `0`, documents only |
| `order`    | Names the first level puts first, in order. `...` stands for every name not listed; without it, the rest follow the names listed                              | by title            |
| `columns`  | What a line shows, in the vocabulary of [table columns](#define-the-columns-yourself), extractors included. The values that are not empty are joined with `·` | `[link, summary]`   |

### What a line shows

A document's title is its `#` title, else its `title` front matter, else its file name, or its folder's name for an `index.md`. A section's title is its heading's text.

`summary` is read as in a summary table: the first paragraph after the title. A property line above the `#` title, as an outliner writes one, is not it. When a title has no paragraph of its own before the next heading, the first paragraph after it is a subsection's, so the line repeats the summary of the line below it. Give the section an opening sentence, or show titles alone with `columns: [link]`.

`columns` takes the table's vocabulary: `[link]` for titles alone, `[title, summary]` for titles that link nowhere, `{ value: { row, column } }` for a value out of a table in the section, and [an extractor](#totals-from-the-levels-below) for anything else. A column whose value is empty is left out of the line, and a line whose every column is empty shows its title.

`select` and `replace` do not apply, because a tree copies no section text.

### The order of lines

The first level follows `sources` in the order written, the documents a folder source brings sorted among themselves; every level below is sorted, while a section keeps its place in its document. Documents are sorted by title, ignoring letter case and reading a number by its value, and come out the same on every machine.

`order` then moves the first level. An entry matches a document's file name without the extension, the folder's name for an `index.md`, or a line's title, exactly and with letter case, unlike the sorting. Names are compared in Unicode NFC, so a file name that a sync tool stored in NFD, as Syncthing does on macOS, matches the composed spelling you type. `...` needs no quotes, in a list written either way, but a name holding `: ` or ` #` does, since YAML reads those as a mapping and a comment. A name holding a comma, `[`, `]`, `{` or `}` needs them too, in a list written in brackets:

```yaml
order: ["Step 1: Install", "Install, configure and run", ..., Changelog]
```

### Private documents

A public page's tree leaves out a `private` document that a folder or a parent would bring in, together with the lines below it, because an export writes no private document and could not link to it. A private page lists them. A source that names a private document lists it anyway, and its line links to it as an authored link would: the export refuses it under `relative` and points it at the deployed page under `host`. → [Choose hyperlink behavior](./export.md#choose-hyperlink-behavior)

A folder whose documents a public page would all leave out fails, and an `order` entry naming a document left out matches nothing. `exclude` keeps a file out of the library, and so out of every tree.

### Totals from the levels below

In a tree an extractor runs for every line, deepest first, and its context carries the line as `node`, with the lines below it complete. This counts the open tasks of a document and of everything below it:

```js
// cudoc.config.mjs
const open = (text) => (text.match(/^- TODO /gm) ?? []).length

export default {
  sourceRoot: "notes",
  extractors: {
    openTasks: {
      version: "1",
      extract(row, { library, node }) {
        const total = (line) =>
          open(
            library.documents.find((d) => d.id === line.documentId).source.text,
          ) + line.children.reduce((sum, child) => sum + total(child), 0)
        const count = node ? total(node) : open(row.document.source.text)
        return count ? `${count} open` : undefined
      },
    },
  },
}
```

````md
```cudoc-embed
sources: [/projects/]
render:
  type: tree
  columns: [link, { value: { extractor: openTasks } }, summary]
```
````

A total stops at `depth`, since the lines below it are not in the tree. The cells of the lines below are filled in by the time a line's extractor runs, so an extractor can also add up the values its children show.

### Checking and refreshing a tree

`cudoc check` reports a source or an anchor that names nothing as it does for every embed, an extractor the configuration does not register as `invalid-embed-spec`, and an `order` entry that names no first-level line as an `unmatched-tree-order` warning. → [Reference checking](./check.md)

A prepared tree depends on every document a line was read from, so editing a document below it resolves it again on the next collection, `cudoc collect --watch` included. A document added or removed resolves every embed again, so a new file joins the trees it belongs to on the next pass.

A program that writes the tree in a form of its own, such as an outliner's blocks, reads the same lines through [`resolveTree`](./api-reference/node.md#tree-data).

## Find and replace

`replace` rewords the copy with rules that run on the source; this block replaces one literal and one pattern:

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

The rules run in order on the selected original Markdown source, child sections included by default. A literal rule replaces every occurrence and is case-sensitive; a regex rule is opt-in with `regex: true`, and its default flags are `g`. cudoc keeps the Markdown formatting, compiles the result with the source document's compiler settings, and leaves the source file and the collected AST unchanged.

The reference definitions the selected content needs stay available. The rules rewrite the selected source range only; the definitions appended from outside that range are not rewritten.

### Where replacement applies

Replacement applies to every embed shape that copies section text, because it runs on the source slice before anything is selected out of the tree. That covers a section with or without its children, a whole document, several sources at once, and a selection by title or depth. In a `render: { type: table }` embed it changes the title and summary columns, not the link, which still points at the source document's real anchor. A tree copies no section text, so it refuses `replace`. → [What a line shows](#what-a-line-shows)

Two things it does not reach. A `cudoc-embed` block inside the copied section is resolved separately, with its own rules, so the outer rules do not apply to what that nested block pulls in. And a rule list applies to every selected section, so a rule aimed at one section of a `depth: 2` selection finds nothing in the others, which is expected rather than an error.

A section whose heading sits inside another block is rewritten from its text as it reads on its own. In a list item, however deep, the item's marker and indentation come off that text, as the parser took them off the item's content, so the section is rewritten as usual. A top-level section that holds a quote or a list is rewritten as usual too.

Where something of the block would stay in the text, every rule is refused, matching or not. That happens when the heading's line has a quote's or a callout's `>` before it, or when the heading is in a footnote. It also happens when the section is the last one in a component or a `:::` container and its text runs into the block's closing line.

The build then fails with ``cudoc: <document>#<id> starts inside a quote, and the `>` marks stay on the lines after its heading, so a replace rule cannot rewrite it; …``, `cudoc check` reports it as `unreplaceable-embed-section`, and one refused section stops a `select` embed that picks it too. Move the heading out of that block, end the section with another heading before the block closes, or embed it without `replace`, which copies the section as collected.

### Writing `find` safely

In a section inside a list item, `find` sees the section as it reads on its own, with the item's marker and indentation taken off, so write a rule against the line without them: `Alpha` rather than `  Alpha`.

Quote `find`: it is a YAML scalar, and unquoted text fails silently or confusingly:

| You write                  | What happens                                       |
| -------------------------- | -------------------------------------------------- |
| `find: "**bold**"`         | correct                                            |
| `find: **bold**`           | YAML error: `*` opens an alias                     |
| `find: limit # per minute` | **silently becomes `limit`**: `#` starts a comment |
| `find: Note: this`         | YAML error: a second colon                         |
| `find: @New`               | YAML error: `@` is reserved                        |

Regex patterns need one more step, because `\` is an escape character inside double quotes:

| You write      | Pattern received                             |
| -------------- | -------------------------------------------- |
| `find: "\d+"`  | YAML error: invalid escape sequence          |
| `find: "\\d+"` | `\d+`                                        |
| `find: '\d+'`  | `\d+`: single quotes take the text literally |

Prefer single quotes for anything with a backslash. A multi-line target works as a block scalar:

```yaml
- find: |-
    first line
    second line
  replace: "one line"
```

### When a rule finds nothing

A rule that finds nothing fails nothing: the embed renders the source's own wording in a place written to expect something else, and no build complains. [`cudoc check`](./check.md) reports it:

```
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies
        from reference, so nothing was changed. …
```

It reports a rule only when it matches none of the selected sections, so the per-section case above stays quiet.

## Why a code block, not a component

An embed is a fenced block rather than `<Embed sources={...} />` because three things rule the component form out, and a fourth makes the block a better carrier anyway.

**`.md` has no components.** MDX disables JSX for `.md`, so `<Embed />` there is not an element but raw HTML inside a paragraph. A component form would turn every document that uses it into `.mdx`, against the one rule this project keeps everywhere: authors write Markdown and register nothing.

**Two of the six hosts have no MDX at all.** VitePress and Eleventy sit on markdown-it, which cannot parse JSX; collection refuses an `.mdx` file outright. A component syntax would either exclude them or need a different spelling per host, the fragmentation that makes shared partials hard to move. A fenced block is one `code` node everywhere, and the whole pipeline finds it with a single predicate:

```js
node.type === "code" && node.lang === "cudoc-embed"
```

**The spec is read before anything renders.** `prepareEmbeds` walks the stored ASTs at build time, long before React runs. As JSX props, `replace={[{ find: "a", replace: "b" }]}` is an attribute expression whose parsed form lives in `estree`, and collection strips `estree`, because a portable document AST should not carry a JavaScript syntax tree. What survives is the source text `[{ find: "a", replace: "b" }]`, so reading the spec back would mean re-parsing or evaluating JavaScript from inside a document. A code block's value is already a string, and YAML reads it.

**It degrades quietly everywhere else.** A parser that has never heard of cudoc sees a `code` node, renders a grey block, and writes the document back unchanged. GitHub shows it as-is. The component form in the same place is broken markup or literal text, and documents that travel are the premise of the whole feature. Source replacement relies on the same property: a fence survives being sliced out of the original Markdown and recompiled.

## Build and refresh

A build takes four steps, and the fourth says when the first two run again:

1. Collect all source documents.
2. Prepare embeds; `cudoc collect` includes this step and publishes the library and its embeds together, so a collection that fails leaves the previous output as it was.
3. Run the host build or start development.
4. Repeat collection and preparation after changing source documents, syntax, routes or compiler settings. Restart a running host if it retains a loaded library.

On an MDX host, register `cudoc-remark/loader` on the same files as the embed plugin, so that a recollection reaches pages the dev server and the persistent build cache have already compiled. The plugin splices the prepared content into the page as it compiles, and a bundler keeps serving that compiled page until the page's own file changes. The [Next.js](./next.md#step-5--add-the-embed-plugin-and-the-library-loader), [Nextra](./nextra.md#step-4--add-the-embed-plugin-and-the-library-loader) and [Docusaurus](./docusaurus.md#step-4--add-the-embed-plugin-and-the-library-loader) guides show where.

The loader leaves your files alone; what it adds to the compiled input is one reference definition that renders nothing.

Add collection before both `dev` and `build` in your package scripts, so a build never runs against a stale library, and keep the generated `.cudoc/` output out of source control and regenerate it in CI.

While you write, `cudoc collect --watch --config cudoc.config.mjs` beside the dev server collects again whenever a document under a root changes. Only the documents whose text changed are compiled, and only the embeds that read a changed document are resolved again. A document that does not compile, or an embed that does not resolve, is a message while the last good library and its embeds stay in place. A host-native collector runs as `node collect.mjs` instead of the generic command and gets the same loop through [`watchDocuments`](./api-reference/node.md#watching).

Route settings make summary links and embedded document links target actual pages. Set `routeBase` to the host's document prefix, such as `/docs`; VitePress with `cleanUrls: false` needs `routeSuffix: ".html"`, and Eleventy's default directory URLs need `routeSuffix: "/"`. Custom host routes and front matter slugs are not inferred: supply them as `routes: { "guide/start": "/custom/start" }`.

## Resolve problems

The table pairs each symptom with the action that resolves it:

| Symptom                                | Action                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared embeds missing or stale       | Collect and prepare again before running the host; check both output paths agree                                                                                        |
| Missing document or section            | Check relative paths, source-root coverage and explicit anchor IDs                                                                                                      |
| Conflicting or duplicate IDs           | Give headings unique IDs; manual API consumers must use distinct prefixes for separate embeds                                                                           |
| Circular embed                         | Remove the cycle the message names (`cudoc: cyclic embed: a#* -> b#limits -> a#*`)                                                                                      |
| No portable renderer for a component   | Use Markdown, configure a static semantic mapping, or supply a renderer through the rendering API                                                                       |
| Correct content but wrong links        | Match `routeBase`, `routeSuffix` and `routes` to the host's actual routing                                                                                              |
| `no documents in folder …`             | The folder holds no document besides the page that stands for it: add documents, or check the path and `exclude`                                                        |
| `… a folder source ends with /`        | The source names a folder without its slash; write `guides/` to list what is in it                                                                                      |
| `… holds only private documents …`     | A public page lists no private document; write the tree on a private page or name the document                                                                          |
| A tree drawn as boxes                  | Import `@cudoment/cudoc/styles.css` as the host guide shows                                                                                                             |
| A line repeats the summary below it    | Give the section a paragraph before its first subheading, or use `columns: [link]`                                                                                      |
| `unmatched-tree-order`                 | Write the entry as the file name or the title the line shows, letter case included; in a list written in brackets, quote a name holding a comma, which splits it in two |
| `render.order must be a list of names` | Quote a name holding `: `                                                                                                                                               |

Embedding adjusts IDs and references to avoid collisions and rebases document links and images. A link inside the copied section that names only a fragment or a query, such as `#setup` or `?tab=2`, keeps meaning the document it was written in. It points into the copy when the copy carries that anchor, and at the source document otherwise. The [Node API reference](./api-reference/node.md) covers programmatic collection, async compilers, storage and manual rendering.
