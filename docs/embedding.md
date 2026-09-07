# Embedding a document in another

**English** | [한국어](./embedding.ko.md)

Rendering a piece of one document inside another, from the AST cudoc exported rather than from a copy someone maintains by hand.

This is the half of AST export that makes the other half worth doing. A page that says "here is what the rate limit section says" is either repeating that section — and drifting from it — or reading it. Reading it is what this describes.

## The shape of it

Four steps; cudoc covers the first three:

1. **Export** the AST while the document compiles, with `cudoc/embed`.
2. **Load** the stored tree, with `loadAst`.
3. **Locate** the piece you want, with `cudoc/query`.
4. **Render** it however the embedding page renders things.

Step four stays with you on purpose. An embed is rarely "print this section verbatim" — it is a card, a summary row, a parameter table styled like the rest of your site. cudoc hands you the nodes; what they become is a decision about your documentation set.

A working version is [`examples/next-mdx/app/embed`](../examples/next-mdx/app/embed).

## Export, then load

Add the export plugin last, so the tree it writes is the one every other transform has finished with:

```js
// next.config.mjs, or wherever the plugins are configured
remarkPlugins: [
  ["remark-gfm"],
  ["cudoc-remark", cudocOptions],
  ["cudoc/embed", { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

```js
import { loadAst } from "cudoc/embed"

const document = loadAst("guide/limits", { outDir: ".cudoc/ast" })
```

The two take the same `outDir`, and the path given to `loadAst` is the document's path relative to `sourceRoot` — so `docs/guide/limits.mdx` is written to `.cudoc/ast/guide/limits.json` and loaded as `"guide/limits"`.

`loadAst` reads the file system, so it belongs somewhere that runs on the server: a React server component, a build script, `getStaticProps`.

When the reader already knows the file path, `cudoc/node/load-ast-file` is the narrower entry:

```js
import path from "node:path"
import { loadAstFile } from "cudoc/node/load-ast-file"

const document = loadAstFile(
  path.join(process.cwd(), ".cudoc/ast/guide/limits.json"),
)
```

It validates the same way but leaves the build-time path mapping out of the reader's module graph, which keeps a bundler from tracing more of the project than the page actually reads.

### The build has to compile the document first

A remark plugin runs only when MDX is actually compiled, so the JSON exists only after the document has been built at least once. If nothing in your site imports or routes a document, it never compiles and its AST is never written.

The build must finish exporting the source before an embed reads it. In development, opening the embed first may not compile its source route. If you keep the compiler cache between builds, keep `.cudoc/ast` with it: deleting only the JSON does not force cached MDX to compile again. Regenerate both together, and include the JSON in deployments that read it at runtime.

The export is a snapshot at the plugin's position in the remark pipeline. The adapter examples export before host transforms; host-generated IDs, resolved assets and executed component output may therefore differ. Use stable explicit IDs for embeds. On Nextra, use unique lowercase slug IDs because the host slugifies them again. No JavaScript expressions are evaluated by the query helpers.

## Locate what you want

### A section, by its anchor

```js
import { sliceSectionByAnchorId } from "cudoc/query"

const section = sliceSectionByAnchorId(document, "rate-limits")
```

The result is a tree of its own: the heading and everything under it, up to the next heading of the same depth or shallower. The root's `data` is carried across, so the schema version travels with the slice and the result can still be validated.

Referenced link, image and footnote definitions are also retained, even when declared outside the section. Set `includeDefinitions: false` for a strict sibling slice. Nodes are shared with the original tree; clone them before mutating an embed.

An anchor id is the right key. A heading's text changes; the id an author wrote does not, which is the reason cudoc has explicit anchors at all. `#rate-limits` and `rate%20limits` are both accepted, so an id taken straight from a link works.

Nothing is found when no heading carries the id, and it returns `undefined` rather than throwing — a broken embed reference is a real situation, and what to do about it (fall back, warn, fail the build) is yours to decide.

For a deep section that means nothing alone — a "Requirements" heading under an API name — ask for the heading above it:

```js
sliceSectionByAnchorId(document, "create-user-requirements", {
  contextHeadingFromDepth: 5,
})
```

### A node near another node

```js
import { findSectionEnd, findSiblingNode } from "cudoc/query"

const table = findSiblingNode(parent, index, {
  direction: "after",
  type: "table",
  boundary: findSectionEnd(parent, index, heading.depth),
})
```

`boundary` is the part that matters. Without it, "the table after this heading" quietly becomes "the next table anywhere in the document", and a section with no table of its own silently borrows the following section's — which is the kind of bug that ships, because the page renders and the data is merely wrong.

### Text, including blocks

```js
import { getNodeText } from "cudoc/query"

getNodeText(section.children)
```

Unlike `getInlineText`, this descends into blocks and separates them, so a heading does not run into the paragraph beneath it. It reads through elements it does not recognize by default, because a stored tree is full of a host's own JSX and dropping their text loses content silently. Pass `includeUnknown: false` when you want only the prose.

Code blocks are included. Whole table rows separate cells with tabs; `tableCellSeparator` changes that separator. Expressions, imports and exports are not visible text and are ignored.

### A heading's badge

