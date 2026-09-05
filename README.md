# cudoc

[![CI](https://github.com/cudoment/cudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/cudoment/cudoc/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)

**English** | [한국어](./README.ko.md)

Documentation syntax extensions and AST extraction for MDX, shared across static site generators.

cudoc adds the markup a documentation site keeps needing — explicit heading anchors, inline badges, lists inside table cells, tables laid out as components — and it can write the compiled AST of every document to JSON so search, reuse and link checking read the same tree the page renders from.

Every feature is optional and configured on its own. Nothing here assumes a particular site generator.

## Contents

- [Why](#why)
- [Packages](#packages)
- [Installation](#installation)
- [Syntax](#syntax)
- [Options](#options)
- [Providing components](#providing-components)
- [Connecting it to a site generator](#connecting-it-to-a-site-generator)
- [Exporting the AST](#exporting-the-ast)
- [Constraints](#constraints)

## Why

A documentation site usually grows a pile of one-off remark plugins: one for anchors, one for badges, one to work around Markdown's inability to put a list in a table cell. They end up entangled with the site that grew them, and the AST they produce is thrown away after rendering, so search and validation re-parse the documents and drift from what the page actually shows.

cudoc separates the two halves. The syntax is described declaratively so any host can adopt it, and the compiled tree can be written out as data so everything downstream reads the same thing the page did.

## Packages

| Package                                   | What it does                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| [`cudoc-core`](./packages/cudoc-core)     | AST contract, validation, traversal, syntax parsing. No file system, no framework |
| [`cudoc-remark`](./packages/cudoc-remark) | The remark plugin, with a separate option group per feature                       |
| [`cudoc-node`](./packages/cudoc-node)     | Path resolution, AST export to JSON and loading it back                           |

Each transform is also available on its own subpath, for a host that wants one feature and not the rest:

```js
import tableCellList from "cudoc-remark/table-cell-list"
import badge from "cudoc-remark/badge"
```

## Installation

```bash
npm install cudoc-remark
npm install cudoc-node   # only if you want the AST written to JSON
```

`cudoc-core` arrives as a dependency of both.

## Syntax

### Heading anchors and badges

```md
## Rate limits (#rate-limits) (@REST API)
```

becomes a heading whose visible text is `Rate limits`, followed by:

```jsx
<Anchor id="rate-limits" headerLevel="h2" badge="REST API" />
```

A stable, author-controlled anchor keeps deep links working when a heading is reworded.

### Inline badges

```md
This endpoint is (@deprecated) and will be removed.
```

Badge syntax inside a link is left alone, because a badge there would nest interactive content.

### Lists inside table cells

Markdown cannot put a list in a table cell. cudoc reads the cell's raw source and rebuilds it as the same `list` nodes an ordinary list produces:

```md
| Purpose  | Detail                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| Identity | - Proves membership<br />-- Student card, staff card<br />- Proves a qualification |
```

`-` and `*` mark unordered items, doubling the marker (`--`, `**`) or indenting nests one level deeper, and `1.`, `1..`, `1...` do the same for ordered items. A bare `-` straight after a numbered item is read as one level below it.

Anything the parser cannot make sense of stays as written, block by block: an ordered list whose start number is outside JavaScript's safe integer range, or a nesting level with no parent, keeps its source while the rest of the cell still converts.

### Table column layout

A cell holding many items reads badly in a single narrow column. A layout rule turns the table into host components and splits one column across several cells, spanning the header to keep the grid rectangular:

```js
tableColumnLayout: [
  {
    section: { depth: 5, titles: ["Requirements"] },
    columnHeaders: ["Prerequisites"],
    split: { minItems: 4, columns: 2 },
  },
]
```

## Options

```js
{
  // List syntax inside table cells. On by default.
  tableCellList: true,

  // Anchor id and badge written in a heading. On by default.
  headingMetadata: {
    depths: [2, 3, 4, 5],
    idDelimiters: ["(#", ")"],
    badgeDelimiters: ["(@", ")"],
    anchor: {
      name: "Anchor",
      idAttribute: "id",
      levelAttribute: "headerLevel",  // false to omit it
      levelPrefix: "h",
      badgeAttribute: "badge",
    },
  },

  // Badge syntax in ordinary prose. On by default.
  badge: {
    name: "Badge",
    delimiters: ["(@", ")"],
    excludeAncestors: ["link", "linkReference"],
  },

  // Table of contents. Off by default: most hosts build their own.
  toc: {
    titleDepth: 1,       // false to collect no title
    depths: [2, 3],
    exportName: "toc",
  },

  // Column layout rules, applied in order. Empty by default.
  tableColumnLayout: [],

  // Your own transforms, run in the same walk as the built-in ones.
  transforms: { pre: [], post: [] },
}
```

Any feature takes `false` to turn it off, or `true` for its defaults. An unknown option key is an error rather than something silently ignored, so a typo surfaces at startup instead of as missing output much later.

Everything runs in one traversal. That is not only for speed: ordering between transforms is a contract. Cells are normalized on the way down, so a rule that rewrites a whole table on the way up sees cells that are already final.

## Providing components

cudoc emits capitalized elements — `Anchor`, `Badge`, and whatever a layout rule names. MDX resolves those from the components you provide, and throws at render time if one is missing. Supply them wherever your host maps MDX components:

```jsx
export function useMDXComponents(components) {
  return {
    ...components,
    Anchor: MyAnchor,
    Badge: MyBadge,
  }
}
```

Rename them to match components you already have:

```js
headingMetadata: {
  anchor: {
    name: "HeadingLink"
  }
}
```

## Connecting it to a site generator

### Next.js with `@next/mdx`

```js
import createMDX from "@next/mdx"
import cudocPrepare from "cudoc-remark"

const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm"], [cudocPrepare, cudocOptions]],
  },
})
```

Turbopack hands the config to a worker, so plugins are named by string and options must be plain JSON. cudoc's options are designed for that — see [Constraints](#constraints).

### Docusaurus

Pass it through `beforeDefaultRemarkPlugins` so anchors exist before Docusaurus generates its own heading ids and table of contents, and leave `toc` off so the two do not both produce one.

### Nextra

Connect it through `mdxOptions.remarkPlugins`, and leave `toc` off for the same reason.

> Docusaurus and Nextra adapters are not published yet. Both hosts run MDX v3, so the plugin itself works; what an adapter adds is ordering and default components. Pin your versions and verify with a small example first.

## Exporting the AST

```js
import exportAst from "cudoc-node"

remarkPlugins: [
  ["remark-gfm"],
  [cudocPrepare, cudocOptions],
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

Each document under `sourceRoot` is written to a matching path under `outDir`. Positions and export-only nodes are dropped, a schema version is recorded under `root.data`, and the contract is validated before anything is written.

The tree comes from the host's real compilation rather than a second parse. Re-parsing MDX to reproduce it would drift, because the MDX compiler applies its own transforms before user plugins run.

Read it back with `loadAst`, which validates the version on the way in so a stale file is reported where it is read:

```js
import { loadAst } from "cudoc-node"

const document = loadAst("en/setup/app", { outDir: ".cudoc/ast" })
```

## Constraints

**Options must be JSON-serializable.** A bundler may hand the plugin config to a worker, which rules out functions and `RegExp` objects. Syntax is described with delimiter pairs, and conditions with declarative selectors. Behaviour that genuinely needs code goes in a custom transform passed through `transforms`, which is for programmatic use only.

**Delimiters must be inert to the parser.** They are matched after the document is parsed, so in MDX you cannot use `{` or `}`, which start a JavaScript expression, or `<`, which starts an element.

**Table cell lists need the source text.** Position information and the raw source are how a cell's markers are read; mdast does not preserve them. Without the source, that transform leaves cells untouched rather than guessing at a list from the AST shape alone.

## License

[MIT](./LICENSE)
