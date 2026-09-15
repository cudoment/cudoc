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

This collects documents and prepares embeds. Then build or start your host using the same source directory and syntax settings. Configure the [Next.js](./next.md), [Docusaurus](./docusaurus.md), [Nextra](./nextra.md), [VitePress](./vitepress.md) or [Eleventy](./eleventy.md) integration to consume the collected results. [Standalone HTML](./html.md) performs these steps inside its build command.

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

Two things it does not reach. A `cudoc-embed` block inside the section you are copying is resolved separately, so your rules do not apply to what that nested block pulls in. And a rule list is applied to every selected section, so a rule aimed at one section of a `depth: 2` selection simply finds nothing in the others. That is expected, not an error.

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

There is no automatic document-collection watcher. Add collection before both `dev` and `build` in your package scripts. Host-native collectors use `node collect.mjs` instead of the generic command. Keep generated `.cudoc/` output out of source control and regenerate it in CI.

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