```js
import { getHeadingBadge } from "cudoc/query"

getHeadingBadge(heading) // "REST API"
```

A badge is an attribute on the anchor element, not part of the heading's children, so collecting the heading's text does not find it. That is what you want for a title and never what you want when the badge is the point.

### Table cells

```js
import {
  findTableColumnIndex,
  getTableCellText,
  getTableHeaderTexts,
} from "cudoc/query"

getTableHeaderTexts(table) // ["Parameter", "Required", "Description"]
findTableColumnIndex(table, ["Required"]) // 1
getTableCellText(table, [
  [1, 0],
  [1, 1],
]) // ["user_id", "Yes"]
```

Addressing cells by row and column is blunt, but a Markdown table has no field names to offer instead. Finding the column by its header first is the way to keep an embed from breaking when someone reorders the columns.

A missing cell yields `undefined` rather than throwing: a table one column short is a document problem, and the caller is what can decide whether to warn or fail.

These helpers read mdast tables, cudoc's list-containing cells included. A table rewritten by a `tableColumnLayout` rule is JSX by then, so read that component structure instead. Export and load both validate the lists inside `td`, `th` and `TableCell` cells by default; if a rule names its own cell component, pass the same `tableCellElement: ["CustomCell"]` to both.

## Migrating an existing Next.js pipeline

Replacing a Next.js site's own remark plugins with cudoc goes best when nothing downstream has to change at the same time: the first version reproduces what the site already produces, byte for byte, and only then does anything move.

That usually means pinning four things to the values the site already uses.

```js
const cudocOptions = {
  // Preserve the existing Next.js pipeline's table of contents export.
  toc: true,
  tableColumnLayout: [
    {
      section: { depth: 5, titles: ["Requirements"] },
      columnHeaders: ["Prerequisites"],
      split: { minItems: 4, columns: 2 },
      // Only if the site renders its tables as components. The defaults are
      // the HTML tag names, which need nothing provided.
      components: {
        table: "Table",
        header: "TableHeader",
        body: "TableBody",
        row: "TableRow",
        head: "TableHead",
        cell: "TableCell",
      },
    },
  ],
}

const astOptions = {
  sourceRoot: "docs",
  // Where the site already writes its JSON, and the field its readers check.
  outDir: "src/data/documents",
  version: { field: "documentAstVersion", value: 2 },
}

const remarkPlugins = [
  ["remark-gfm"],
  ["cudoc-remark", cudocOptions],
  ["cudoc/embed", astOptions],
  // Anything the site ran after its own plugins stays after cudoc's.
]
```

`titles` and `columnHeaders` each take several strings, so one rule can cover a documentation set published in more than one language.

Keep the site's components as they are. If its `Anchor` already renders the id itself, adding `heading-ids` would put the same id on the heading too — change one or the other, not neither.

An id promoted onto the heading is the newer arrangement and the better one, but it is a change in rendered output, so make it deliberately rather than as a side effect of the migration.

### What a wrapper still has to cover

Some of what a site's own helpers did is policy rather than mechanism, and cudoc deliberately does not decide it:

- **A missing anchor.** `sliceSectionByAnchorId` returns `undefined`; whether that warns, falls back or fails the build is the site's call.
- **Inline-only cells.** `getTableCellNodes` returns lists as readily as phrasing content. A site that requires a cell to be inline has to check for itself.
- **Fragment links.** Rebasing `#anchor` onto the source document's URL depends on how the site routes documents.
- **Section context.** Whether a deep section carries the heading above it, and from which depth, is a convention. `contextHeadingFromDepth` takes the depth; choosing it is yours.

Keeping the old function names as thin wrappers around cudoc is the cheapest way through: the call sites and their tests stay untouched while the implementation underneath changes.

### Comparing before and after

Build once with the old implementation, keep the output, then build again with cudoc and compare. Both halves are worth comparing — the stored JSON _and_ the compiled MDX, including the table of contents export — because a transform can be right about the tree it stores and wrong about what the page renders.

## What cudoc deliberately does not do

**Render the nodes.** There is no `<Ast nodes={...} />`. An embed's value is that it looks like the page it is on, and a generic renderer would fight that. Walk the nodes and emit your own components, or convert with `mdast-util-to-hast` if you want the whole subtree.

**Know what your sections mean.** There is no "find the parameters table" or "read the endpoint". Those are conventions of a particular documentation set — which heading introduces what, which column holds which thing — and encoding them in a shared package would make it wrong for everyone else. Build them on top of the primitives above.

## Keeping embeds honest

Two failures are worth guarding against, because neither one makes a build fail on its own.

**A stale export.** If a build reuses a compilation cache, the page and the exported AST can both stay on the previous version of a document. Editing a document and rebuilding should change both; [`scripts/check-rebuild.mjs`](../scripts/check-rebuild.mjs) in this repository is one way to check it.

**A silently wrong reference.** An anchor that no longer exists, a table that moved to another section. Since `sliceSectionByAnchorId` returns `undefined` and `getTableCellText` returns `undefined` for a missing cell, an embed that does not check them renders an empty card rather than failing. Decide what a broken reference should do, and make the check explicit.
