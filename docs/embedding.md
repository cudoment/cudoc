# Document embedding

**English** | [한국어](./embedding.ko.md) · [All guides](./README.md)

An embed reuses collected content from another document. Authors write a `cudoc-embed` code block; the host integration inserts the rendered result. Syntax extensions can be used independently, but cross-document embedding requires persisted ASTs and source snapshots.

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

This collects documents and prepares embeds. Then build or start your host using the same source directory and syntax settings. Configure the [Next.js](./next-mdx.md), [Docusaurus](./docusaurus.md), [Nextra](./nextra.md) or [VitePress](./vitepress.md) integration to consume the collected results. [Standalone HTML](./html.md) performs these steps inside its build command.

Docusaurus, Nextra and VitePress collection must use the actual configured host compiler. Their guides link to runnable collectors. A generic second parse cannot reproduce every native transform. If your Next.js setup adds custom plugins, use a matching compiler there too. Custom compilers require a `compilerId`, updated when compiler versions or relevant settings change.

## Reuse a section

In `docs/index.md`:

````md
```cudoc-embed
sources: [reference.md#limits]
```
````

This includes the Limits heading, body and child sections. The section ends at the next heading of the same or shallower depth. Omit `#limits` to include the whole document; extensions are optional. Paths are relative to the embedding document. A leading `/` starts at `sourceRoot`, not the operating system root. Sources must be local collected documents.

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

Rules run in order on the selected **original Markdown source**, including child sections by default. Literal rules replace every occurrence. Regex is opt-in; its default flags are `g`. Markdown formatting is preserved and the result is compiled with the source document's compiler settings. Source files and collected ASTs remain unchanged.

External reference definitions needed by the selected content remain available. The replacement target is the selected source range; appended definitions outside that range are not rewritten.

## Build and refresh

1. Collect all source documents.
2. Prepare embeds; `cudoc collect` includes this step.
3. Run the host build or start development.
4. Repeat collection and preparation after changing source documents, syntax, routes or compiler settings. Restart a running host if it retains a loaded library.

There is no automatic document-collection watcher. Add collection before both `dev` and `build` in your package scripts. Host-native collectors use `node collect.mjs` instead of the generic command. Keep generated `.cudoc/` output out of source control and regenerate it in CI.

Set `routeBase` to the host's document prefix, such as `/docs`. VitePress with `cleanUrls: false` needs `routeSuffix: ".html"`. Supply `routes: { "guide/start": "/custom/start" }` for custom host routes or frontmatter slugs; those are not inferred automatically. This makes summary links and embedded document links target actual pages.

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
