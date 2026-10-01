# Node APIs

**English** | [한국어](./node.ko.md) · [API reference](./README.md)

These entry points read or write files and belong in Node.js build/server code. Relative filesystem paths resolve from the current working directory unless otherwise noted.

## Collection

Source/import: [library.ts](../../packages/cudoc/src/node/library.ts), `@cudoment/cudoc/node/library`. The root helpers below (`SourceRoot`, `ResolvedRoot`, `resolveRoots`, `documentIdOf`, `libraryPathOf`, `sourceFileOf`) are also exported from [roots.ts](../../packages/cudoc/src/node/roots.ts), `@cudoment/cudoc/node/roots`, which loads no compiler; the remark embed plugin imports them from there so a host can load its configuration without the MDX stack.

```ts
buildDocuments(options: BuildDocumentsOptions): Library
buildDocumentsAsync(options: Omit<BuildDocumentsOptions, "compiler"> & {
  compiler: AsyncDocumentCompiler
}): Promise<Library>
loadLibrary(outDir?: string, compiler?: DocumentCompiler, roots?: string | SourceRoot[], options?: { cache?: boolean }): Library
resolveRoots(options: { sourceRoot?: string; roots?: SourceRoot[] }): ResolvedRoot[]
documentIdOf(roots: ResolvedRoot[], file: string): string | undefined
libraryPathOf(roots: ResolvedRoot[], file: string): string | undefined
sourceFileOf(roots: ResolvedRoot[], libraryPath: string): string | undefined
globToRegExp(pattern: string): RegExp
globMatcher(patterns: readonly string[] | undefined, option: string): (libraryPath: string) => boolean
```

`globToRegExp` compiles one pattern of the glob dialect `exclude` and `private` use, from [glob.ts](../../packages/cudoc/src/node/glob.ts): `*` and `?` within a segment, `**` for any number of segments, and a pattern without `/` matching a file or directory name anywhere; a trailing `**` also matches the directory itself. `globMatcher` tests a library path against a list of them and names `option` when a pattern is not a non-empty string. `cudoc-export` reads a navigation folder's `exclude` with the same dialect.

`BuildDocumentsOptions` extends `DocumentOptions`:

| Property      | Default                    | Meaning                                                                                                           |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `sourceRoot`  | One of the two is required | One input directory at the top of the library; shorthand for `roots: [{ dir: sourceRoot }]`                       |
| `roots`       | One of the two is required | `{ dir, base? }[]`: directories to collect, each under its base. Giving both `sourceRoot` and `roots` is an error |
| `exclude`     | `[]`                       | Glob patterns for files and directories that are not documents; matched against library paths                     |
| `private`     | `[]`                       | Glob patterns for documents collected and checked but never exported or put in a dataset                          |
| `outDir`      | `.cudoc/documents`         | Owned library output directory                                                                                    |
| `routeBase`   | `/`                        | Prefix for default document routes                                                                                |
| `routeSuffix` | `""`                       | Suffix such as `.html`                                                                                            |
| `routes`      | `{}`                       | Overrides keyed by extensionless document ID                                                                      |
| `compiler`    | Standalone compiler        | Actual host compiler callback when supplied                                                                       |
| `compilerId`  | Required with `compiler`   | Caller-managed compiler/configuration identity                                                                    |
| `previous`    | none                       | A library collected earlier; documents whose text is unchanged are taken from it instead of compiled              |

Every root scans `.md` and `.mdx` recursively, skipping dot entries and `node_modules` and rejecting symlinks. A root's `base` is normalized by dropping surrounding slashes; it may hold several segments (`docs/v2`), may be empty, and may not contain `.`, `..`, `?` or `#`. Two roots may share a base, and a base may extend another (`docs` and `docs/api`). A root's directory may sit inside another root's, and the inner root then owns its files: the outer root's scan leaves that directory to it, as it does a symbolic link in its tree that leads to another root's directory instead of rejecting it, so each file is collected once, under the inner root's base. The same directory may not be listed twice, counting one listed once as it is and once through a symbolic link. `resolveRoots` performs this resolution and is what every consumer calls.

A document's **library path** is its root's base followed by its POSIX path under that root's directory, and its ID is the library path without the extension: `content/ko/guide.md` collected with `{ dir: "content", base: "docs" }` is `docs/ko/guide.md` and `docs/ko/guide`. With `sourceRoot` the base is empty, so an ID is the file's path under that directory. `StoredDocument.sourcePath` is the library path. Library paths are the coordinate system for everything that names documents — links, embed `sources`, the checker, the exporter and `exclude`/`private` patterns — so a root-relative link `/terms/token.md` names the document `terms/token` whichever directory it was read from, and a relative link resolves in library coordinates too: it crosses from one root into another exactly when the bases mirror the directory names, and otherwise reports as missing. `documentIdOf` and `libraryPathOf` map a file to that coordinate through the innermost root containing it, comparing the root directories and the file by their real paths, so a host that reports the real path of a file under a root configured through a symbolic link (or the other way round) finds the same document, and a nested root reached through a link still owns its files. `sourceFileOf` maps a library path back to a file, trying roots with the longest matching base first and preferring one that exists; a file another root owns is not a match, so under a nested root with a base of its own the outer root's spelling of the file names nothing, while a file a root reaches through a symbolic link of its own, under a dot directory for instance, stays that root's. Extension and case collisions across all roots are errors naming both files. Default URLs are `routeBase + id + routeSuffix` with the joining slash normalized, so bases become URL prefixes. When `routeSuffix` is `""` or `"/"`, an index document takes its directory's URL instead, as the hosts serve it: `index` under `routeBase: "/docs"` is `/docs/` and `guide/index` is `/docs/guide/`. Two documents whose routes differ only by a trailing slash fail with `duplicate document route`, as two equal routes do. Overrides must be unique root-relative pathnames, starting with `/` but not `//`, and containing no `?` or `#`. Frontmatter slugs are not inferred.

Glob patterns are matched against library paths with a small dialect: `*` and `?` within a segment, `**` for any number of segments, and a pattern without `/` matching a file or directory name anywhere. A trailing `/**` also matches the directory itself, so an excluded directory is not entered and a symlink inside it is never seen. There are no brace sets, character classes or negations; an empty pattern or one containing `..` is an error. `exclude` decides what is a document at all; `private` marks documents that are collected, checked and embeddable but carry `private: true` in the library and the manifest, which `cudoc-export` and `generateDataset` read.

