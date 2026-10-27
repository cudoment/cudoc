# Document APIs

**English** | [한국어](./document.ko.md) · [API reference](./README.md)

This page states the document APIs of `@cudoment/cudoc`: options, metadata, compilation, semantic AST, presentation, rendering, sections, projection and helpers.

## Document options

Source: [document.ts](../../packages/cudoc/src/document.ts). Import types and normalization from `@cudoment/cudoc/document`.

```ts
type SyntaxMode = "host" | "cudoc" | "both" | "off"
type SyntaxOptions = Partial<
  Record<
    | "headingAnchor"
    | "badge"
    | "tableCellList"
    | "callout"
    | "link"
    | "tableCellSpan"
    | "tableNote"
    | "codeMeta"
    | "tabs",
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
| `tableColumnWidths`        | `[]`                           | Minimum column widths by header text, applied before layout   |
| `ignoreDiagnostics`        | `[]`                           | Diagnostic codes not reported; the nodes are handled the same |
| `variables`                | None: nothing is replaced      | Values `(=name)` markers are replaced with                    |
| `linkReferences`           | None                           | Link reference definitions every document shares, by label    |

`DEFAULT_SYNTAX` is `{ headingAnchor: "cudoc", badge: "cudoc", tableCellList: "cudoc", callout: "cudoc", link: "host", tableCellSpan: "cudoc", tableNote: "host", codeMeta: "cudoc", tabs: "cudoc" }`. `resolveSyntax(syntax?)` returns every mode with defaults filled in. Modes control normalization, not host-parser admission. Ordinary Markdown links remain valid in every mode.

`normalizeDocument(tree, source, options?, inlineParser?) → DocumentDiagnostic[]` mutates `tree`, except its front matter: a `yaml` or `toml` node is left as written, in its place, for whatever reads it afterwards. Pass the original source with matching position offsets; cell-list reconstruction reads it.

`inlineParser(source) → PhrasingContent[]` lets a host parse table-cell inline syntax with its native parser. The places its nodes record are read against `source`, as the shared references below are, so a node without one has the brackets its text escapes read as brackets.

`isCudoc(mode)` and `isHost(mode)` test participation of each grammar, and both are false for `off`, under which cudoc normalizes neither form of the feature.

`idToken(id)` spells a document ID so it can sit inside an HTML id and a URL fragment alike: ASCII letters, digits and `-` stay, and every other character becomes `_`, its code point in hex, and `_` (`guide/개요` → `guide_2f__ac1c__c694_`). There is no `%`, so a fragment matches its element whether or not the browser decodes it, and distinct IDs stay distinct. Embedded footnote prefixes and `cudoc-export`'s bound-volume anchors use it.

Normalization runs in this order:

1. Replaces variables in component attributes.
2. Processes heading markers, callouts, mapped components, cell lists, badges, tabs, code titles and table notes.
3. Links shared references.
4. Replaces the other variables.
5. Marks merged table cells.
6. Applies table-width and table-layout rules.
7. Takes the merged-away cells out.
8. Replaces page-break fences.
9. Lowers static native elements.
10. Assigns standalone heading IDs.

Generated heading text leaves badges and permalinks out. Existing IDs are checked before new IDs are generated, and a generated ID skips every ID already taken. Two headings with the same ID are reported as a `DUPLICATE_HEADING_ID` diagnostic rather than thrown, since hosts suffix such a repeat instead of failing and [`cudoc check`](./node.md#reference-checking) reports every one as `duplicate-anchor`. One heading carrying two different ID markers throws `conflicting heading IDs` with its source location.

`variables` maps names to strings. `resolveVariables(value)` validates it and returns `undefined` without it. It throws for a value that is not a string and for a name a marker cannot spell, one that is not a letter or `_` followed by letters, digits, `_`, `.` and `-`.

With it, `replaceVariables(text, variables, missing?)` replaces every `(=name)` the table defines in:

- each node's `value`, `url`, `title`, `alt` and `meta`
- the string values of MDX JSX attributes, written as a string or as a JSON string expression such as `{"…"}`, whose parsed expression is rewritten too
- the string values of `data.hProperties`
- `data.cudoc.title`, the title of a code block, callout or tab

Component attributes are replaced first, so a callout's type, its class and its default title, a tab's value, or the id and badge an `Anchor` gives a heading, come from the value a marker names. The rest runs after cell lists are rebuilt from the source and after shared references are resolved, so a variable in a shared address is replaced too, and before the table rules and heading ids read the text. Each marker is replaced once, and a value that spells a marker stays as it is.

A `cudoc-embed` or `cudoc-pagebreak` code block is skipped, and so are MDX expressions, imports and exports, whose code the host runs. A marker naming nothing is left as written and reported once per node as `UNDEFINED_VARIABLE`.

`data.cudocWrittenAddress` on a link or image holds the address a markdown-it adapter replaced before the host's link rules read it ([markdown-it hosts](./adapters.md#markdown-it)). A node that has it is reported from that address, and nothing in its `url` or in the `href` or `src` of its `data.hProperties` is replaced again. The property is then removed, so no stored tree holds it.

`linkReferences` maps labels to an address or `{ url, title? }`. `resolveLinkReferences(value)` validates it and indexes it by `normalizeLabel(label)`, throwing for:

- a label that is empty, holds a bracket or is longer than the 999 characters a link label has
- two labels that match each other, such as `Console` and `console`
- an address markdown-it refuses as a link even in a definition the page writes, on every host alike: `javascript:`, `vbscript:`, `file:`, and `data:` other than a GIF, PNG, JPEG or WebP image
- any other value

`normalizeLabel(label)` collapses spaces, tabs and line endings to one space, trims, and folds case by lower- and then upper-casing, as micromark matches labels, so `straße` matches `STRASSE` while `a b` with a no-break space (U+00A0) does not match `a b`. A markdown-it host matches labels by its own rule, which collapses other white space too.

Normalization then turns every `[text][label]`, `[label][]` and `[label]` the parser left as text, because the document defines no such label, into a `link` with the definition's `url` and `title` and `data.cudoc` `{ kind: "reference", label }`, the label as written. Where a `!` stands before it, as `![alt][label]`, it becomes an `image` with the link text as `alt`.

An image's text may hold links, the parser's or shared ones, which its `alt` reads as text, an image's `alt` in it included.

An image the parser made keeps its text as `alt` alone, one made of the document's own definition included. Its description is found in the source by pairing its brackets past escapes and code spans, and parsed again as a paragraph's text, its later lines indented so they continue it, with the document's definitions it may name after it. A shared reference in it therefore resolves too, while code, links and references the parser made there stay as it made them. A link there keeps a link around the image from forming, as one directly in that link's text would.

Only a description that reads as the parser read it, to the same `alt`, is resolved. One that reads otherwise on its own keeps the `alt` the parser gave it, its shared references unresolved. Examples are a footnote reference, a `\|` in code in a table cell, and a `]` in an autolink, raw HTML or an MDX expression or tag. An image standing in four or more other images' text is left so too, since each level is parsed again.

A label is matched as the source writes it, since CommonMark matches the label written and not the text shown: a full reference's second brackets, `a\*b` for `[text][a\*b]`. A collapsed or shortcut reference's label is its text, `**bold**` for `[**bold**][]` and `a\*b` for `[a\*b][]`. Each is read without what its later lines start with before the text, the indentation and a `>` for each block quote around the text, which the parser leaves out of it too. A `>` that a lazy line of a block quote starts with after four or more spaces is text the parser keeps, but is left out here as well, a known limit.

A label longer than 999 characters, counted without that indentation and those `>` and without its line endings, as micromark counts it, names nothing.

Text is scanned outside code, raw HTML and definitions. Adjacent text nodes the source continues are joined first; siblings where nothing links stay as they were, and text nodes that stood apart stay apart where something does.

A link's text, whether the parser made the link or a shared label did, is scanned for images only, since a link holds no other link. `[![Logo][logo]](https://example.com)` and `[![Logo][logo]][home]` put the image inside the link, as CommonMark, resolving the inner brackets first, does.

The link text may hold other inline nodes in every form, a collapsed or shortcut reference's text then matching only as written, as `[*foo* bar]` matches `*foo* bar`.

Brackets nest as CommonMark nests them. A link written with brackets that forms inside a shared reference's brackets, at any depth, leaves those brackets as text. So `[a [b]][a]` links `b` and then `a`, as the same text with the page's own definitions does. An autolink, `<https://…>`, does not block them, as CommonMark lets a link's text hold one.

As micromark reads them, only a full reference may have no text, as `[][label]`. A `[` right after the text that makes neither a full nor a collapsed reference, as in `[label][ ]`, an unclosed `[label][` or `[label][text](url)`, where the parser made the link, leaves no shortcut reference either.

A link the parser made is kept. Where a definition in the page would have made a reference of brackets the parser read as an inline link, as `[b](url)` in `[a][b](url)` or the outer brackets of `[[b]](url)`, the parser's link stands.

Likewise a bracket the parser read into emphasis, which it reads only once no definition makes the brackets a reference, is no bracket here. A link text whose emphasis holds a bracket that does not pair up there makes no reference, and neither does a label whose `]` stands in emphasis, as `[t][a *b] c*`, which the page's own definition would link.

A bracket the source escapes, as `\[` or as a character reference such as `&#91;`, is text and opens or closes no reference, and a `!` it escapes so before one makes no image. Such a bracket is found by reading each text node against its source offsets, a NUL read as the U+FFFD the parser makes of it. It is marked meanwhile by private-use characters the page does not hold, so one the author wrote is put back as written.

A page that leaves fewer than three of U+E000–U+F8FF free has its shared references left unresolved.

The words beside a `(@badge)` are read against their source offsets the same way before the badge is split off, the words and the badge keeping their place. So is the text around a heading's id marker that normalization cuts out, one text again once the references are resolved. A label beside or across one is therefore read as written too. A bracket already marked as escaped is read against its escape when text is read again.

A table cell's list is parsed again from the cell's source piece by piece, and each piece is read as the document's own text is. Its badges are split, the brackets it escapes are marked by reading its text against the piece's text, and its shared references are resolved against that text, where the parse records places. It keeps no place afterwards, so nothing reads it against the document's source.

A piece is parsed without the document's definitions, so a label the document defines is resolved neither by them nor by a shared definition there and stays text, and an image's description in it is parsed again without them too.

A tab's label and the title a callout records in `data.cudoc.title`, which are fixed before the document's own pass, are read from the title's text with its shared references resolved, as the page's own definitions would leave it.

A character reference is read as micromark decodes it. A number is read as its code point, or U+FFFD for a control character, a surrogate, a noncharacter or one out of range. A name is read as its text, one character or, for a few names such as `&fjlig;`, two.

On a markdown-it host normalization resolves nothing, because the host resolved the shared references itself before inline parsing.

With `tableCellSpan` taking cudoc syntax, a GFM `table` whose cells hold only `^^` or `>>` is merged before the table rules. A `>>` cell is merged into the cell on its left in the same row, and a `^^` cell into the one above from the second body row on, following merges already made. The marks are read from the source when the cell has offsets, so an escaped `\^\^` is text. A mark with nothing to join, in the header row or the first body row for `^^` and the first column for `>>`, stays text.

The owning cell gets numeric `colSpan` and `rowSpan` in `data.hProperties`, and each covered cell is marked `data.cudocCovered` and stays, so a layout rule finds its column by the grid as written. A merged block whose rectangle is not covered completely is reported as `UNEVEN_CELL_SPAN`.

A table a layout rule rebuilds leaves the covered cells out, header cells included, and gives the owning cell `rowSpan` and the rule's `spanAttribute` for its columns, a split column counted as wide as it is laid out. An owning cell that is itself split gives each piece the rows and its last piece the columns merged into it from the right.

After the rules the covered cells are removed from every table still GFM's, each remaining cell takes its column's alignment as `hProperties.align`, and the table's `align` becomes `null`, so mdast-util-to-hast does not pad a shorter row with empty cells. No `cudocCovered` is left in the tree.

A table note is a `blockquote` with `data.hName: "div"`, `hProperties.className: ["cudoc-table-note"]` and `data.cudoc.kind: "tableNote"`, holding paragraphs. Under `tableNote` taking host syntax, a static component mapped to `tableNote`, as the `docs` profile maps `Footnote`, becomes one, its words wrapped in a paragraph when it holds only phrasing content.

The notes the host form made directly after a `table` in the same parent, as consecutive `Footnote`s, are joined into one note after it in any mode. Under cudoc syntax, the paragraphs that directly follow the table and open with a note mark are gathered into it too. A note mark is a run of `*`, `†` or `‡`, or superscript digits with an optional `⁾`, followed by white space.

`parseCodeMeta(meta, mode, host, inCodeGroup?) → { title?, lines?, rest }` reads a fence's meta, never inside an entry's quoted value, so `title="use {2}"` names no lines. A `title=` the mode admits is the title before a `filename=`, wherever each stands, and every such form is taken out of `rest`; VitePress's `[name]` is taken out only when it is the title:

- Under cudoc syntax, the title is `title="…"`, also written with `'…'` or as a bare word.
- Under host syntax, it is Docusaurus's `title=`, Nextra's and the `docs` profile's `filename=`, or VitePress's `[name]`, except on a fence inside a `::: code-group` (`inCodeGroup`), whose `[name]` labels its tab and stays in `rest`.

On the `docs` profile the meta is read as that profile's code component reads it, `filename=Podfile,{2},showLineNumbers`. A comma outside a quoted value and a `{…}` list separates entries as white space does. A value without quotes runs to the next comma, spaces and all, so `filename=My File.swift` names `My File.swift`.

Line ranges `{1,3-5}` are read in every mode but `off`, because every host that highlights lines writes them that way; `off` reads nothing and returns the whole meta as `rest`. The list gives the line numbers sorted and each once, and a range written backwards, `5-3`, reads as `3-5`. An empty part gives none, and so does a range that starts at 0, spans more than 10,000 lines or ends past the integers a number holds exactly (`Number.isSafeInteger`).

When [presentation](#presentation) writes a meta again, it leaves out what the code block's semantics hold: the one title form, in any host's spelling, whose value is the title, and the `{…}` list when there are lines. Everything else stays, a host form normalization did not read included.

Under `syntax.codeMeta`, normalization stores what a `code` node's meta gives as `data.cudoc` `{ kind: "code", title?, lines? }` and leaves `meta` as written; `cudoc-embed` and `cudoc-pagebreak` fences are skipped. Drawing the title is [presentation](#presentation), not normalization.

A group of tabs is a `blockquote` with `data.hName: "div"`, `hProperties.className: ["cudoc-tabs"]` and `data.cudoc` `{ kind: "tabs", group? }`, whose children are tabs: each a `blockquote` with `hName: "div"`, `className: ["cudoc-tab"]` and `data.cudoc` `{ kind: "tab", title, value, default? }`, holding the tab's content.

Under `tabs` taking cudoc syntax, a `code` node whose meta has `tab="…"` (also written with `'…'` or as a bare word) becomes a tab holding it, with `tab=` and `group=` taken off the meta and `group` naming its group. A blockquote whose first text starts with `[!TAB]` or `[!TAB key]`, in any letter case and followed by white space or the end of the line, becomes a tab. The rest of that line titles it, it holds the rest of the blockquote, and the marker's word names its group. With nothing on the line it stays a blockquote and is reported as `UNLABELED_TAB`, and the callout rules do not read it.

After the children of each parent are normalized, every run of adjacent tabs becomes one group, keyed by its first tab's group. A tab that names a different group starts a new one, so two groups written back to back stay two, while a tab repeating the run's key joins it.

Under host syntax, a static component mapped to `tabs` becomes a group when every child is a static component mapped to `tab` that yields a label, and stays the component otherwise. A component mapped to `tabs` is read with `literals` (see below). A markdown-it `::: code-group` container, which the markdown-it conversion marks `kind: "codeGroup"`, becomes a group whose fences are tabs labelled by their `[name]`, taken off the meta, or by their language, or `Code` without either.

A tab's value is the one its component gave, or its title as written slugged by a GitHub slugger for the group, so a variable in a label is slugged as its marker. A given value stays on the first tab that has it. A repeat of it, and a slug that would equal any given value, is numbered `value-1`, `value-2` and on, since two tabs answering to one value would show together or not at all.

`DocumentDiagnostic` has `code`, `message` and an optional unist `position`. The current nonfatal codes are `UNKNOWN_CALLOUT_TYPE`, `DYNAMIC_COMPONENT`, `DUPLICATE_HEADING_ID`, `UNDEFINED_VARIABLE`, `UNEVEN_CELL_SPAN` and `UNLABELED_TAB`. Callout type registration requires names matching `/^[a-z][\w-]*$/i`. Unknown cudoc callout markers remain intact; dynamic mapped/native JSX is retained instead of evaluated.

A compile diagnostic is written in capitals and underscores, and a [`cudoc check`](./node.md#reference-checking) issue in lower case and hyphens, so `UNDEFINED_VARIABLE` is the compile reporting one page and `undefined-variable` the check reporting the library.

`DYNAMIC_COMPONENT` fires when a mapped component or a lowered native tag carries an attribute whose value is an expression other than JSON (`rows={count}`, `title={'Note'}`); JSON in braces (`rows={2}`, `title={"Note"}`) is static, and a group mapped to `tabs` also reads literals. `ignoreDiagnostics: ["DYNAMIC_COMPONENT"]` drops such a code from the result in a project whose components take expressions by design: the tree is identical with or without the option, only the message is gone. A non-string entry throws. Adapters accept the same key.

## Page metadata

Source: [metadata.ts](../../packages/cudoc/src/metadata.ts). Import from `@cudoment/cudoc/query`.

```ts
documentTitle(tree: Root, frontmatter?: Record<string, unknown>, fallback?: string): string
documentDescription(tree: Root, frontmatter?: Record<string, unknown>, maxLength?: number): string
frontmatterOf(tree: Root): Record<string, unknown>
const DESCRIPTION_LENGTH = 160
```

`frontmatterOf(tree)` reads the front matter of a tree's `yaml` node the way every cudoc compiler reads it: YAML with up to 100 aliases and a date kept as the text it was written as. It returns `{}` without a node or for a null one. Anything but a mapping throws `cudoc: frontmatter must be a mapping`. The standalone compiler and the [compiler capture](./adapters.md#compiler-capture) read front matter with it.

`documentTitle` returns a non-empty front matter `title`, a string trimmed or a number. Without one, it returns the visible text of the first depth-1 heading anywhere in the tree (Docusaurus wraps the page's `#` heading in a `header`), badges and permalinks left out. Without such a heading, it returns the same text of the first heading of any depth, or else `fallback` (default `""`).

`documentDescription` returns a string front matter `description` with white space collapsed. Without one, it returns the text of the first top-level `paragraph` that is more than a row of links and has words, so a paragraph holding only a logo image is passed over too. In that text a raw `<br>` is read as a space and white space is collapsed.

A row of links holds at least one link, a reference-style link counted when the document defines its label. Beyond that, it holds only links, strong or emphasized words and separators (`|`, `·`, `•`, `/`, `,`, dashes), as a language switcher written `**English** | [한국어](…)` does.

A front matter `description` is returned whole. Paragraph text longer than `maxLength` code points (default `DESCRIPTION_LENGTH`) is cut at the last space past half the limit, trailing punctuation dropped and `…` added, so the result is at most `maxLength` code points. It is empty when there is neither. Collection writes both into [`pages.json`](./node.md#library-files), and `cudoc-export` puts the description in each site page's `<meta name="description">`.

## Compilation

Source: [markdown.ts](../../packages/cudoc/src/markdown.ts). Import `compileDocument` and `CompiledDocument` from `@cudoment/cudoc/markdown`, which also re-exports [`importedNames` and `importedNamesFromSource`](#core-helpers).

```ts
compileDocument(source: string, options?: DocumentOptions): CompiledDocument
// CompiledDocument = { tree: Root, frontmatter: Record<string, unknown>,
//                      diagnostics: DocumentDiagnostic[], imports?: string[] }
```

The synchronous standalone compiler uses remark parse/GFM/frontmatter for Markdown and the actual MDX compiler for MDX. `.md` does not interpret `{value}` as JavaScript. YAML frontmatter must be a mapping; null becomes `{}`. YAML nodes and MDX ESM nodes are removed from the returned content tree. It reads the front matter with [`frontmatterOf`](#page-metadata).

The Docusaurus profile adds directive parsing, but does not reproduce Docusaurus's entire compiler. Use a native compiler callback for host collection.

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

Other semantics include `heading` (`explicitId`, optional `badge`, the text of the badge it shows in any form), `badge` (rendered `span`), `permalink` and `pageBreak`. A ` ```cudoc-pagebreak ` fence becomes a `thematicBreak` carrying `hName: "div"`, `className: ["cudoc-page-break"]`, `hidden: true` and `cudoc.kind: "pageBreak"`, so it renders nothing on a site and breaks the page in a paginated export ([shared constants](./adapters.md#paginated-output)). Heading IDs live in `data.hProperties.id`.

A node a host made out of a Markdown image, such as the `img` JSX element Docusaurus writes with a `require()` call for its `src`, carries `data.cudocImage: CapturedImage`, `{ url, alt, title }` as the author wrote them ([compiler capture](./adapters.md#compiler-capture)); `capturedImage(node)` from `@cudoment/cudoc/document` returns it. Rendering draws such a node as an `img`, and `cudoc check` checks its `url` as an asset. An embed rebases that `url` and re-expresses a relative module the node's attributes `require()` from the directory of the page the copy lands on. The Word writer draws the image.

`DocumentNode` is an extensible structural type, not a guarantee that every custom node is renderable. `DocumentData` also allows other host metadata.

Stored ASTs use `root.data.cudocAstVersion: 1`; see [storage contracts](./node.md#library-files). `validateAstContract(tree, options?)` checks root/node structure, lists and table-cell constraints; `requireVersion: true` additionally requires the configured version. It does not verify every arbitrary host component's semantics.

A consumer that reads stored trees, a search indexer, a dataset generator or a renderer of its own, can rely on the following under version 1. The version is raised when any of it changes rather than when a node kind is added.

- A `<br />` written in MDX, in prose or in a table cell that is not a cell list, is the mdast `break` node, never a JSX element. In a Markdown document a `<br>` stays the `html` node the parser made, with the tag as its `value`.
- Heading IDs are in `data.hProperties.id`. The `Anchor` element with a `headerLevel` attribute exists only in the low-level component transforms and never in a stored tree, because normalization lowers it. An `Anchor` written in a heading is lowered too while `headingAnchor` takes host syntax, except one carrying a badge under `badge: "off"`, which stays the host's component.
- Document IDs are library paths without the extension, so with `roots` they start with the root's base (`docs/guide/setup`), and every link, embed source and dataset scope uses that form.
- `mdxjsEsm`, `position` and `estree` are absent; expression nodes keep their `value` text.
- Callouts, badges, permalinks, page breaks, table notes (`tableNote`), tabs (`tabs` and `tab`), code blocks with a title or lines (`code`), links made from shared references (`reference`) and lowered native tags (`element`) are the `data.cudoc` kinds above.
- A lowered native tag other than `br`, `a` and `img` is a `strong` (inline) or `blockquote` (block) whose `hName` is the tag and whose `hProperties` are its attributes, marked `kind: "element"`, so read its `hName` before its type. The kinds [presentation](#presentation) adds for the screen (`codeFrame`, `codeTitle`, `tabInput`, `tabLabel`) are never stored, since collection takes them off, in the compiler capture and in the AST export.
- `private` and `imports` live on the manifest entry, not in the tree.

## Presentation

Source: [present.ts](../../packages/cudoc/src/present.ts). Import from `@cudoment/cudoc/present`.

```ts
type TabElements = {
  tabs: string | { name: string; group?: string }
  tab: string | { name: string; value?: string; label?: string; default?: string }
}
type PresentationTarget = {
  host: Host
  format?: "md" | "mdx"
  tabElements?: TabElements | false
}
presentDocument(tree: Root, target: PresentationTarget): void
withoutPresentation<Tree extends Root>(tree: Tree): Tree
resolveTabElements(value: unknown): TabElements | false | undefined
```

Normalization leaves what a document means; `presentDocument` mutates a normalized tree into what `target` draws on screen.

Every `code` node with `data.cudoc.kind: "code"` gets its meta rewritten. The meta starts with the target's own title attribute where it has one, `title=` for `docusaurus` and `filename=` for `nextra` and `docs`, quoted with a quote the title does not hold. Then come the lines as the shortest `{…}` list and the rest of the meta, separated by spaces. The rest is the meta as written, kept in `data.cudocMeta` the first time, without the title and lines as [document options](#document-options) describe, so a form the host reads that normalization did not, such as `showLineNumbers`, stays.

The `docs` profile's code component splits its meta at commas and shows a quote as written, so there the title is left unquoted unless it holds a comma. The rest is read the profile's way, entries separated by commas, and every entry is joined with commas, as `filename=Podfile,{2},showLineNumbers`, whether the source wrote the meta with commas or with spaces.

On any other target, and on `nextra` with `format: "md"`, whose rehype-raw step drops every code block's meta, a block with a title is wrapped in a `blockquote`. The blockquote has `data.hName: "div"`, `hProperties.className: ["cudoc-code"]` and `data.cudoc` `{ kind: "codeFrame", presentation: true }`, and its first child is the title as a paragraph with `hName: "div"`, `className: ["cudoc-code-title"]` and `kind: "codeTitle"`. A block already framed is left as it is, so the function can run again after embeds are spliced in.

A group of tabs not drawn yet is drawn one of two ways: with the site's tab elements, or with radio tabs.

With tab elements, `target.tabElements`, or `{ tabs: "Tabs", tab: "TabsContent" }` on the `docs` host unless that is `false`, the group keeps its place and takes the group component's name as `hName` and `{ [group]: key }` as its properties, with `presentation: true` on its `data.cudoc`. Each tab takes the tab component's name and `{ [value]: value, [label]: title, [default]: true }`, the prop names defaulting to `group`, `id`, `label` and `default`. On an MDX host a capitalized `hName` compiles to a component the page's provider supplies.

A Docusaurus site that registers its `Tabs` and `TabItem` globally maps them as `{ tabs: { name: "Tabs", group: "groupId" }, tab: { name: "TabItem", value: "value" } }`, its `label` and `default` props keeping their names. Tab elements are not used on `nextra` with `format: "md"`, where rehype-raw lowercases every element name, so a `.md` page there gets radio tabs.

Otherwise, before each tab it inserts a radio and its label, both marked `presentation: true`. The radio is a paragraph with `hName: "input"`, `type: "radio"`, `name: "cudoc-tabs-N"`, `id: "cudoc-tabs-N-i"` and `className: ["cudoc-tab-input"]`, plus `cudoc-tab-default` on the default tab; the label is a paragraph with `hName: "label"`, `htmlFor` and `className: ["cudoc-tab-label"]` holding the title.

`N` counts on from the highest group name the tree holds already. No radio carries `checked`: React holds a `checked` radio without a change handler fixed, so the stylesheet shows the default tab until one is checked.

`resolveTabElements(value)` validates the option, throwing for anything but `undefined`, `false` or both entries naming a component (`/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/`) with only the props listed above. On the `docs` host a table note not drawn yet is drawn with the profile's own notes: it is marked `presentation: true` and each of its paragraphs takes `hName: "Footnote"`.

`withoutPresentation` mutates and returns the tree with each node marked `presentation: true` taken off. A frame gives way to its code block, a tab's radio and label go altogether, and a group drawn with tab elements gets its group and tab data back. A table note drawn with the host's notes gets its own data back, and every code block gets the meta it was written with back from `data.cudocMeta`.

`cudoc-remark`'s prepare plugin presents a page after normalizing it, with the configured host and the file's format. The [compiler capture](./adapters.md#compiler-capture) takes the presentation off before storing, and the remark embed plugin presents spliced content with the target the prepare plugin left on the file, or else the host the library's manifest records. The markdown-it plugin presents the page's tree before composing its HTML, after collection has stored it. `cudoc-export` presents a copy of each document as `html`. A stored library, a dataset and the Word file therefore hold the semantics alone.

## Components and rendering

`DocumentOptions.components` maps names to `{ kind: "callout" | "link" | "badge" | "tableNote" | "tabs" | "tab", typeAttribute?, titleAttribute?, urlAttribute?, valueAttribute?, defaultAttribute?, groupAttribute?, itemsAttribute? }`. Attribute defaults are `type`, `title` (`label` on a tab), `href`, `value` and `default`. On a tab, `defaultAttribute` names the boolean that makes it the default; on a group, it names the index or value of the default tab, `groupAttribute` its key and `itemsAttribute` a list of labels its tabs take in order.

The built-in profiles map the components below. User mappings override matching names, and their feature must accept host syntax.

| Profile      | Always                                    | Only while `tabs` takes host syntax                                                |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs`       | `Infobox`, `Link`, `IconLink`, `Footnote` | `Tabs`/`TabsContent` (`valueAttribute: "id"`)                                      |
| `nextra`     | `Callout`                                 | `Tabs` (`itemsAttribute: "items"`, `defaultAttribute: "defaultIndex"`)/`Tabs.Tab`  |
| `docusaurus` | `Admonition`                              | `Tabs` (`groupAttribute: "groupId"`, `defaultAttribute: "defaultValue"`)/`TabItem` |

On every profile a `Badge` component becomes a badge while `badge` takes host syntax.

`staticAttributes(node, literals?)` reads literal strings, boolean attributes and JSON expression values. With `literals`, it also reads an expression built from literals alone, strings in either quote, numbers, booleans, `null`, arrays, plain objects and templates with nothing interpolated, from its parsed `estree`, which a stored tree no longer has. `hasDynamicAttributes(node, literals?)` detects expressions and spreads that cannot be read statically in the same way.

`canonicalCalloutType(type)` maps info/default→note, danger/error→caution, warn→warning. `makeCallout(type, titleNodes, children, position?)` creates the semantic block. `lowerNativeElements(tree)` mutates supported static native JSX into renderable mdast and preserves dynamic JSX.

Import rendering from `@cudoment/cudoc/render` ([source](../../packages/cudoc/src/render.ts)):

```ts
documentToHast(tree: Root, options?: RenderOptions): HastRoot
renderDocument(tree: Root, options?: RenderOptions): string

type RenderOptions = {
  highlight?: (code: string, language?: string, node?: DocumentNode) => string
  components?: Record<string, (node: DocumentNode) => string>
}
```

These `components` are **HTML renderer callbacks**, distinct from semantic mappings and from React components. `highlight` returns a complete HTML fragment; an empty string falls back to plain code markup. Its `node` is the `code` node being rendered, so a highlighter can read the lines `data.cudoc.lines` marks. Unsupported MDX/directive/custom nodes throw.

Module exports are not executed; raw HTML and callback output are passed through without sanitization. Treat this as a renderer for trusted documentation or add a separate sanitization policy in your consumer.

The renderer maps standard mdast and HTML metadata to HAST. For embedded roots it uses `data.cudocEmbedPrefix` to namespace the footnote accessibility label.

The text helpers below come from `@cudoment/cudoc/document`. `nodeText(node)` concatenates values recursively; `visibleHeadingText(node, read?)` excludes badge/permalink children and reads each remaining child with `read`, `nodeText` by default.

`decodeCharacterReferences(text)` replaces every character reference CommonMark reads, `&copy;`, `&#169;` or `&#xA9;`, with what it stands for, as micromark decodes one, and leaves a name HTML does not define as written. `referencedCharacter(node)` is the character an `html` node stands for when it holds one character reference and nothing else, such as the `&#123;` a VitePress library keeps for a brace, and undefined for any other node.

`nodeText` and `visibleHeadingText` keep such a node as written, because what they return is also written back into pages, such as a VitePress `[[toc]]` label or an embed table's title, where Vue would read a decoded `{{`. `readableText(node)` is `nodeText` with such a node read as its character, and `visibleHeadingText(node, readableText)` reads a heading that way. `getNodeText`, `documentTitle`, `documentDescription`, `select.titles` and `tableColumnLayout` matching, the export's contents and Word body text read it as the character too, and `getNodeText` keeps it inline.

A string written into a page keeps the reference and shows it spelled out: an embed table's or tree's title, summary and cell, and a tab label. A tree embed's `order` also compares its titles as written.

Use `getNodeText` below when block boundaries matter. It also respects normalized HTML `hName` block/table boundaries and excludes badge/permalink children from headings, while retaining badges in prose.

### Host stylesheet

Source: [styles.css](../../packages/cudoc/styles.css), imported as `@cudoment/cudoc/styles.css`. It styles the `cudoc-callout`, `cudoc-callout-warning`, `cudoc-callout-caution`, `cudoc-callout-title`, `cudoc-badge`, `cudoc-page-break`, `cudoc-tree`, `cudoc-tree-leaf`, `cudoc-code`, `cudoc-code-title`, `cudoc-table-note`, `cudoc-tabs`, `cudoc-tab`, `cudoc-tab-input`, `cudoc-tab-label` and `cudoc-tab-default` class names the renderer emits, and nothing else.

[Radio tabs](#presentation) lay their labels in one wrapping row with the tabs below; under `@supports selector(:has(*))` only the tab after a checked radio shows, or the default one while none is checked, and a browser without `:has()` shows every tab. Printing shows every tab under its label.

A code block's [title frame](#presentation) puts the title on a washed bar joined to the top of the host's own code block, and a table note is set smaller and fainter than the text around it.

A [tree](../embedding.md#draw-a-tree-of-documents) is drawn as an outline: an item with lines below it shows its disclosure triangle where a leaf shows its bullet. Such an item's `details` loses the box a host gives an authored one, Docusaurus's info alert and Nextra's bordered panel among them. It inherits the page's text colour and, inside Docusaurus's alert, its link colour.

Because it loads inside a host's own page it sets no text colour: body text inherits the host's theme, and only surfaces and accents flip. Its properties are namespaced `--cudoc-wash`, `--cudoc-line`, `--cudoc-accent`, `--cudoc-accent-soft`, `--cudoc-warn`, `--cudoc-warn-wash`, `--cudoc-danger` and `--cudoc-danger-wash`, so a site rethemes the components by redefining those without touching host variables. A `warning` callout takes the `warn` pair and a `caution` callout, which `danger` and `error` are read as, the `danger` pair.

Three theme signals turn the dark palette on:

- `prefers-color-scheme: dark`
- a `dark` class on the root element (VitePress, Nextra)
- `data-theme="dark"` (Docusaurus)

A `light` class or `data-theme="light"` restores the light palette even when the system prefers dark, so a host's own toggle wins in both directions. The palette matches `siteStyles` in [the export adapter](./adapters.md#export), and every surface clears WCAG AA against both a light and a dark inherited text colour.

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

Filters are combined; depths must be integers 1–6. Headings without IDs are skipped. An explicitly requested missing anchor throws; unmatched titles/depths yield no entries.

Results follow document order. Each section is sliced where its heading stands, so a document that repeats an ID yields every such heading's own section rather than the first one's content twice. Section trees are cloned and retain referenced link/image/footnote definitions. `heading` is the original heading reference; clone it before mutation. Child sections are included unless `includeChildren: false`.

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

`projectAst(tree, options?) → Root` validates input, recursively clones and filters nodes and properties, then validates output. `ProjectionOptions` contains optional `excludeNodeTypes`, `excludeComponents`, `stripProperties` string arrays, whose defaults remove nothing. `type` and `children` cannot be stripped. Excluding a node removes its subtree. Components match MDX JSX names, not already-normalized semantic nodes.

`docsDatasetProjection` is an opt-in preset excluding `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `DocDataEmbed`. It does not exclude ordinary Markdown tables. Disk generation is covered in [Node datasets](./node.md#datasets).

## Core helpers

The root barrel exports AST contracts, query helpers, `walk`, section selectors, delimiter helpers and MDX construction utilities. It does not re-export `compileDocument`, `normalizeDocument` or the Node library APIs.

| Entry/source                                                                                                 | Exports and contract                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [/ast](../../packages/cudoc/src/internal/core/ast/index.ts)                                                  | Version constants/resolver, `validateAstContract`, list/parent/table guards and AST types                                                                                                                                       |
| [Root traversal](../../packages/cudoc/src/internal/core/walk.ts)                                             | `walk({ tree, state, preTransforms, postTransforms })`; ordered in-place transforms with ancestor/parent/index context                                                                                                          |
| [Root selectors](../../packages/cudoc/src/internal/core/selectors.ts)                                        | `assertSectionSelector`, `matchesSectionHeading`, `findPreviousHeading`, title/header normalization and inline text helpers                                                                                                     |
| [/syntax](../../packages/cudoc/src/internal/core/syntax/index.ts)                                            | Delimiter validation, extraction, splitting and stripping; heading metadata helpers                                                                                                                                             |
| [/mdx](../../packages/cudoc/src/internal/core/mdx/index.ts)                                                  | Attribute/flow/text element creation, attribute reading/writing, line-break and child conversion helpers; `importedNames(tree)` and `importedNamesFromSource(source)` for the local names a document's `import` statements bind |
| [/transforms/table-cell-list](../../packages/cudoc/src/internal/transforms/table-cell-list/index.ts)         | `transformTableCellList`, parser and cell reconstruction helpers                                                                                                                                                                |
| [/transforms/table-column-layout](../../packages/cudoc/src/internal/transforms/table-column-layout/index.ts) | Layout transform/resolver, table construction, split options and cell splitting                                                                                                                                                 |
| [cudoc-remark/badge](../../packages/cudoc-remark/src/transforms/badge.ts)                                    | Badge transform and option resolution                                                                                                                                                                                           |

Low-level heading/badge transforms can emit named MDX elements. They are building blocks, not the component-free authoring setup; use `normalizeDocument` or the adapter's explicit `syntax` option for that setup.

`TableColumnLayoutOptions` requires `section` (depth/title selector) and `columnHeaders`. Optional `split`, `components`, `spanAttribute` (default `colSpan`), `metadataDelimiters`, `ignoreElements` customize output. The default element mapping uses lowercase HTML tables. Do not configure capitalized table names for portable output unless you provide their semantics/renderers. See the linked source for complete transform-context and layout types.

`TableColumnWidthOptions` (`tableColumnWidths`) is `{ section?, widths, metadataDelimiters?, ignoreElements? }`. `widths` maps header text, compared after the heading metadata and ignored elements such as a badge are removed and spaces collapsed, to a CSS length (`120px`, `6ch`, `20rem`, `25%`). Anything else, an empty map or a non-object rule throws naming the option path. A rule without `section` reaches every table.

Each matching header cell gets `data.hProperties.style: "min-width: <length>"`, exactly what an embed table column's `minWidth` writes, so the HTML site, the paginated formats and the Word writer treat both the same way ([Word column widths](./adapters.md#word-template)). Header cells the rule does not name keep whatever style they had.

Width rules run before layout rules. A layout rule rebuilds the header cells it matches as elements and carries the cell's style into the element's `style` prop merged with the column alignment (`{ textAlign, minWidth }`). Normalization lowers that back to the flattened `text-align:center;min-width:18rem` string.
