# Document APIs

**English** | [한국어](./document.ko.md) · [API reference](./README.md)

## Document options

Source: [document.ts](../../packages/cudoc/src/document.ts). Import types and normalization from `@cudoment/cudoc/document`.

```ts
type SyntaxMode = "host" | "cudoc" | "both"
type SyntaxOptions = Partial<
  Record<
    "headingAnchor" | "badge" | "tableCellList" | "callout" | "link",
    SyntaxMode
  >
>
type Host =
  | "markdown"
  | "next"
  | "docusaurus"
  | "nextra"
  | "vitepress"
  | "eleventy"
  | "html"
  | "docs"
```

| `DocumentOptions` property | Default                        | Contract                                                      |
| -------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `syntax`                   | `DEFAULT_SYNTAX`               | Per-feature normalization; unknown keys and modes throw       |
| `host`                     | `markdown`                     | Native syntax profile; does not install a host compiler       |
| `format`                   | `md` in standalone compilation | `md` or `mdx`; collection infers each file's extension        |
| `headingIds`               | Generate unless set to `host`  | `host` defers missing IDs; explicit IDs still apply           |
| `calloutTypes`             | `[]`                           | Extra type names, added to note/tip/important/warning/caution |
| `components`               | Host mappings only             | Static component-name to semantic-kind mappings               |
| `tableColumnLayout`        | `[]`                           | Ordered column layout rules                                   |

`DEFAULT_SYNTAX` is `{ headingAnchor: "cudoc", badge: "cudoc", tableCellList: "cudoc", callout: "cudoc", link: "host" }`. `resolveSyntax(syntax?)` returns all five modes with defaults filled in. Modes control normalization, not host-parser admission. Ordinary Markdown links remain valid in every mode.

`normalizeDocument(tree, source, options?, inlineParser?) → DocumentDiagnostic[]` mutates `tree`. Pass the original source with matching position offsets; cell-list reconstruction reads it. `inlineParser(source) → PhrasingContent[]` lets a host parse table-cell inline syntax using its native parser. `isCudoc(mode)` and `isHost(mode)` test participation of each grammar.

Normalization processes heading markers, callouts, mapped components, cell lists and badges, then applies table-layout rules, lowers static native elements and assigns standalone heading IDs. Badges and permalinks do not contribute to generated heading text. Existing IDs are checked before new IDs are generated. Duplicate or conflicting IDs throw with a source location.

`DocumentDiagnostic` has `code`, `message`, optional unist `position`. Current nonfatal codes are `UNKNOWN_CALLOUT_TYPE` and `DYNAMIC_COMPONENT`. Callout type registration requires names matching `/^[a-z][\w-]*$/i`. Unknown cudoc callout markers remain intact; dynamic mapped/native JSX is retained instead of evaluated.

## Compilation

Source: [markdown.ts](../../packages/cudoc/src/markdown.ts). Import `compileDocument` and `CompiledDocument` from `@cudoment/cudoc/markdown`.

```ts
compileDocument(source: string, options?: DocumentOptions): CompiledDocument
// CompiledDocument = { tree: Root, frontmatter: Record<string, unknown>,
//                      diagnostics: DocumentDiagnostic[] }
```

The synchronous standalone compiler uses remark parse/GFM/frontmatter for Markdown and the actual MDX compiler for MDX. `.md` does not interpret `{value}` as JavaScript. YAML frontmatter must be a mapping; null becomes `{}`. YAML nodes and MDX ESM nodes are removed from the returned content tree. Docusaurus profile adds directive parsing, but this does not reproduce Docusaurus's entire compiler. Use a native compiler callback for host collection.

```js
import { compileDocument } from "@cudoment/cudoc/markdown"
import { renderDocument } from "@cudoment/cudoc/render"

const result = compileDocument(
  "## Limits (#limits)\n\n> [!NOTE] Capacity\n> 100 requests.",
  { format: "md", syntax: {} },
)
const html = renderDocument(result.tree)
```

## Semantic AST

cudoc uses mdast nodes with `data.hName`/`data.hProperties` for HTML output and `data.cudoc` for semantics. A callout is a `blockquote`, not a required React component:

```json
{
  "type": "blockquote",
  "data": {
    "hName": "aside",
    "hProperties": {
      "className": ["cudoc-callout", "cudoc-callout-note"],
      "data-callout": "note"
    },
    "cudoc": { "kind": "callout", "type": "note", "title": "Capacity" }
  },
  "children": []
}
```

The example omits content children. Actual callouts prepend a title paragraph styled in bold by the stylesheet, marked `cudoc.kind: "calloutTitle"`, followed by body blocks. A missing title displays the uppercase type. The source position belongs to the original block.