Collection without a custom compiler is allowed for `markdown`, `html`, `next`, or an omitted host. Other host profiles require a callback. A Next.js project with additional plugins also needs a matching callback to retain parity.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler has the same arguments and returns Promise<CompiledDocument>.
```

`filePath` is absolute and `options.format` is inferred per file. Return a position-bearing tree before export removes source positions. Collection prints returned diagnostics to stderr with the relative file and line. It snapshots source ranges and validates/version-tags the export. Nothing is written until every document has compiled; the library is then published in one [`publishDirectory`](#storage) step, so a document that fails to compile leaves the previous library as it was. The publication replaces the whole directory, so an `embeds.json` written by an earlier preparation does not survive it: `prepareEmbeds` writes it again, and [`collectDocuments`](#watching) publishes both together. The async builder compiles each file before publishing and retains the async compiler for replacements.

With `previous`, a document is taken from that library as it is — tree, snapshot, front matter, `private`, `imports` — when the configuration hash is the same, its library path is the same and its source text hashes to the stored hash; everything else compiles as usual, a document that disappeared from disk is dropped, and the published directory is complete either way. A reused document's diagnostics are not printed again. The result carries `incremental: { compiled, reused }` naming the document ids each way. A configuration change — options, routing, roots, patterns, extractor versions, `compilerId`, the `@cudoment/cudoc` version — reuses nothing, which is also why a host upgrade must change `compilerId`: the hash cannot see what the compiler does.

`Library` has `documents: StoredDocument[]`, `options`, `configuration` (hash), `bases: string[]` (the roots' bases as collected, `[""]` for one root at the top), optional runtime `roots: ResolvedRoot[]` (absolute `dir`, normalized `base`), `compiler`, `asyncCompiler`. Each `StoredDocument` has `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`, `private: true` when a `private` pattern matched, and `imports: string[]` when the document imports anything: the local names its `import` statements bind, read from the compiler's `mdxjsEsm` estree before the export drops those nodes (`CompiledDocument.imports`, computed by `importedNames(tree)` from `@cudoment/cudoc/mdx`, also re-exported by `/markdown`). A host capture records the same, and for an `.mdx` file also scans the source with `importedNamesFromSource(source)` — top-level `import` statements outside fenced code, parsed as a module — because a host such as Nextra hoists the ESM out of the tree before the capture sees it. Compiler functions and the absolute root directories are not serialized; the manifest records each root's `base` only.

`loadLibrary` defaults to `.cudoc/documents`, validates the manifest version, AST contract and stored hashes, and reconstructs the library. It does not compare files on disk with current source documents or infer current compiler settings. Recollect to refresh source/configuration. Supply `roots` — a directory for the single-root shorthand, or the same `{ dir, base }` list collection used — to restore where documents live, which replacement compilation and asset resolution need; the bases given must be the ones recorded in the manifest, because the IDs were derived from them, and a mismatch is an error naming the recorded bases. Pass the original sync compiler for replacement, or attach the original callback to `library.asyncCompiler` and use async APIs. A preloaded library used only with prepared embeds needs no compiler. `{ cache: true }` keeps the loaded documents in memory per resolved `outDir` and returns the same `documents` array while `manifest.json` reads back byte for byte the same; a changed manifest, which every recollection produces, loads afresh, and the `roots` given are still checked against the recorded bases on every call. Without the option each call reads the files again. A server that loads the library on every request — a route handler rendering embeds, a search endpoint — uses the cached form; a build step that runs once does not need it.

## Library files

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  documents/<id>.json
  sources/<id>.json
  embeds.json              # Added by prepareEmbeds and collectDocuments
```

| File                  | Contract                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 2`, configuration hash, document options, optional compiler ID, `roots: [{ base }]`, per-document metadata and hashes |
| `documents/<id>.json` | Versioned mdast root; `data.cudocAstVersion: 1`; export strips `position`/`estree` and drops `mdxjsEsm`                               |
| `sources/<id>.json`   | Original text, SHA-256 hash, format and section offsets                                                                               |
| `embeds.json`         | `schemaVersion: 2`; prepared embedded AST blocks, the documents each block read, and freshness metadata                               |

Manifest document entries contain `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`, `private: true` for a private document, and `imports` — the local names the document's own `import` statements bind — when it has any. AST/snapshot hashes cover `JSON.stringify` of their objects; the source hash covers original text. `configuration` hashes options, routing, the root bases, the `exclude` and `private` patterns, the extractor versions, the compiler identity and the `@cudoment/cudoc` version, so changing any of them invalidates prepared embeds. A library and its `embeds.json` are always written together with one hash, so they keep agreeing after an upgrade until the next collection, which reuses nothing and replaces both; nothing compares the hash with the running release when a library is read. `LIBRARY_SCHEMA_VERSION` exports the current version; a manifest with another version is rejected with "incompatible document manifest". Use public functions to produce these files; do not hand-edit them.

```ts
type SourceSnapshot = {
  text: string
  hash: string
  format: "md" | "mdx"
  sections: Record<
    string,
    {
      start: number
      end: number
      ownEnd: number
      dependencies: [number, number][]
    }
  >
}
```

Offsets use JavaScript string indexing into the file's own text, `\r\n` line endings included, on every host. `start` begins at the heading; `end` is the next same/shallower heading or document boundary; `ownEnd` ends before a child heading. An id given to more than one heading records the first heading's range, the one a link to it reaches, so a `replace` rule on that id throws `cudoc: <document> gives #<id> to <n> headings, so a replace rule cannot tell which section to rewrite; give them distinct ids` rather than rewrite the first section twice. A heading that is not a child of the document root starts its range at or after the marks of the blocks around it on its own line, which are read from that line itself, since a remark host records the heading after them and a markdown-it host from the line's start. A rule rewrites the section's text as it reads on its own, cut by `sectionText` in [replace.ts](../../packages/cudoc/src/node/replace.ts): in a list item the item's marks and, on every later line, the item's indentation (the column its content starts at: the heading's, or for a heading on a later line of the item that of the line opening the item, one past the marker when the marker stands alone on that line, tabs to the next multiple of four) are taken off, as the parser took them off the item's content, so a section in a list item, however deep, is rewritten into the structure that was collected. Where something of the block would stay in the text, `unreplaceableSection` in the same file refuses the rule instead of compiling a copy of another structure: a quote's or callout's `>` before the heading, a footnote's indentation, and a section that runs to the end of a component, a `:::` directive or a markdown-it container and whose last line is that block's closing `:::` or tag. The error is `cudoc: <document>#<id> starts inside <a quote | a callout | a footnote | a container | a component | a <type> block>, and <reason>, so a replace rule cannot rewrite it; …`; it is decided from the stored tree and source alone, and `cudoc check` reports the same as `unreplaceable-embed-section`. A section followed by another heading inside its component or container, and every top-level section, are rewritten as usual; the section still embeds without rules, as its collected tree. Dependency spans locate definitions in the original source. These ranges enable original-Markdown replacement even though exported AST positions are removed.

## Embedding

Source/import: [resolve-embed.ts](../../packages/cudoc/src/node/resolve-embed.ts), `@cudoment/cudoc/node/resolve-embed`. Three helpers from [tree.ts](../../packages/cudoc/src/node/tree.ts) are exported beside `resolveTree`, so another consumer orders and names documents exactly as a tree does, as `cudoc-export`'s navigation does: `nfc(value)` normalizes to NFC, `documentName(id)` is an id's last segment or, for an `index`, its folder's name, and `compareNames(a, b)` orders text with letter case ignored, a run of digits read as its number (`Step 2` before `Step 10`) and code points otherwise, which puts Hangul syllables in dictionary order the same on every machine.

