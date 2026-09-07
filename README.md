# cudoc

[![CI](https://github.com/cudoment/cudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/cudoment/cudoc/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)

**English** | [한국어](./README.ko.md)

Reuse sections and tables from MDX documents through their compiled AST, across static site generators.

cudoc adds the markup a documentation site keeps needing — explicit heading anchors, inline badges, lists inside table cells, tables laid out as components — and it can write the compiled AST of every document to JSON so search, reuse and link checking read the same tree the page renders from.

Cross-document embedding is the central workflow: export the compiled AST, load it, select a section and render it with your site's components. Syntax extensions are individually configurable. Nothing here assumes a particular site generator.

## Contents

- [Why](#why)
- [Packages](#packages)
- [Installation](#installation)
- [Syntax](#syntax)
- [Options](#options)
- [Providing components](#providing-components)
- [Connecting it to a site generator](#connecting-it-to-a-site-generator)
- [Exporting the AST](#exporting-the-ast)
- [Reading it back](#reading-it-back)
- [Guides and examples](#guides-and-examples)
- [Constraints](#constraints)

## Why

A documentation site usually grows a pile of one-off remark plugins: one for anchors, one for badges, one to work around Markdown's inability to put a list in a table cell. They end up entangled with the site that grew them, and the AST they produce is thrown away after rendering, so search and validation re-parse the documents and drift from what the page actually shows.

cudoc separates the two halves. The syntax is described declaratively so any host can adopt it, and the compiled tree can be written out as data so everything downstream reads the same thing the page did.

## Packages

| Package                                           | What it does                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`cudoc`](./packages/cudoc)                       | Shared AST contract, validation, queries and Node export/loading for embedding |
| [`cudoc-remark`](./packages/cudoc-remark)         | The remark plugin, with a separate option group per feature                    |
| [`cudoc-docusaurus`](./packages/cudoc-docusaurus) | Docusaurus wiring, heading ids and a theme providing the components            |
| [`cudoc-nextra`](./packages/cudoc-nextra)         | Nextra wiring, heading ids and default components                              |

Each transform is also available on its own subpath, for a host that wants one feature and not the rest:

```js
import tableCellList from "cudoc-remark/table-cell-list"
import badge from "cudoc-remark/badge"
```

## Installation

```bash
npm install cudoc cudoc-remark
npm install cudoc-docusaurus    # on Docusaurus
npm install cudoc-nextra        # on Nextra
```

`cudoc/embed` is a Node-only entry point included in `cudoc`, not a separate package. `cudoc` and `cudoc/query` remain browser-safe. All adapters and transforms use the same internal core through `cudoc`; there is no separately published core package. Export is explicitly wired into the host pipeline so the snapshot position and output directory are deliberate.

The embedding guide walks through the [complete export, load, query and render workflow](./docs/embedding.md). `cudoc-remark` and the host adapters are separate packages with independent publication steps; a `cudoc` release alone does not publish them.

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

  // Column layout rules, applied in order. Empty by default.
  tableColumnLayout: [],

  // Your own transforms, run in the same walk as the built-in ones.
  transforms: { pre: [], post: [] },
}
```

Any feature takes `false` to turn it off, or `true` for its defaults. An unknown option key is an error rather than something silently ignored, so a typo surfaces at startup instead of as missing output much later.

Everything runs in one traversal. That is not only for speed: ordering between transforms is a contract. Cells are normalized on the way down, so a rule that rewrites a whole table on the way up sees cells that are already final.

## Providing components

cudoc emits capitalized elements — `Anchor`, `Badge`, and whatever a layout rule names. MDX resolves those from the components you provide, and throws at render time if one is missing.

`cudoc-remark/components` provides `Anchor` and `Badge`. Layout tables use the host's existing `table`, `thead`, `tbody`, `tr`, `th` and `td` mappings by default. Only explicitly configured capitalized table names need additional components. Both adapters use this same set, so a document renders the same markup on every host:

```jsx
import { cudocComponents } from "cudoc-remark/components"

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents }
}
```

They are markup with class names to style against — `span.cudoc-badge` — rather than a design. Replace one by putting it after the spread:

```jsx
return { ...components, ...cudocComponents, Badge: MyBadge }
```

On Docusaurus the adapter's theme supplies them, so there is nothing to write at all.

Or rename the elements to match components you already have, and provide nothing new:

```js
headingMetadata: {
  anchor: {
    name: "HeadingLink"
  }
}
```

## Connecting it to a site generator

Each host is verified by an [example site](./examples) that renders the same document; the three are compared against each other on every build.

### Next.js with `@next/mdx`

```js
import createMDX from "@next/mdx"

const withMDX = createMDX({
  options: {
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", cudocOptions],
      // Required with the supplied Anchor: it renders the badge only,
      // so this plugin puts the actual link target on the heading.
      ["cudoc-remark/heading-ids", {}],
    ],
  },
})
```

Plugins are named by package rather than passed as functions. Turbopack hands the MDX config to a worker, which cannot carry a function; webpack keeps the config in this process, but `@next/mdx`'s loader resolves a string specifier there too, so one form covers both bundlers. That is also why every option has to stay plain JSON — see [Constraints](#constraints).

Provide `Anchor` and `Badge` from `mdx-components.js`. Default layout tables reuse the existing HTML table mappings. Optional table of contents export is covered in the [Next.js guide](./docs/next-mdx.md#table-of-contents).

### Docusaurus

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

presets: [["classic", { docs: {
  beforeDefaultRemarkPlugins: cudocRemarkPlugins(cudocOptions),
} }]],
plugins: ["cudoc-docusaurus"],
```

`beforeDefaultRemarkPlugins`, so the anchors exist before Docusaurus assigns its own heading ids, and the plugin entry so its theme supplies the components. See [`cudoc-docusaurus`](./packages/cudoc-docusaurus#readme).

### Nextra

```js
import { cudocRemarkPlugins } from "cudoc-nextra"

const withNextra = nextra({
  mdxOptions: { remarkPlugins: cudocRemarkPlugins(cudocOptions) },
})
```

Nextra puts these in front of its own plugins, which is the order cudoc needs. Add `cudocComponents` from `cudoc-nextra/components` in `mdx-components.jsx`. See [`cudoc-nextra`](./packages/cudoc-nextra#readme).

### Heading ids on a host that makes its own

Both Docusaurus and Nextra slugify heading text into an id, which would leave two ids on the same heading. Both adapters copy each anchor id onto its heading first, so the heading and the anchor agree on one value. `cudoc-remark/heading-ids` is the plugin that does it, and it works on any host whose pipeline ends in `mdast-util-to-hast` — including plain MDX.

## Exporting the AST

```js
import exportAst from "cudoc/embed"

remarkPlugins: [
  ["remark-gfm"],
  [cudocPrepare, cudocOptions],
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

Each document under `sourceRoot` is written to a matching path under `outDir`. Positions and export-only nodes are dropped, a schema version is recorded under `root.data`, and the contract is validated before anything is written.

The tree comes from the host's real compilation rather than a second parse. Re-parsing MDX to reproduce it would drift, because the MDX compiler applies its own transforms before user plugins run.

## Reading it back

Exporting the tree is half of what it is for. The other half is a page that pulls a section, a table or a paragraph out of another document and renders it in place — so the summary and the page it summarizes come from one tree and cannot drift apart.

`loadAst` reads a stored document, validating the schema version on the way in so a stale file is reported where it is read rather than misinterpreted:

```js
import { loadAst } from "cudoc/embed"

const document = loadAst("en/setup/app", { outDir: ".cudoc/ast" })
```

`cudoc/query` is what you locate things with. An anchor id is the key: an author chose it, and it survives the heading being reworded, which is why cudoc has explicit anchors in the first place.

```js
import {
  findSiblingNode,
  getHeadingBadge,
  getNodeText,
  getTableCellText,
  sliceSectionByAnchorId,
} from "cudoc/query"

// The section a link points at, as a tree of its own.
const section = sliceSectionByAnchorId(document, "rate-limits")
if (!section) throw new Error("Missing section: rate-limits")

const [heading, ...rest] = section.children
getNodeText([heading]) // "Rate limits"
getHeadingBadge(heading) // "REST API" — an attribute, not text

// Bounded to the section, so a lookup cannot borrow the next one's table.
const table = findSiblingNode(section, 0, {
  direction: "after",
  type: "table",
  boundary: section.children.length,
})
if (!table) throw new Error("Missing table in rate-limits")
getTableCellText(table, [
  [1, 0],
  [1, 1],
])
```

What counts as the right node for a particular embed stays with you: that is a convention of your documentation set, not something cudoc can know. cudoc provides queries over a snapshot of the host's remark tree at the export plugin. Later host transforms and component execution are outside that snapshot.

See the [embedding guide](./docs/embedding.md) for the whole path, and [`examples/next-mdx/app/embed`](./examples/next-mdx/app/embed) for a page that does it.

## Guides and examples

[`docs/`](./docs) walks through setting cudoc up on each host, from an empty project to a rendered page, and says where the three differ and why:

- [Next.js with `@next/mdx`](./docs/next-mdx.md)
- [Docusaurus](./docs/docusaurus.md)
- [Nextra](./docs/nextra.md)

[`examples/`](./examples) holds one site per host, all rendering [the same document](./examples/fixtures/showcase.mdx) with the same options. `scripts/compare-hosts.mjs` reads their built HTML and requires the heading ids, badges, list nesting and table grid to match; `scripts/check-rebuild.mjs` edits the document, rebuilds, and requires the edit to reach both the page and the exported AST.

## Constraints

**Options must be JSON-serializable.** A bundler may hand the plugin config to a worker, which rules out functions and `RegExp` objects. Syntax is described with delimiter pairs, and conditions with declarative selectors. Behaviour that genuinely needs code goes in a custom transform passed through `transforms`, which is for programmatic use only.

**Delimiters must be inert to the parser.** They are matched after the document is parsed, so in MDX you cannot use `{` or `}`, which start a JavaScript expression, or `<`, which starts an element.

**Table cell lists need the source text.** Position information and the raw source are how a cell's markers are read; mdast does not preserve them. Without the source, that transform leaves cells untouched rather than guessing at a list from the AST shape alone.

## License

[MIT](./LICENSE)