Other semantics include `heading` (`explicitId`, optional `badge`), `badge` (rendered `span`) and `permalink`. Heading IDs live in `data.hProperties.id`. `DocumentNode` is an extensible structural type, not a guarantee that every custom node is renderable. `DocumentData` also allows other host metadata.

Stored ASTs use `root.data.cudocAstVersion: 1`; see [storage contracts](./node.md#library-files). `validateAstContract(tree, options?)` checks root/node structure, lists and table-cell constraints; `requireVersion: true` additionally requires the configured version. It does not verify every arbitrary host component's semantics.

## Components and rendering

`DocumentOptions.components` maps names to `{ kind: "callout" | "link" | "badge", typeAttribute?, titleAttribute?, urlAttribute? }`. Attribute defaults are `type`, `title`, `href`. Built-in profiles map Docs `Infobox`/`Link`/`IconLink`, Nextra `Callout`, and Docusaurus `Admonition`. User mappings override matching names. Their feature must accept host syntax.

`staticAttributes(node)` reads literal strings, boolean attributes and JSON expression values. `hasDynamicAttributes(node)` detects expressions/spreads that cannot be read statically. `canonicalCalloutType(type)` maps info/default→note, danger/error→caution, warn→warning. `makeCallout(type, titleNodes, children, position?)` creates the semantic block. `lowerNativeElements(tree)` mutates supported static native JSX into renderable mdast and preserves dynamic JSX.

Import rendering from `@cudoment/cudoc/render` ([source](../../packages/cudoc/src/render.ts)):

```ts
documentToHast(tree: Root, options?: RenderOptions): HastRoot
renderDocument(tree: Root, options?: RenderOptions): string

type RenderOptions = {
  highlight?: (code: string, language?: string) => string
  components?: Record<string, (node: DocumentNode) => string>
}
```

These `components` are **HTML renderer callbacks**, distinct from semantic mappings and from React components. `highlight` returns a complete HTML fragment; an empty string falls back to plain code markup. Unsupported MDX/directive/custom nodes throw. Module exports are not executed; raw HTML and callback output are passed through without sanitization. Treat this as a renderer for trusted documentation or add a separate sanitization policy in your consumer.

The renderer maps standard mdast and HTML metadata to HAST. For embedded roots it uses `data.cudocEmbedPrefix` to namespace the footnote accessibility label. `nodeText(node)` concatenates values recursively; `visibleHeadingText(node)` excludes badge/permalink children. Use `getNodeText` below when block boundaries matter. It also respects normalized HTML `hName` block/table boundaries and excludes badge/permalink children from headings, while retaining badges in prose.

### Host stylesheet

Source: [styles.css](../../packages/cudoc/styles.css), imported as `@cudoment/cudoc/styles.css`. It styles the `cudoc-callout`, `cudoc-callout-title`, `cudoc-badge` and `cudoc-embed` class names the renderer emits, and nothing else.

Because it loads inside a host's own page it sets no text colour: body text inherits the host's theme, and only surfaces and accents flip. Its properties are namespaced `--cudoc-wash`, `--cudoc-line`, `--cudoc-accent`, `--cudoc-accent-soft`, `--cudoc-warn`, `--cudoc-warn-wash`, `--cudoc-danger` and `--cudoc-danger-wash`, so a site retheme the components by redefining those without touching host variables. Three theme signals are honoured, in this order of specificity: `prefers-color-scheme: dark`, a `dark` class on the root element (VitePress, Nextra), and `data-theme="dark"` (Docusaurus). A `light` class or `data-theme="light"` restores the light palette even when the system prefers dark, so a host's own toggle wins in both directions. The palette matches `siteStyles` in [the HTML adapter](./adapters.md#html), and every surface clears WCAG AA against both a light and a dark inherited text colour.

## Sections and queries

Source: [sections.ts](../../packages/cudoc/src/sections.ts). Import `collectSections`, `SectionSelection` and `CollectedSection` from `/sections` or `/query`.

```ts
collectSections(tree: Root, select?: SectionSelection): CollectedSection[]
type SectionSelection = {
  anchors?: string[]
  titles?: string[]
  depth?: number | number[]
  includeChildren?: boolean
}
// CollectedSection = { anchorId: string, title: string, tree: Root, heading: Heading }
```

Filters are combined; depths must be integers 1–6. Headings without IDs are skipped. An explicitly requested missing anchor throws; unmatched titles/depths yield no entries. Results follow document order. Section trees are cloned and retain referenced link/image/footnote definitions. `heading` is the original heading reference; clone it before mutation. Child sections are included unless `includeChildren: false`.

Lower-level helpers from `/query` ([source index](../../packages/cudoc/src/internal/core/query/index.ts)):

| Function                                                                      | Return and behavior                                                                                |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `findHeadingByAnchorId(tree, id, options?)`                                   | `{ heading, parent, index }` or `undefined`                                                        |
| `sliceSectionByAnchorId(tree, id, options?)`                                  | `Root` or `undefined`; ends at next same/shallower heading; retains definitions by default         |
| `findSectionEnd(parent, index, depth)`                                        | Exclusive sibling boundary                                                                         |
| `findParentHeading(parent, index, depth)`                                     | Enclosing heading or `undefined`                                                                   |
| `getHeadingAnchorId(heading, options?)`, `getHeadingBadge(heading, options?)` | String or `undefined`                                                                              |
| `normalizeAnchorId(id)`                                                       | Removes leading `#` and decodes percent escapes                                                    |
| `findSiblingNode(parent, index, options)`                                     | Matching sibling or `undefined`; options require direction, allow type/boundary/accept             |
| `getNodeText(nodes, options?)`                                                | Text with block boundaries; unknown descendants included by default; table cells separated by tabs |
| `getTableCellNodes(table, positions)`                                         | `Node[][]`; missing cells yield empty arrays                                                       |
| `getTableCellText(table, positions)`                                          | `(string \| undefined)[]`                                                                          |
| `getTableHeaderTexts(table)`                                                  | Header strings                                                                                     |
| `findTableColumnIndex(table, headerTexts)`                                    | Matching column index, otherwise `-1`                                                              |

Cell positions are zero-based `[row, column]`, including header row 0. `SliceSectionOptions` adds `includeDefinitions` (default true) and `contextHeadingFromDepth` (default unset) to anchor naming options. Low-level query results may reference input nodes; they are not the immutable embedding boundary. `collectSections` and embed resolution clone the trees used for transformation.

## Projection

Source: [dataset.ts](../../packages/cudoc/src/dataset.ts). Import from `@cudoment/cudoc/dataset`.

`projectAst(tree, options?) → Root` validates input, recursively clones and filters nodes and properties, then validates output. `ProjectionOptions` contains optional `excludeNodeTypes`, `excludeComponents`, `stripProperties` string arrays. Defaults remove nothing. `type` and `children` cannot be stripped. Excluding a node removes its subtree. Components match MDX JSX names, not already-normalized semantic nodes.

`docsDatasetProjection` is an opt-in preset excluding `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `DocDataEmbed`. It does not exclude ordinary Markdown tables. Disk generation is covered in [Node datasets](./node.md#datasets).

## Core helpers

The root barrel exports AST contracts, query helpers, `walk`, section selectors, delimiter helpers and MDX construction utilities. It does not re-export `compileDocument`, `normalizeDocument` or the new Node library APIs.

| Entry/source                                                                                                       | Exports and contract                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [/ast](../../packages/cudoc/src/internal/core/ast/index.ts)                                                        | Version constants/resolver, `validateAstContract`, list/parent/table guards and AST types                                   |
| [Root traversal](../../packages/cudoc/src/internal/core/walk.ts)                                                   | `walk({ tree, state, preTransforms, postTransforms })`; ordered in-place transforms with ancestor/parent/index context      |
| [Root selectors](../../packages/cudoc/src/internal/core/selectors.ts)                                              | `assertSectionSelector`, `matchesSectionHeading`, `findPreviousHeading`, title/header normalization and inline text helpers |
| [/syntax](../../packages/cudoc/src/internal/core/syntax/index.ts)                                                  | Delimiter validation, extraction, splitting and stripping; heading metadata helpers                                         |
| [/mdx](../../packages/cudoc/src/internal/core/mdx/index.ts)                                                        | Attribute/flow/text element creation, attribute reading/writing, line-break and child conversion helpers                    |
| [/transforms/table-cell-list/index](../../packages/cudoc/src/internal/transforms/table-cell-list/index.ts)         | `transformTableCellList`, parser and cell reconstruction helpers                                                            |
| [/transforms/table-column-layout/index](../../packages/cudoc/src/internal/transforms/table-column-layout/index.ts) | Layout transform/resolver, table construction, split options and cell splitting                                             |
| [cudoc-remark/badge](../../packages/cudoc-remark/src/transforms/badge.ts)                                          | Badge transform and option resolution                                                                                       |

Low-level heading/badge transforms can emit named MDX elements. They are building blocks, not the component-free authoring setup; use `normalizeDocument` or the adapter's explicit `syntax` option for that setup.

`TableColumnLayoutOptions` requires `section` (depth/title selector) and `columnHeaders`. Optional `split`, `components`, `spanAttribute` (default `colSpan`), `metadataDelimiters`, `ignoreElements` customize output. The default element mapping uses lowercase HTML tables. Do not configure capitalized table names for portable output unless you provide their semantics/renderers. See the linked source for complete transform-context and layout types.