```ts
type Replacement = { find: string; replace: string; regex?: boolean; flags?: string }
type CellValue =
  | "title" | "summary" | "parent"
  | { table?: number; row: number; column: number; skipTablesWithHeaders?: string[] }
  | { extractor: string }
type TableColumn =
  | "title" | "link" | "summary"
  | { header?: string; value: CellValue; link?: "section" | "parent" | "document"; minWidth?: string }
type TreeRender = {
  type: "tree"
  open?: number // default 1
  print?: number // default: every level
  depth?: number // default: every level
  headings?: number // 0–5, default 0
  order?: string[]
  columns?: TableColumn[] // default DEFAULT_TREE_COLUMNS, ["link", "summary"]
}
type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: TableColumn[] } | TreeRender
  replace?: Replacement[]
}
type EmbedContext = { documentId: string; prefix?: string }
type EmbedRow = {
  document: StoredDocument
  section: { anchorId?: string; title: string; tree: Root }
  parent?: { title: string; anchorId?: string }
  url: string
}
type ExtractedCell = { text: string; url?: string }
type TableExtractor = {
  version: string
  extract(
    row: EmbedRow,
    context: { library: Library; documentId: string; column: TableColumn; node?: TreeNode },
  ): string | ExtractedCell | undefined
}
type TreeNode = {
  id: string // documentId, or documentId#anchorId for a heading
  kind: "document" | "heading"
  documentId: string
  anchorId?: string
  name: string
  title: string
  url: string
  sourcePath: string
  level: number
  cells: ExtractedCell[]
  children: TreeNode[]
}
type TreeSource =
  | { folder: string; documents: StoredDocument[] }
  | { document: StoredDocument; anchor?: string }

parseEmbedSpec(value: string): EmbedSpec
resolveDocumentReference(library: Library, reference: string, from: string): {
  document: StoredDocument; anchor?: string
}
resolveEmbed(library: Library, spec: EmbedSpec, context: EmbedContext): Root
resolveDocumentEmbeds(library: Library, documentId: string): Root
buildEmbedRow(document: StoredDocument, anchorId: string | undefined, tree: Root): EmbedRow
extractCell(library: Library, column: TableColumn, row: EmbedRow, context: EmbedContext, node?: TreeNode): {
  cell: ExtractedCell; problem?: string
}
buildEmbedTable(library: Library, columns: TableColumn[], rows: EmbedRow[], context: EmbedContext): Root
resolveTree(library: Library, spec: EmbedSpec, context: EmbedContext): TreeNode[]
resolveTreeSource(library: Library, reference: string, from: string, page?: string): TreeSource
buildEmbedTree(nodes: TreeNode[], render: TreeRender): Root
namesTreeNode(entry: string, node: Pick<TreeNode, "name" | "title">): boolean
// Async counterparts return Promise<Root>:
// resolveEmbedAsync(library, spec, context)
// resolveDocumentEmbedsAsync(library, documentId)
```

`parseEmbedSpec` parses YAML and validates supported top-level, selection and replacement keys, source lists, rendering choices and replacement rules. Unknown keys are rejected at all three levels and the message lists the known ones; `flags` without `regex: true` is an error rather than a silently ignored value. `parseEmbedBlock(value, documentId, number?)` wraps it so a failure names the document, the block and, for a parser error, its line and column. `sources` must be nonempty. The default render is `section`; default table columns are `DEFAULT_TABLE_COLUMNS`, title/link/summary. A table column is a shorthand name or a mapping validated key by key: `value` is required and is one of the three names, a cell coordinate mapping (`row` and `column` non-negative integers, optional `table` index and `skipTablesWithHeaders` strings) or `{ extractor }` alone; `link` is one of `section`, `parent`, `document`; `minWidth` is a CSS length matching a number and one of `px`, `rem`, `em`, `ch`, `%`. `render` is `section` or a mapping whose `type` is `table` or `tree`, anything else failing with `cudoc: render must be "section" or a mapping with type: table or type: tree`; a table accepts no key beyond `type` and `columns`, and a tree none beyond `type`, `open`, `print`, `depth`, `headings`, `order` and `columns`. A tree's `open` is an integer of at least 0, `print` and `depth` integers of at least 1, `headings` an integer from 0 to 5, `order` a list of non-empty strings naming nothing twice in NFC and holding `...` at most once, and its columns are validated as a table's; a tree with `select` or `replace` fails, since it copies no section text. Selection behavior is defined in [document queries](./document.md#sections-and-queries).

A table render produces one `EmbedRow` per selected section through `buildEmbedRow`, read before ids are rebased so a cell's link points into the source document: `section.title` is the heading's visible text (or the document title for a whole document), `parent` is the nearest shallower heading above the section in the source tree, and `url` is the document route plus the anchor. `extractCell` turns one column into text and an optional link: `title`, `summary` (first paragraph among the section's direct children, plain text), `parent`, a table cell (tables inside the section in document order, minus those whose header row contains a `skipTablesWithHeaders` name; `row` 0 is the header row; text via `nodeText`) or an extractor's return value. A column's `link` resolves to the section's `url`, the parent heading's address (its anchor when it has one, else the document route) or the document route; an extractor's own `url` takes precedence over the column's `link`. It is written as it should appear on the page the embed lands on, `context.documentId`, however deeply the table or tree is nested: a copy around it changes only a bare fragment that names one of the copy's ids, to that id's new name. When the value is missing — no paragraph, no heading above, too few tables, rows or cells, an extractor returning `undefined` or `""` — `cell.text` is `""` and `problem` says what was expected and what the section has. `buildEmbedTable` writes the header row with `data.hProperties.style` of `min-width: <minWidth>` on any column that sets it, then one row per `EmbedRow`. An `{ extractor }` column naming an extractor the library does not carry throws.

Extractors come from `BuildDocumentsOptions.extractors`, a name-to-`{ version, extract }` map: `version` must be a non-empty string and enters the configuration hash as `{ name: version }` sorted by name, so a changed extractor recollects like a changed compiler; the functions live on `Library.extractors` at runtime and are not serialized, and a loaded library has none, which is fine for prepared embeds and an error only when resolving a `{ extractor }` column anew. Checking resolves table embeds anew, so `cudoc check` puts the `extractors` of its configuration on the library it loads; a program that checks a loaded library sets `library.extractors` itself.

A tree render resolves each source with `resolveTreeSource`. A path ending in `/` names a folder, relative to `from` or from the top of the library with a leading `/`; it fails with `cudoc: a folder source takes no anchor: <reference>`, `cudoc: embed source escapes root: <reference>` or, when no document is below the folder, `cudoc: no documents in folder <reference> referenced from <from>`; given `page`, the document the tree lands on, a folder whose documents are all `private` also fails, with `cudoc: folder <reference> referenced from <from> holds only private documents, which a tree on <page> leaves out`, unless that page is private. Any other path names a document as `resolveDocumentReference` reads it, the id also matched in NFC, and a missing document whose path is a folder holding documents adds `; a folder source ends with /, as in <path>/` to the missing-document message. The documents nest as [tree.ts](../../packages/cudoc/src/node/tree.ts) works it out once per document list, comparing ids in NFC: walking up from a document's own folder, its parent is the first document that stands for a folder and is not the document itself, `<folder>.md` before `<folder>/index.md`, with the library's top standing as `index`. So `X.md` takes the documents of `X/`, `X/index.md` takes the rest of `X/` when there is no `X.md` and goes under `X.md` when there is, and a folder nothing stands for is passed through. A folder source's first level is the documents inside it whose parent is not inside it as well, the document standing for the folder left out; a document source is one line, and a source with an anchor is one line for each heading `collectSections` finds with that anchor, carrying its own deeper headings within `headings`. Under a document line come, while the level is within `depth`, its headings of depths 2 to `headings + 1` in document order, nested by depth (one past `depth` takes the ones under it out with it), and then the documents whose parent it is. Unless the page the tree lands on, `context.documentId`, is `private`, an id that names no collected document counting as a page that is not, a `private` document is left out where a folder source or a parent brings it in, with the lines below it, since the export writes no private document to link to; a document source names its document whatever it is. The first level follows `sources` in the order written. The documents a folder source brings in, and the documents under any line, are sorted by `title`, then `name`, then `id`, ignoring letter case, reading a run of digits by its value and comparing code points otherwise, so the order does not follow the locale. `order` then moves the first level, keeping the order of equal ranks: a line takes the position of the first entry that `namesTreeNode` matches, its `name` or its `title` equal to the entry in NFC, and any other line the position of `...`, or the end without one.

A document line's row has no anchor, and its `url` is the document route. Its title is the visible text of the document's `#` title, the first depth-1 heading among the top-level blocks or inside a top-level `header` element, where Docusaurus puts the heading it reads the page title from; else a non-empty string `title` in the front matter; else `name`, the file name without its extension, or the folder's for an index document, in NFC. Its `section.tree` runs from the block holding that title to the next one, or is the whole document without one, so `summary` is the first paragraph after the title. A heading line's row is `buildEmbedRow` of its section, and its `name` is its title in NFC. Cells are filled after the tree is built, deepest line first, so an extractor's `context.node` has every line below it complete; `extractCell` passes its `node` argument on as that `node`. A tree's `data.cudocDependencies` are the documents its lines were read from, with `"*"` when a column is an `{ extractor }`. A tree copies no section text, so nothing in it is expanded or namespaced; a tree inside a copied section is resolved from the document the copy came from, and its links are already addresses on the page, which the copies around it treat as the rebasing rule below says.

`buildEmbedTree` writes an unordered `list` with `spread: false`, `data.cudoc.kind: "tree"` and `hProperties` of `className: ["cudoc-tree"]`, plus `data-cudoc-print` when `print` is set. A line with lines below it is a `listItem` holding a `blockquote` with `hName: "details"`, and `hProperties.open: true` when its level is at most `open`, whose children are the line as a `paragraph` with `hName: "summary"` and the nested `list`; a line without is a `listItem` with `className: ["cudoc-tree-leaf"]` holding the line as a `paragraph`. A line is its non-empty cells joined by `·`, a cell with a `url` as a `link`, or the title alone when every cell is empty. `@cudoment/cudoc/paged` exports what the paginated writers read it by: `TREE_KIND`, `TREE_CLASS`, `TREE_PRINT_ATTRIBUTE`, `isTree(node)` and `treePrintDepth(value)`, the print depth or `Infinity`.

References resolve relative to `context.documentId`, or from the document root when beginning with `/`. `.md`/`.mdx` and `#anchor` are supported; the anchor is percent-decoded, and a `%` that is not an escape fails with `cudoc: embed source has a malformed percent-escape: <reference>`. URLs, backslash paths, root escapes and missing documents fail. Documents are looked up through an index built once per document list, so resolving every block of a large library does not scan the list for each reference. An anchorless source without a selector uses its whole document.

Resolution clones source ASTs. When replacement is requested, it reads the original selected source range, applies rules in order and recompiles with the original compiler/options. Literal replacement uses split/join (all occurrences); regex uses JavaScript `RegExp`, default flags `g`. Dependencies outside the selected range are appended unchanged. The original source and AST are not mutated. Async APIs retain an async compiler through a per-resolution compile cache. The returned root carries `data.cudocEmbedPrefix`, `cudoc-<document id>-<prefix or embed>-` with the id spelled by [`idToken`](./document.md#document-options), which the renderer uses to namespace footnote labels, and `data.cudocDependencies`: the sorted ids of every document the resolution read, the fence's sources and those of every embed nested in them, plus `"*"` when a `{ extractor }` column ran, since an extractor may read any document; for a tree, the documents its lines were read from.

IDs, footnotes and definitions are namespaced; links/images and supported raw HTML attributes are rebased. Each node is rebased once, by the innermost copy that holds it. A node an inner copy already rebased, or a table or a tree wrote, holds addresses on the page, so a copy around it renames its ids, points a bare fragment that names one of the copy's ids at that id's new name, and leaves every other address as it is: read again as a source path, a route could name another document when `routes` gives one document another's path, and a path that climbed out of the library would be spelled from the wrong directory. The raw HTML attributes are `href`, `src`, `poster`, `data`, `xlink:href` and each candidate of `srcset`, which keeps its width or density, the same resources the exporter copies, and the matching `hProperties` of a lowered element (`srcSet` among them) are rebased alike. A fragment link keeps pointing into the copy when the copy carries that id and otherwise names the source document's route with the fragment. A link with no path — `?tab=2`, or an empty `href` — names the source document it was copied from, not that document's directory. A relative path resolves against the source document's library path; a path naming a collected document by its library path or id (`/guide/setup.md`, `/guide/setup`, `/guide/setup/`), or naming the directory of an index document (`/guide/` for `guide/index`), takes that document's route, and any other path stays as the normalized root-relative path. A relative path that climbs out of the library root, `../../outside.png` from `internal/notes.md`, names no library path and would name another file clamped at the root, so it is spelled from the embedding document instead (`../outside.png` in `guide.md`): from the two files' own directories when the library has its roots, which reaches the same file, and from the library paths otherwise, worked out on the paths alone rather than against the working directory. A directory keeps its trailing slash, which names its index. It is left as written when the embedding document is not known. A directory spelled with its trailing slash names its index document even beside a document of the directory's own name, which the spelling without one names. A `.` or `..` path names a directory the same way. A JSX element whose attributes `require()` a relative module, `./` or `../` after any webpack loaders, as Docusaurus writes a Markdown image ([`data.cudocImage`](./document.md#semantic-ast)) or a link to a local file, has that path re-expressed from the directory of the file the copy lands in, read as the JavaScript string it is and written back as one escaped for its own quotes, once however deeply the copy was nested, so a page in another directory can still resolve it. The directories are the files' when the library has its roots, and the library paths' otherwise, which match only where every root's base mirrors its directory; when the embedding document's id names no collected document, the path is left as collected. Missing sections, circular dependencies, incompatible replacements and depth beyond 64 fail with context. Use different `prefix` values when combining independent `resolveEmbed` results. The whole-document and preparation APIs number their own embed blocks.

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { resolveEmbed } from "@cudoment/cudoc/node/resolve-embed"
import { renderDocument } from "@cudoment/cudoc/render"

const library = loadLibrary(".cudoc/documents")
const tree = resolveEmbed(
  library,
  {
    sources: ["reference.md"],
    select: { depth: 2 },
    render: { type: "table" },
  },
  { documentId: "index", prefix: "reference-summary" },
)
const html = renderDocument(tree)
```

### Tree data

`resolveTree(library, spec, context)` returns the lines a tree embed draws, for a program that writes the tree in a form of its own, such as an outliner that keeps it as blocks in a page it generates. `spec` is an embed whose `render` is a tree, validated as `parseEmbedSpec` validates one; any other render throws `cudoc: resolveTree needs an embed whose render is a tree`, and a source that names nothing throws what the resolver throws. `context.documentId` is where relative sources resolve from and what extractors receive, and `prefix` is not used. Every level down to `depth` is there, whatever `open` and `print` say. The result is plain data, so the same library and spec give the same `JSON.stringify` output, which a program that hashes what it wrote can rely on. `buildEmbedTree(nodes, render)` turns the lines into the mdast `resolveEmbed` produces, so a program that edits the lines first still renders them as an embed would. The example below reads the library `cudoc collect` published to `.cudoc/documents` and prints the tree as an outliner's indented blocks.

```js
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { resolveTree } from "@cudoment/cudoc/node/resolve-embed"

const library = loadLibrary(".cudoc/documents")
const lines = resolveTree(
  library,
  { sources: ["/projects/"], render: { type: "tree", columns: ["summary"] } },
  { documentId: "index" },
)
const outline = (nodes, indent = "") =>
  nodes.flatMap((node) => [
    `${indent}- [[${node.name}]] · ${node.cells[0].text}`,
    ...outline(node.children, `${indent}\t`),
  ])
console.log(outline(lines).join("\n"))
```

A loaded library carries no extractors, so a program sets `library.extractors` before resolving a tree whose columns name one, as for a table. A total across levels comes either from an extractor that reads `context.node`, as [Totals from the levels below](../embedding.md#totals-from-the-levels-below) shows, or from walking the returned lines and adding their values up.

## Prepared embeds

Source/import: [prepare-embeds.ts](../../packages/cudoc/src/node/prepare-embeds.ts), `@cudoment/cudoc/node/prepare-embeds`.

```ts
prepareEmbeds(library: Library, outDir?: string, options?: { previous?: PreparedEmbeds }): Promise<PreparedEmbeds>
readPreparedEmbeds(outDir: string, documentId: string, source: string): PreparedEmbeds
embedKey(documentId: string, value: string, index: number): string
expandPreparedEmbeds(
  tree: Root,
  target: PreparedTarget | (() => PreparedTarget),
  onBlock?: (block: Root, documentId: string) => void,
): Root
type PreparedTarget = { outDir: string; documentId: string; source: string }
```

`prepareEmbeds` visits fenced embeds in all collected documents, resolves them asynchronously and atomically replaces `embeds.json`. Every block is resolved before anything is written: a single block that fails is thrown as `cudoc: <sourcePath>, embed <number>: <message>` with the resolver's error as its `cause`, and several as one `AggregateError` whose `errors` are the individual failures and whose message is `cudoc: <n> embeds could not be prepared:` followed by a line per block (`<sourcePath>, embed <number>: <message>`). Nothing is written when any block fails. Its default `outDir` is `.cudoc/documents`, **not inferred from the library**; pass your custom collection path explicitly.

`PreparedEmbeds` contains `schemaVersion: 2`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>` and `dependencies: Record<string,string[]>`, the `cudocDependencies` of each block under the same key. Keys are `documentId:index:sha256(fenceValue)`, with block numbering starting at 1. `readPreparedEmbeds` checks schema, manifest configuration, current document source hash and manifest document hashes. Missing or stale data throws and requests recollection; a file written by an earlier version is stale. `embeds.json` and `manifest.json` are parsed once per resolved `outDir` and kept while neither file's inode, size and modification time change, so a host that asks once per page, or once per block, does not parse them again; every publication replaces both, so the next call after a recollection reads the new files. The returned object is shared between calls: copy a block before putting it into a tree of your own.

`expandPreparedEmbeds` is the splice every host integration performs: it replaces each `cudoc-embed` fence in `tree`, in document order, with the children of a copy of its prepared block, and returns the same tree, modified in place. `target` names the published library (`outDir`), the embedding document and its source as collected; it is read only when the first fence is met, so a document without embeds needs no library, and a function defers the work of finding the target until then. `onBlock` receives each copy before it is spliced in. A fence without a prepared block throws `cudoc: prepared embed missing in <id>; recollect documents`. The remark embed plugin, the markdown-it adapter and `cudoc-export`'s `library` mode all splice through it.

With `previous`, a block is taken from that result unresolved when four things hold: the configuration is the same, the set of document ids is the same (a document added or removed changes what links inside any block resolve to), the embedding document's hash is unchanged, and every id in the block's `dependencies` hashes as it did. A block whose dependencies include `"*"` always resolves again. The written file is complete either way; only the work is saved.

`buildDocuments` followed by `prepareEmbeds` publishes twice, the library and then its `embeds.json`. A preparation that fails in between leaves a library without prepared embeds, and a host build asks for recollection until a preparation succeeds. [`collectDocuments`](#watching), which `cudoc collect` runs, prepares into the staging directory of the library's own publication instead, so the library and `embeds.json` are replaced together or not at all.

## Watching

Source/import: [watch.ts](../../packages/cudoc/src/node/watch.ts), `@cudoment/cudoc/node/watch`.

```ts
type CollectConfig = Omit<BuildDocumentsOptions, "compiler"> & {
  compiler?: (...parameters: Parameters<DocumentCompiler>) => CompiledDocument | Promise<CompiledDocument>
}
type CollectionState = { library?: Library; prepared?: PreparedEmbeds }
type CollectionPass = {
  library: Library; prepared: PreparedEmbeds
  documentCount: number; compiled: string[]; reused: number
  blocks: number; reusedBlocks: number; outDir: string; elapsed: number
}
collectDocuments(config: CollectConfig, previous?: CollectionState): Promise<CollectionPass>
previousCollection(outDir?: string): CollectionState
watchDocuments(config: CollectConfig, options?: {
  debounce?: number; reuseOutput?: boolean
  onPass?(pass: CollectionPass): void; onError?(error: unknown): void
}): { ready: Promise<void>; close(): void }
```

`collectDocuments` is one pass of what the CLI's `collect` does: compile the library — through the async builder when the config has a `compiler`, which may return a promise or a value — resolve its embeds, and publish both to `outDir` in one [`publishDirectory`](#storage) transaction, handing `previous.library` and `previous.prepared` to the two steps so unchanged documents and unaffected blocks are reused. Nothing is written until every embed has resolved, so a pass that fails leaves the previous library and its `embeds.json` in place, still matching each other. The pass reports the document ids it compiled (every id on a full pass), how many documents and blocks it reused, and its wall-clock time. `previousCollection(outDir)` loads what a finished run left in `outDir` — the library through `loadLibrary`, the preparation when its schema is current — and returns `{}` for anything missing, unreadable or incompatible, so a new process continues from the last run.

`watchDocuments` runs a pass, then another whenever a `.md` or `.mdx` file under any root is created, changed, renamed or deleted, after `debounce` milliseconds of quiet (default 150). A change to a directory, or to an entry that is no longer there, starts a pass too, because it may be a directory renamed, moved or deleted with documents inside; the entry is looked at on disk rather than judged by its name, so `v1.5/` counts; changes under dot entries and `node_modules`, which collection never reads, are ignored. It uses `fs.watch` recursively on each root directory. A change during a pass queues one more pass. A failed pass — a document that does not compile, an embed whose source is missing — goes to `onError`, the state of the last good pass is kept for the next one, the output directory keeps that pass's library and embeds, and watching continues. An error the file watcher itself emits, such as the system refusing more watched files or a root being deleted, goes to `onError` as well rather than ending the process. Without `onError`, errors are printed to stderr. Unless `reuseOutput: false`, the first pass starts from `previousCollection(outDir)`. `ready` settles when the first pass is over, whether it succeeded or failed, and after any pass a change during it queued. It does not say that changes are reported yet: on macOS the recursive watch starts a moment after the call, and a file changed in that moment, after the first pass read it, may go unreported and is then collected by the pass the next change starts. `close()` stops the watchers, and a pass in progress finishes.

## Reference checking

Source/import: [node/check.ts](../../packages/cudoc/src/node/check.ts), `@cudoment/cudoc/node/check`; [node/report.ts](../../packages/cudoc/src/node/report.ts), `@cudoment/cudoc/node/report`.

`checkReferences(library: Library, options?: CheckOptions): CheckResult` walks every document and returns `{ issues, documentCount, checkedReferences }`. It reads only; nothing is written and the library is not modified.

`ReferenceIssue` carries `code`, `severity` (`"error"` or `"warning"`), `documentId`, `sourcePath`, `message`, `reference` (the author's own text), an optional `position`, and for `missing-anchor` and `missing-embed-anchor` an `available` array naming the anchors the target document really has; for `missing-embed-anchor` these are its heading ids only, since an id raw HTML declares can be linked to but starts no section to embed. For `unmatched-tree-order`, `available` holds the titles on the tree's first level. Codes are `missing-document`, `missing-anchor`, `missing-asset`, `missing-embed-source`, `missing-embed-anchor`, `invalid-embed-spec`, `duplicate-anchor`, `empty-anchor`, `unstable-anchor-link`, `unmatched-embed-replacement`, `unreplaceable-embed-section`, `empty-embed-cell`, `unportable-embed-component`, `imported-embed-component`, `cyclic-embed` and `unmatched-tree-order`. `unstable-anchor-link`, `unmatched-embed-replacement`, `empty-embed-cell`, `unportable-embed-component` and `unmatched-tree-order` are warnings.

`CheckOptions` accepts `ignore` (codes dropped from the result), `assetDirs`, `withoutBase`, `externalPaths`, and `sourceRoot` or `roots`, defaulting to the library's own roots; without any roots the file pass is skipped and only document links, anchors and embeds are checked. A document link resolves in library coordinates: a relative path against the document's library path, a root-relative path as a library path directly and, when `withoutBase` is given, once more with the deployment base removed, the way the exporter looks a route up. A relative path that climbs above the top of the library names no document. A path that names a directory, such as `./` or `guide/`, resolves to that directory's index document; with its trailing slash it does so even beside a document of the directory's own name, which the spelling without one names. A query names no other document, so `guide/?tab=1` is checked as `guide/`. The path is percent-decoded first; a `%` that is not an escape, as in `100%.md`, is looked up as written and reported as missing with its document instead of ending the check. A fragment matches an anchor either as written or decoded, since hosts percent-encode a fragment that is not ASCII. `externalPaths` lists root-relative prefixes another application serves on the same host, such as `/sdk`; a link whose pathname is one of them or sits beneath one is external and not checked, and `isExternalPath(url, prefixes)` is the exported test. Local links and images then resolve through [`resolveLocalTarget`](../../packages/cudoc/src/node/local-target.ts), exported with `isExternalPath`, `externalUrl` and `parseSrcSet` from `@cudoment/cudoc/node/local-target`, the same function `cudoc-export` copies assets with, so the checker and the exporter cannot disagree about whether a target exists; its `LocalTargetRoots` is `{ roots, assetDirs?, withoutBase?, externalPaths? }`, and a document-relative path reaches disk through the root that holds its library path. `parseSrcSet(value)` returns the `{ url, descriptor }` candidates of a `srcset` as the HTML standard reads them: a URL runs to the next ASCII white space, commas it ends with are separators, empty candidates are skipped, and a descriptor runs to the next comma outside parentheses; the embed resolver and the exporter both read `srcset` with it.

Positions are recovered from `document.source.text` rather than the stored tree, because collection strips `position` when it persists an AST. The search prefers an occurrence terminated by a Markdown destination delimiter, so `guide.md#limit` does not report the line holding `guide.md#limits`; a duplicate anchor reports its later declaration. A reference the source no longer contains yields no position rather than a wrong one.

`formatCheckResult(result: CheckResult): string` renders the result grouped by document with `line:column` prefixes, showing at most four `available` entries before summarising the rest, anchors as `#id` and the names of an `unmatched-tree-order` in double quotes.

Embed sources resolve through `resolveDocumentReference`, the function the resolver itself calls, so a source the checker accepts is one the build finds; whatever it rejects — a missing document, a URL, a backslash path, a path escaping the root, a malformed percent-escape in the anchor — is `missing-embed-source` with the resolver's message. A source whose anchor the target lacks, and a selection that matches no section, are `missing-embed-anchor`, as the resolver fails on both.

A tree embed's sources are read through `resolveTreeSource`, as the resolver reads them: a source it rejects, a folder with no document below it among them, is `missing-embed-source` with its message, and a document source whose anchor names none of the target's heading ids is `missing-embed-anchor` with those ids as `available`. A column naming an extractor the library does not carry is `invalid-embed-spec`, placed at the extractor's name. A folder source is read with the embedding document as `page`, so a folder whose documents a public page would all leave out is `missing-embed-source` too. When every source resolves, each `order` entry other than `...` that matches no first-level line, as `namesTreeNode` matches, a private document the page leaves out among them, is `unmatched-tree-order`, placed on the entry's own line inside the fence after `order:`. A tree is neither followed for cycles nor inspected for components or empty cells, because it copies no section text and leaves an empty column out of its line.

`cyclic-embed` follows the embeds inside every section a block copies, parsing each nested block the way the resolver expands it — in the copy the block's `replace` rules leave, so a rule that turns a nested fence into ordinary code ends the chain there and one that points a nested source back starts one — and reports a chain that returns to a section already being copied, or reaches the resolver's depth limit of 64, as `a#* -> b#limits -> a#*` at the line of the fence that starts it. The build fails on the same chain.

`invalid-embed-spec` covers a block that `parseEmbedSpec` rejects. The reported line is the fence line plus the parser's own line when it has one, and the column is the parser's own column plus whatever stands before the block's text on that line of the file (indentation, a quote's `>`, a list item's offset), so the coordinate is the file's rather than the block's, and the parser's block-relative `at line N, column M` suffix is removed from the message instead of being repeated. An error without a coordinate is placed on the fence. The fences are found by parsing the stored source as Markdown with GFM and front matter, as MDX for an `.mdx` document: a fence shown inside a longer fence or an indented code block is example text, and one inside a quote, a callout or a list item counts. The fences found have to hold the document's embed blocks in order, compared by their text without `\r` or trailing whitespace; when they do not, or the source does not parse, the source is scanned line by line, with a fence closed as Markdown closes it, and when that does not find the blocks either, the embed diagnostics carry no position. A host that reads a block differently from Markdown, such as a VitePress component's HTML block that runs on over a fence, therefore gets no position, unless the fence Markdown reads holds the same text as the host's block. `cyclic-embed` is placed on its fence the same way.

`unmatched-embed-replacement` reads the same text the rules rewrite, `sectionText` in [replace.ts](../../packages/cudoc/src/node/replace.ts) — `source.sections[anchor]` bounded by `end` or `ownEnd`, a list item's marks and indentation taken off, or the whole `source.text` for a whole-document embed — and applies the rules in order to each, recording which found something. A rule is reported only when it matched no slice, because a rule list runs against every selected section and one aimed at a single section misses the rest by design. An unusable pattern counts as matched; that is the resolver's error to raise. `unreplaceable-embed-section` reports each selected section that `unreplaceableSection` from the same file refuses, with its message, so the check stops where the build would, whichever compiler each has.

`empty-embed-cell` runs the same extraction a table render performs, through `buildEmbedRow` and `extractCell`, over every selected section of every column written as a mapping, and reports each cell whose value is missing with the column's number and header, the row's section and the extractor's `problem` text. Shorthand columns are not reported: `summary` of a section that opens with a table is legitimately blank. An `{ extractor }` column naming an unregistered extractor is reported as `invalid-embed-spec` once per row instead of aborting the check.

`unportable-embed-component` inspects what an embed would actually copy. The selection is applied with [`collectSections`](../../packages/cudoc/src/sections.ts), the same function the resolver uses, so `includeChildren: false` and `select` narrow the inspected tree the way they narrow the copy, a section named in the source (`reference.md#limits`) is combined with `select` as the resolver combines them, and a `render: { type: table }` embed is skipped because only heading text travels. A node whose type begins with `mdx` or ends with `Directive` is reported, excluding `mdxjsEsm` and `yaml`, which [`documentToHast`](../../packages/cudoc/src/render.ts) drops rather than refusing. When `select.anchors` names a section that does not exist, `collectSections` throws and that is reported as `missing-embed-anchor` rather than swallowed, because the build raises the same error.

Under `replace` rules the copy is not the section as collected but its rewritten Markdown compiled again, and `cyclic-embed`, `empty-embed-cell`, `unportable-embed-component` and `imported-embed-component` all read that copy, so a rule that rewrites a component into prose leaves nothing to report. The rewriting is the resolver's own: both import it from [replace.ts](../../packages/cudoc/src/node/replace.ts). A library with a synchronous host compiler compiles the copy with it; `cudoc check` loads one without, and a library collected through an asynchronous compiler keeps none the checker can call, so there the standalone compiler reads the rewritten Markdown with the library's options. It reads embed fences, components and tables as the host does, but syntax only the host's parser knows is lost or refused: a VitePress `::: tip` container stays text, and MDX that carries Docusaurus's `{#id}` or an HTML comment does not compile. A section whose copy cannot be built, for that reason or because the resolver refuses the rules, the snapshot or a repeated section id, which fails the build on its own, is left out of those four inspections rather than read as collected, since the rules may have changed exactly what they look for. Each copy is compiled once per check, however many inspections and chains read it.

`unportable-embed-component`'s wording depends on the library's host: for `next`, `docusaurus` and `nextra` it says the host renders the copy where it is spliced in and only standalone export needs a renderer; for every other host it says neither can render it.

`imported-embed-component` compares the copied components' names (the part before any `.`) against `target.imports` and `doc.imports`: a name the source document imports in its own file and the embedding document does not is reported as an error, because the export drops `mdxjsEsm` and the spliced copy lands in a module with no binding for it. It is reported only for a `render: section` embed, after `unportable-embed-component`.

`collectAnchors(tree: Root)` returns `{ id, explicit }` for every heading anchor and for every id an element in raw HTML declares, such as `<a id="legacy"></a>`, which counts as explicit because an author wrote it. For a heading, `explicit` reflects `data.cudoc.explicitId`, which is what separates an author's anchor from a slugger's, and therefore what `unstable-anchor-link` keys on. That warning fires for a link to a generated anchor ending in `-<digits>` only when the same id without the suffix is also in the document: `#overview-1` beside `#overview` is a slugger's disambiguation that moves when another heading of that title is inserted, while `## Version 2`, whose own text makes `version-2`, is left alone. `duplicate-anchor` compares heading ids only.

## Datasets

Source/import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)` synchronously publishes projected ASTs and returns `{ schemaVersion: "1.0.0", documentCount, documents }`.

`DatasetOptions` extends `ProjectionOptions` with required `inputDir`, `outDir`; optional `library`, `documents`, `scopes`; `projectionId` default `custom`; `requireVersion` default true. Input is a directory of AST JSON, typically `.cudoc/documents/documents`. A `manifest.json` or `meta.json` at the top of `inputDir` is skipped; a document with either name in a subdirectory is a document like any other. Document IDs are exact extensionless relative paths. `library` names the collected library directory those ASTs came from: its manifest's root bases decide where a document's scope segment starts — the first segment after the longest base prefixing the ID, so `docs/ko/guide` and `terms/ko/token` both belong to scope `ko` under bases `docs` and `terms` — and its private documents are left out, so requesting one in `documents` is an error. Without `library` the scope is the first path segment and nothing is private. `scopeOf(id, bases)` is exported. Explicitly requested missing IDs throw. The generator projects the stored ASTs and resolves nothing: a `cudoc-embed` block stays the `code` node it was collected as, so an embedded section appears in the dataset only in the document that owns it.

Output is `documents/<id>.json` plus `manifest.json`, containing schema `"1.0.0"`, projection ID/options, document count, scopes and `{ id, hash, outputHash }` entries. `hash` covers input file bytes decoded as UTF-8; `outputHash` covers serialized projected AST. Input and output are validated. File-specific failures retain their cause and abort publication. See [projectAst](./document.md#projection) for filtering semantics.

## Storage

Source/import: [storage.ts](../../packages/cudoc/src/node/storage.ts), `@cudoment/cudoc/node/storage`.

| Function                                          | Behavior                                                                                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hash(value)`                                     | SHA-256 hex of a string                                                                                                                                                                                                    |
| `posix(value)`                                    | Converts platform path separators to `/`                                                                                                                                                                                   |
| `contained(root, target)`                         | Tests containment, including root equality                                                                                                                                                                                 |
| `realPath(target)`                                | Resolves existing ancestors and appends missing path parts                                                                                                                                                                 |
| `safePath(root, relative)`                        | Resolves a contained descendant; rejects escape and root equality                                                                                                                                                          |
| `sourceFiles(root, extensions?, { exclude? })`    | Sorted recursive absolute file paths; default `.md`, `.mdx`; skips dot entries and node_modules; asks `exclude(relativePosixPath)` before entering a directory or listing a file; rejects source-tree symlinks it does see |
| `writeJson(file, value)`                          | Creates parent directories and writes compact JSON; not itself transactional                                                                                                                                               |
| `publishDirectory(inputRoots, outputRoot, build)` | Locks, stages and replaces an owned output directory; `inputRoots` is one directory or a list, none of which may overlap the output; returns a promise when `build` does                                                   |

Publication rejects overlapping input/output and a symlink output. **Any existing output, even an empty directory, must already carry `.cudoc-output` with `cudoc\n`.** Start with a nonexistent output directory. The lock, `<output>.lock`, holds the writing process's id and is linked into place with the id already written, so it is never read empty; the callback receives a staging path. A lock whose process is still running fails with `cudoc: <output> is being written by process <pid>; wait for it to finish`. Any other lock was left by a build that was killed: it is claimed by renaming it, and the lock is taken again before anything else is touched. A process that finds a live id in what it moved puts it back and reports that build instead, and one that finds the stale lock already claimed tries the lock again. What the killed build left is recovered by the process holding the lock, because a running build's own directories exist only while it holds the lock; the moment between reading a dead id and renaming the lock is the one window in which a third writer can still slip in. Recovery looks only at the names publication gives, `<output>.previous-<uuid>` for a backup and `<output>.cudoc-staging-` followed by six letters or digits for a staging directory, and only at a real directory whose `.cudoc-output` holds exactly `cudoc\n`, the test an existing output has to pass: such a backup is moved back when the output itself is missing and removed otherwise, and such a staging directory is removed. A directory under any other name, one whose marker says anything else and a symbolic link are left where they are. An owned directory is removed with its marker last, so a removal that stops partway leaves one the next recovery finishes; a leftover that cannot be moved or removed fails the publication and releases the lock. Two leftovers are not recovered: a staging directory from a build killed before it wrote the marker, and the lock's own temporary files, `<output>.lock.<pid>-<uuid>` and `<output>.lock.stale-<pid>-<uuid>`, from a build killed while it took the lock; they hold nothing of the output and can be deleted. A staging directory that cannot be created releases the lock again.

The callback may be synchronous or asynchronous. `publishDirectory` inspects what `build` returned: a thenable defers the commit until it settles and makes the call itself return a promise, anything else commits immediately and returns nothing. The overload signatures are a convenience; that runtime check is what decides. A failed build leaves the previous output intact, and a failed final rename restores it. The lock is held for the whole transaction, so a concurrent publication to the same output fails while an asynchronous build is still running. A process killed mid-build leaves the lock and the staging directory behind until the next publication to that output recovers them; an asynchronous build widens that window rather than adding a new failure. These helpers protect generated output; they are not a sandbox for arbitrary compiler or renderer callbacks.

## Individual AST snapshots

Sources: [export-ast.ts](../../packages/cudoc/src/node/export-ast.ts), [load-ast-file.ts](../../packages/cudoc/src/node/load-ast-file.ts), [paths.ts](../../packages/cudoc/src/node/paths.ts).

These public primitives handle one AST file at a time. They do not create library manifests, original-source snapshots or prepared fenced embeds. The usage guides use the library workflow instead.

- `exportAst(options?)`, the default from `/embed` or `/node/export-ast`, is a remark plugin writing a snapshot at its pipeline position. It leaves the rendering tree intact and atomically writes each file.
- `resolveExportAstOptions(options?) → ExportAstContext`, `projectTree(node, context) → unknown`, `buildExportedAst(tree, context) → object` expose export preparation without requiring disk writes.
- Export defaults: source `docs`, output `.cudoc/ast`, extensions `.md`/`.mdx`; strip `position`/`estree`; drop `mdxjsEsm`; write version `cudocAstVersion: 1`; validate true. Options also include custom `version`, `tableCellElement`, `write(filePath, contents)` and path options.
- `loadAst(documentPath, options?)` from `/embed` reads an extensionless relative ID inside the output directory; a path that leads out of it, such as `../../secrets`, throws `cudoc: path escapes document root` instead of being read. `loadAstFile(filePath, options?)` from `/node/load-ast-file` reads a known file directly. Both validate by default and return `ExportedCudocAstRoot`. Reader options are `version`, `validate`, `tableCellElement`; `loadAst` also takes path options.
- `/node/paths` exposes `resolvePathOptions`, `getRelativeOutputPath`, `getOutputPath`, `DEFAULT_SOURCE_ROOT`, `DEFAULT_OUTPUT_ROOT`, `DEFAULT_EXTENSIONS`. `PathOptions` is `{ sourceRoot?, outDir?, extensions?, cwd? }`; unmatched/outside source paths return `null` from output mapping.

Prefer `loadAstFile` for a known server-bundle path. Include required JSON in deployment artifacts when runtime code reads it. The `/embed` barrel re-exports the individual export/read/path functions and lower-level query helpers, not the APIs earlier on this page.

## CLI

Source: [cli.ts](../../packages/cudoc/src/node/cli.ts), which runs [command.ts](../../packages/cudoc/src/node/command.ts).

```sh
cudoc collect --config cudoc.config.mjs [--watch]
cudoc check --config cudoc.config.mjs [--format text|json] [--strict]
cudoc dataset --config dataset.config.json
```

Only these commands and the `--config <path>` argument form are accepted; another command, a missing `--config` value or a `--format` other than `text` or `json` prints `Usage: cudoc <collect|check|dataset> --config config.mjs [--watch] [--format text|json] [--strict]` and exits 1, and any other argument is ignored. ESM files must default-export a configuration object; `.json` files are parsed directly. Paths inside config resolve from the invoking working directory, not the config's directory. Errors go to stderr and set exit code 1: the usage line and an error whose message starts with `cudoc` and a colon are printed as their message, followed by a `caused by:` line for each cause it wraps, and anything else with its stack.

`collect` runs one [`collectDocuments`](#watching) pass: collection and preparation, published to `outDir` together, so a failed run leaves the previous library and its `embeds.json` in place, and embeds that cannot be prepared are listed together in one message (see [`prepareEmbeds`](#prepared-embeds)). A supplied compiler may be sync or async. It prints `{ documentCount, outDir }` as JSON. `collect --watch` runs [`watchDocuments`](#watching) with the same configuration and keeps running: the first pass continues from what `outDir` already holds, every pass prints one JSON line — `documentCount`, `compiled` (the ids compiled), `reused`, `blocks`, `reusedBlocks`, `outDir`, `elapsed` — and a failed pass prints its error and leaves the last good output in place. `collect` without the flag is always a full build.

`check` reads the library the last collection published in `outDir` (default `.cudoc/documents`) through `loadLibrary`, and runs [reference checking](#reference-checking) against it with the optional `check` key of the same configuration (`ignore`, `assetDirs`, `externalPaths`, `sourceRoot` or `roots`). It collects nothing and writes nothing, so it needs no compiler; the only Markdown it compiles is an embed's copy that `replace` rules rewrite, which the standalone compiler reads. A host whose collector is a script of its own gives `check` a configuration naming the same `outDir`. `roots` or `sourceRoot` at the top level of the configuration are handed to `loadLibrary`, so they must carry the bases the library was collected with; they tell the check where documents live on disk, and without them — at the top level or under `check` — a path is checked only against the collected documents: an image with no file and a link that names neither a document nor a file are not reported. Without a collected library it fails with `cudoc: no collected library in <outDir>; collect documents before checking them`. `--format text`, the default, prints what `formatCheckResult` renders; `--format json` prints the whole result. Its exit code is 1 when any error is reported, or when `--strict` is given and anything at all is.

`dataset` passes its configuration to `generateDataset`, so `library` there names the collected library to read scopes and private documents from, and prints its JSON summary. The export CLI is documented in [adapters](./adapters.md#export).
