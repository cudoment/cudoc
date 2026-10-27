# Node APIs

**English** | [한국어](./node.ko.md) · [API reference](./README.md)

These entry points read or write files and belong in Node.js build or server code. Relative paths resolve from the current working directory unless noted.

## Collection

Collection compiles every document under the configured roots and publishes them as one library. Source/import: [library.ts](../../packages/cudoc/src/node/library.ts), `@cudoment/cudoc/node/library`.

The root helpers `SourceRoot`, `ResolvedRoot`, `resolveRoots`, `documentIdOf`, `libraryPathOf`, `sourceFileOf`, `normalizeBase`, `libraryPath` and `candidateFiles` are also exported from [roots.ts](../../packages/cudoc/src/node/roots.ts), `@cudoment/cudoc/node/roots`, which loads no compiler. The remark embed plugin imports them from there so a host can load its configuration without the MDX stack.

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
normalizeBase(base: string | undefined): string
libraryPath(root: ResolvedRoot, relative: string): string
candidateFiles(roots: readonly ResolvedRoot[], target: string): string[]
globToRegExp(pattern: string): RegExp
globMatcher(patterns: readonly string[] | undefined, option: string): (libraryPath: string) => boolean
```

`normalizeBase` gives a base its library form, `/docs/` as `docs`, and throws `cudoc: invalid root base: <base>` under the rule below. `libraryPath(root, relative)` puts a root's base before a path inside its directory. `candidateFiles(roots, target)` lists every file a library path could name, the longest base first. It leaves out a path that escapes its root's directory and a file another, nested root owns.

`globToRegExp` compiles one pattern of the glob dialect `exclude` and `private` use, from [glob.ts](../../packages/cudoc/src/node/glob.ts). `globMatcher` tests a library path against a list of them and names `option` when a pattern is not a non-empty string. `cudoc-export` reads a navigation folder's `exclude` with the same dialect.

The dialect is small, and patterns are matched against library paths:

- `*` and `?` match within a segment, and `**` any number of segments.
- A pattern without `/` matches a file or directory name anywhere.
- A trailing `/**` also matches the directory itself, so an excluded directory is not entered and a symlink inside it is never seen.
- There are no brace sets, character classes or negations; an empty pattern or one containing `..` is an error.

`exclude` decides what is a document at all; `private` marks documents that are collected, checked and embeddable but carry `private: true` in the library and the manifest, which `cudoc-export` and `generateDataset` read.

`BuildDocumentsOptions` extends `DocumentOptions`:

| Property      | Default                    | Meaning                                                                                                                   |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sourceRoot`  | One of the two is required | One input directory at the top of the library; shorthand for `roots: [{ dir: sourceRoot }]`                               |
| `roots`       | One of the two is required | `{ dir, base? }[]`: directories to collect, each under its base. Giving both `sourceRoot` and `roots` is an error         |
| `exclude`     | `[]`                       | Glob patterns for files and directories that are not documents; matched against library paths                             |
| `private`     | `[]`                       | Glob patterns for documents collected and checked but never exported or put in a dataset                                  |
| `outDir`      | `.cudoc/documents`         | Owned library output directory                                                                                            |
| `routeBase`   | `/`                        | Prefix for default document routes                                                                                        |
| `routeSuffix` | `""`                       | Suffix such as `.html`                                                                                                    |
| `routes`      | `{}`                       | Overrides keyed by extensionless document ID                                                                              |
| `compiler`    | Standalone compiler        | Actual host compiler callback when supplied                                                                               |
| `compilerId`  | Required with `compiler`   | Caller-managed compiler/configuration identity                                                                            |
| `previous`    | none                       | A library collected earlier; documents whose text is unchanged are taken from it instead of compiled                      |
| `imageSizes`  | `false`                    | Also write `images.json`, the pixel size of each local image every document shows                                         |
| `assetDirs`   | `[]`                       | Directories, such as `public` or `static`, where an image address is also looked up at its library path for `images.json` |

Every root scans `.md` and `.mdx` recursively, skipping dot entries and `node_modules` and rejecting symlinks. `resolveRoots` resolves the roots by these rules and is what every consumer calls:

- A root's `base` is normalized by dropping surrounding slashes; it may hold several segments (`docs/v2`), may be empty, and may not hold an empty, `.` or `..` segment, a `?` or a `#`.
- Two roots may share a base, and a base may extend another (`docs` and `docs/api`).
- A root's directory may sit inside another root's, and the inner root then owns its files. The outer root's scan leaves that directory to it, as it does a symbolic link in its tree that leads to another root's directory instead of rejecting it. So each file is collected once, under the inner root's base.
- The same directory may not be listed twice, counting one listed once as it is and once through a symbolic link.

A document's **library path** is its root's base followed by its POSIX path under that root's directory, and its ID is the library path without the extension: `content/ko/guide.md` collected with `{ dir: "content", base: "docs" }` is `docs/ko/guide.md` and `docs/ko/guide`. With `sourceRoot` the base is empty, so an ID is the file's path under that directory. `StoredDocument.sourcePath` is the library path.

Library paths are the coordinate system for everything that names documents: links, embed `sources`, the checker, the exporter and `exclude`/`private` patterns. A root-relative link `/terms/token.md` names the document `terms/token` whichever directory it was read from. A relative link resolves in library coordinates too: it crosses from one root into another exactly when the bases mirror the directory names, and otherwise reports as missing.

`documentIdOf` and `libraryPathOf` map a file to that coordinate through the innermost root containing it. They compare the root directories and the file by their real paths. So a host that reports the real path of a file under a root configured through a symbolic link (or the other way round) finds the same document. For the same reason, a nested root reached through a link still owns its files.

`sourceFileOf` maps a library path back to a file, trying roots with the longest matching base first and preferring one that exists. A file another root owns is not a match, so under a nested root with a base of its own the outer root's spelling of the file names nothing. A file a root reaches through a symbolic link of its own, under a dot directory for instance, stays that root's. Extension and case collisions across all roots are errors naming both files.

Default URLs are `routeBase + id + routeSuffix` with the joining slash normalized, so bases become URL prefixes. When `routeSuffix` is `""` or `"/"`, an index document takes its directory's URL instead, as the hosts serve it: `index` under `routeBase: "/docs"` is `/docs/` and `guide/index` is `/docs/guide/`.

Two documents whose routes differ only by a trailing slash fail with `duplicate document route`, as two equal routes do. Overrides must be unique root-relative pathnames, starting with `/` but not `//`, and containing no `?` or `#`. Frontmatter slugs are not inferred.

Collection without a custom compiler is allowed for `markdown`, `html`, `next`, or an omitted host. Other host profiles require a callback. A Next.js project with additional plugins also needs a matching callback to retain parity.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler has the same arguments and returns Promise<CompiledDocument>.
```

`filePath` is absolute and `options.format` is inferred per file. Return a position-bearing tree before export removes source positions. Collection prints returned diagnostics to stderr as `<library path>:<line>: <code>: <message>`, so a file under a root with a base shows that base. It snapshots source ranges and validates/version-tags the export.

Nothing is written until every document has compiled; the library is then published in one [`publishDirectory`](#storage) step, so a document that fails to compile leaves the previous library as it was. The publication replaces the whole directory, so an `embeds.json` written by an earlier preparation does not survive it: `prepareEmbeds` writes it again, and [`collectDocuments`](#watching) publishes both together. The async builder compiles each file before publishing and retains the async compiler for replacements.

With `previous`, a document is taken from that library as it is (tree, snapshot, front matter, `private`, `imports`) when the configuration hash is the same, its library path is the same and its source text hashes to the stored hash. Everything else compiles as usual, a document that disappeared from disk is dropped, and the published directory is complete either way. A reused document's diagnostics are not printed again. The result carries `incremental: { compiled, reused }` naming the document ids each way.

A configuration change reuses nothing: options, routing, roots, patterns, extractor versions, `compilerId` or the `@cudoment/cudoc` version. That is also why a host upgrade must change `compilerId`: the hash cannot see what the compiler does.

`Library` has `documents: StoredDocument[]`, `options`, `configuration` (hash), `bases: string[]` (the roots' bases as collected, `[""]` for one root at the top), optional runtime `roots: ResolvedRoot[]` (absolute `dir`, normalized `base`), `compiler` and `asyncCompiler`. Compiler functions and the absolute root directories are not serialized; the manifest records each root's `base` only.

Each `StoredDocument` has `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`, `private: true` when a `private` pattern matched, and `imports: string[]` when the document imports anything.

`imports` holds the local names the document's `import` statements bind, read from the compiler's `mdxjsEsm` estree before the export drops those nodes (`CompiledDocument.imports`, computed by `importedNames(tree)` from `@cudoment/cudoc/mdx`, also re-exported by `/markdown`). A host capture records the same, and for an `.mdx` file also scans the source with `importedNamesFromSource(source)`, top-level `import` statements outside fenced code parsed as a module. It scans the source because a host such as Nextra hoists the ESM out of the tree before the capture sees it.

`loadLibrary` defaults to `.cudoc/documents`, validates the manifest version, AST contract and stored hashes, and reconstructs the library. It does not compare files on disk with current source documents or infer current compiler settings. Recollect to refresh source/configuration.

Supply `roots`, a directory for the single-root shorthand or the same `{ dir, base }` list collection used, to restore where documents live, which replacement compilation and asset resolution need. The bases given must be the ones recorded in the manifest, because the IDs were derived from them, and a mismatch is an error naming the recorded bases.

Pass the original sync compiler for replacement, or attach the original callback to `library.asyncCompiler` and use async APIs. A preloaded library used only with prepared embeds needs no compiler.

`{ cache: true }` keeps the loaded documents in memory per resolved `outDir` and returns the same `documents` array while `manifest.json` reads back byte for byte the same. A changed manifest, which every recollection produces, loads afresh, and the `roots` given are still checked against the recorded bases on every call. Without the option each call reads the files again. A server that loads the library on every request, a route handler rendering embeds or a search endpoint, uses the cached form; a build step that runs once does not need it.

## Library files

A published library is one directory, `outDir`, holding these files:

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  pages.json
  images.json              # With imageSizes
  documents/<id>.json
  sources/<id>.json
  embeds.json              # Added by prepareEmbeds and collectDocuments
```

| File                  | Contract                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 2`, configuration hash, document options, optional compiler ID, `roots: [{ base }]`, per-document metadata and hashes |
| `documents/<id>.json` | Versioned mdast root; `data.cudocAstVersion: 1`; export strips `position`/`estree` and drops `mdxjsEsm`, `yaml` and `toml`            |
| `sources/<id>.json`   | Original text, SHA-256 hash, format and section offsets                                                                               |
| `embeds.json`         | `schemaVersion: 2`; prepared embedded AST blocks, the documents each block read, and freshness metadata                               |
| `pages.json`          | `schemaVersion: 1`; `pages`, one entry per document in library order, for a site's titles, descriptions and navigation                |
| `images.json`         | `schemaVersion: 1`; `documents`, each document's local images by the address it writes, with `type`, `width` and `height`             |

Manifest document entries contain `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`, `private: true` for a private document, and `imports`, the local names the document's own `import` statements bind, when it has any. AST/snapshot hashes cover `JSON.stringify` of their objects; the source hash covers original text.

`configuration` hashes options, routing, the root bases, the `exclude` and `private` patterns, the extractor versions, the compiler identity and the `@cudoment/cudoc` version, so changing any of them invalidates prepared embeds. A library and its `embeds.json` are always written together with one hash, so they keep agreeing after an upgrade until the next collection, which reuses nothing and replaces both. Nothing compares the hash with the running release when a library is read.

`LIBRARY_SCHEMA_VERSION` exports the current version; a manifest with another version is rejected with "incompatible document manifest". Use public functions to produce these files; do not hand-edit them.

A `pages.json` entry is `{ id, route, sourcePath, title, description?, private? }`. `title` is `documentTitle(tree, frontmatter, id)` and `description` is `documentDescription(tree, frontmatter)`, left out when empty ([page metadata](./document.md#page-metadata)). A private document is listed with `private: true`, as the manifest lists it, so a consumer that publishes pages leaves it out.

With `imageSizes`, `images.json` maps each document that shows a local image to `{ [url]: { type, width, height } }`. The images are every Markdown image, a reference-style image through the first definition of its label (`![alt][label]` with `[label]: ./a.png`), as the page shows it, an image a host made a component of (`data.cudocImage`) and a static `<img>` component's `src`. An address resolves the way the check and the export resolve a local address, under the roots by library path, then under each of `assetDirs` at that library path, and is read by `imageSize`.

Collection does not know the deployment base, so an address that spells it, which the check removes with `withoutBase` and the export with `hostUrl`'s path, resolves to no file here. An image written relative, or root-relative without the base, is measured. An address that resolves to no file, or to a format other than PNG, JPEG, GIF or BMP, is left out; the reference check reports the missing ones.

Neither `imageSizes` nor `assetDirs` enters the configuration hash, so turning them on reuses a `previous` library, and `images.json` is written afresh on every collection, since an image can change while no document does.

`imageSize(bytes)` from `@cudoment/cudoc/node/image-size` ([source](../../packages/cudoc/src/node/image-size.ts)) returns `{ type: "png" | "jpg" | "gif" | "bmp", width, height }` read from the file's header by its magic bytes, or `null` for any other content; `cudoc-export` reads the same sizes for Word.

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

Offsets use JavaScript string indexing into the file's own text, `\r\n` line endings included, on every host. `start` begins at the heading; `end` is the next same/shallower heading or document boundary; `ownEnd` ends before a child heading. Dependency spans locate definitions in the original source. These ranges enable original-Markdown replacement even though exported AST positions are removed.

An id given to more than one heading records the first heading's range, the one a link to it reaches, so a `replace` rule on that id throws `cudoc: <document> gives #<id> to <n> headings, so a replace rule cannot tell which section to rewrite; give them distinct ids` rather than rewrite the first section twice.

A heading that is not a child of the document root starts its range at or after the marks of the blocks around it on its own line. Those marks are read from that line itself, since a remark host records the heading after them and a markdown-it host from the line's start.

A rule rewrites the section's text as it reads on its own, cut by `sectionText` in [replace.ts](../../packages/cudoc/src/node/replace.ts). In a list item the item's marks and, on every later line, the item's indentation are taken off, as the parser took them off the item's content. So a section in a list item, however deep, is rewritten into the collected structure. The indentation is the column the item's content starts at: the heading's, or for a heading on a later line of the item that of the line opening the item. When the marker stands alone on that line, the column is one past it, and tabs count to the next multiple of four.

Where something of the block would stay in the text, `unreplaceableSection` in the same file refuses the rule instead of compiling a copy of another structure:

- a quote's or callout's `>` before the heading
- a footnote's indentation
- a section that runs to the end of a component, a `:::` directive or a markdown-it container and whose last line is that block's closing `:::` or tag

The error is `cudoc: <document>#<id> starts inside <a quote | a callout | a footnote | a container | a component | a <type> block>, and <reason>, so a replace rule cannot rewrite it; …`; it is decided from the stored tree and source alone, and `cudoc check` reports the same as `unreplaceable-embed-section`. A section followed by another heading inside its component or container, and every top-level section, are rewritten as usual; the section still embeds without rules, as its collected tree.

## Embedding

The resolver turns one embed specification into the nodes it stands for: a copied section, a table of sections or a tree of documents. Source/import: [resolve-embed.ts](../../packages/cudoc/src/node/resolve-embed.ts), `@cudoment/cudoc/node/resolve-embed`.

Three helpers from [tree.ts](../../packages/cudoc/src/node/tree.ts) are exported beside `resolveTree`, so another consumer orders and names documents exactly as a tree does, as `cudoc-export`'s navigation does:

- `nfc(value)` normalizes to NFC.
- `documentName(id)` is an id's last segment or, for an `index`, its folder's name.
- `compareNames(a, b)` orders text with letter case ignored, a run of digits read as its number (`Step 2` before `Step 10`) and code points otherwise, which puts Hangul syllables in dictionary order the same on every machine.

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

`parseEmbedSpec` parses YAML and validates supported top-level, selection and replacement keys, source lists, rendering choices and replacement rules. Unknown keys are rejected at all three levels and the message lists the known ones; `flags` without `regex: true` is an error rather than a silently ignored value. `sources` must be nonempty. Selection behavior is defined in [document queries](./document.md#sections-and-queries).

`parseEmbedBlock(value, documentId, number?)` wraps it so a failure names the document, the block and, for a parser error, its line and column.

The default render is `section`; default table columns are `DEFAULT_TABLE_COLUMNS`, title/link/summary. A table column is a shorthand name or a mapping validated key by key:

- `value` is required and is one of the three names, a cell coordinate mapping (`row` and `column` non-negative integers, optional `table` index and `skipTablesWithHeaders` strings) or `{ extractor }` alone.
- `link` is one of `section`, `parent`, `document`.
- `minWidth` is a CSS length matching a number and one of `px`, `rem`, `em`, `ch`, `%`.

`render` is `section` or a mapping whose `type` is `table` or `tree`, anything else failing with `cudoc: render must be "section" or a mapping with type: table or type: tree`. A table accepts no key beyond `type` and `columns`, and a tree none beyond `type`, `open`, `print`, `depth`, `headings`, `order` and `columns`. A tree with `select` or `replace` fails, since it copies no section text.

A tree's columns are validated as a table's, and its other keys as follows:

| Key              | Constraint                                                                             |
| ---------------- | -------------------------------------------------------------------------------------- |
| `open`           | An integer of at least 0                                                               |
| `print`, `depth` | Integers of at least 1                                                                 |
| `headings`       | An integer from 0 to 5                                                                 |
| `order`          | A list of non-empty strings naming nothing twice in NFC and holding `...` at most once |

A table render produces one `EmbedRow` per selected section through `buildEmbedRow`, read before ids are rebased so a cell's link points into the source document. The row's `section.title` is the visible text of the copy's first top-level heading, whatever its depth, or without one the front matter `title`, then the document id. `parent` is the nearest shallower heading above the section in the source tree, and `url` is the document route plus the anchor.

`extractCell` turns one column into text and an optional link. The text comes from the column's `value`:

| Value           | Text                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`         | `section.title`                                                                                                                                                                 |
| `summary`       | The first paragraph among the section's direct children, as plain text                                                                                                          |
| `parent`        | The parent heading's title                                                                                                                                                      |
| A cell mapping  | A table cell: tables inside the section in document order, minus those whose header row contains a `skipTablesWithHeaders` name; `row` 0 is the header row; text via `nodeText` |
| `{ extractor }` | The extractor's return value                                                                                                                                                    |

A column's `link` resolves to the section's `url`, the parent heading's address (its anchor when it has one, else the document route) or the document route; an extractor's own `url` takes precedence over the column's `link`. It is written as it should appear on the page the embed lands on, `context.documentId`, however deeply the table or tree is nested. A copy around it changes only a bare fragment that names one of the copy's ids, to that id's new name.

When the value is missing (no paragraph, no heading above, too few tables, rows or cells, an extractor returning `undefined` or `""`), `cell.text` is `""` and `problem` says what was expected and what the section has. `buildEmbedTable` writes the header row with `data.hProperties.style` of `min-width: <minWidth>` on any column that sets it, then one row per `EmbedRow`. An `{ extractor }` column naming an extractor the library does not carry throws.

Extractors come from `BuildDocumentsOptions.extractors`, a name-to-`{ version, extract }` map. `version` must be a non-empty string and enters the configuration hash as `{ name: version }` sorted by name, so a changed extractor recollects like a changed compiler.

The functions live on `Library.extractors` at runtime and are not serialized, and a loaded library has none, which is fine for prepared embeds and an error only when resolving a `{ extractor }` column anew. Checking resolves table embeds anew, so `cudoc check` puts the `extractors` of its configuration on the library it loads; a program that checks a loaded library sets `library.extractors` itself.

A tree render resolves each source with `resolveTreeSource`. A path ending in `/` names a folder, relative to `from` or from the top of the library with a leading `/`. Any other path names a document as `resolveDocumentReference` reads it, the id also matched in NFC, and a missing document whose path is a folder holding documents adds `; a folder source ends with /, as in <path>/` to the missing-document message.

A folder source fails with one of these messages:

- `cudoc: a folder source takes no anchor: <reference>`
- `cudoc: embed source escapes root: <reference>`
- `cudoc: no documents in folder <reference> referenced from <from>`, when no document is below the folder
- `cudoc: folder <reference> referenced from <from> holds only private documents, which a tree on <page> leaves out`, given `page`, the document the tree lands on, when the folder's documents are all `private`, unless that page is private

The documents nest as [tree.ts](../../packages/cudoc/src/node/tree.ts) works it out once per document list, comparing ids in NFC. Walking up from a document's own folder, its parent is the first document that stands for a folder and is not the document itself, `<folder>.md` before `<folder>/index.md`, with the library's top standing as `index`. So `X.md` takes the documents of `X/`, `X/index.md` takes the rest of `X/` when there is no `X.md` and goes under `X.md` when there is, and a folder nothing stands for is passed through.

A folder source's first level is the documents inside it whose parent is not inside it as well, the document standing for the folder left out. A document source is one line, and a source with an anchor is one line for each heading `collectSections` finds with that anchor, carrying its own deeper headings within `headings`. Under a document line come, while the level is within `depth`, its headings of depths 2 to `headings + 1` in document order, nested by depth, and then the documents whose parent it is. A heading one level past `depth` takes the ones under it out with it.

A `private` document is left out where a folder source or a parent brings it in, with the lines below it, since the export writes no private document to link to. It stays in when the page the tree lands on, `context.documentId`, is `private`; an id that names no collected document counts as a page that is not. A document source names its document whatever it is.

The first level follows `sources` in the order written. The documents a folder source brings in, and the documents under any line, are sorted by `title`, then `name`, then `id`. The comparison ignores letter case, reads a run of digits by its value and compares code points otherwise, so the order does not follow the locale. `order` then moves the first level, keeping the order of equal ranks. A line takes the position of the first entry that `namesTreeNode` matches, its `name` or its `title` equal to the entry in NFC, and any other line the position of `...`, or the end without one.

A document line's row has no anchor, and its `url` is the document route. Its title is the visible text of the document's `#` title, the first depth-1 heading among the top-level blocks or inside a top-level `header` element, where Docusaurus puts the heading it reads the page title from. Else it is a non-empty string `title` in the front matter; else `name`, the file name without its extension, or the folder's for an index document, in NFC. Its `section.tree` runs from the block holding that title to the next one, or is the whole document without one, so `summary` is the first paragraph after the title.

A heading line's row is `buildEmbedRow` of its section, and its `name` is its title in NFC. Cells are filled after the tree is built, deepest line first, so an extractor's `context.node` has every line below it complete; `extractCell` passes its `node` argument on as that `node`. A tree's `data.cudocDependencies` are the documents its lines were read from, with `"*"` when a column is an `{ extractor }`.

A tree copies no section text, so nothing in it is expanded or namespaced. A tree inside a copied section is resolved from the document the copy came from, and its links are already addresses on the page, which the copies around it treat as the rebasing rule below says.

`buildEmbedTree` writes an unordered `list` with `spread: false`, `data.cudoc.kind: "tree"` and `hProperties` of `className: ["cudoc-tree"]`, plus `data-cudoc-print` when `print` is set. A line with lines below it is a `listItem` holding a `blockquote` with `hName: "details"`, and `hProperties.open: true` when its level is at most `open`. The blockquote's children are the line as a `paragraph` with `hName: "summary"` and the nested `list`. A line without is a `listItem` with `className: ["cudoc-tree-leaf"]` holding the line as a `paragraph`.

A line is its non-empty cells joined by `·`, a cell with a `url` as a `link`, or the title alone when every cell is empty. `@cudoment/cudoc/paged` exports what the paginated writers read it by: `TREE_KIND`, `TREE_CLASS`, `TREE_PRINT_ATTRIBUTE`, `isTree(node)` and `treePrintDepth(value)`, the print depth or `Infinity`.

References resolve relative to `context.documentId`, or from the document root when beginning with `/`. `.md`/`.mdx` and `#anchor` are supported; the anchor is percent-decoded, and a `%` that is not an escape fails with `cudoc: embed source has a malformed percent-escape: <reference>`. URLs, backslash paths, root escapes and missing documents fail. Documents are looked up through an index built once per document list, so resolving every block of a large library does not scan the list for each reference. An anchorless source without a selector uses its whole document.

Resolution clones source ASTs and never mutates the original source or AST. When replacement is requested, it reads the original selected source range, applies rules in order and recompiles with the original compiler/options. Literal replacement uses split/join (all occurrences); regex uses JavaScript `RegExp`, default flags `g`. Dependencies outside the selected range are appended unchanged. Async APIs retain an async compiler through a per-resolution compile cache.

The returned root carries `data.cudocEmbedPrefix`, `cudoc-<document id>-<prefix or embed>-` with the id spelled by [`idToken`](./document.md#document-options), which the renderer uses to namespace footnote labels. It also carries `data.cudocDependencies`: the sorted ids of every document the resolution read, the fence's sources and those of every embed nested in them. They include `"*"` when a `{ extractor }` column ran, since an extractor may read any document. For a tree, they are the documents its lines were read from.

IDs, footnotes and definitions are namespaced; links/images and supported raw HTML attributes are rebased. Each node is rebased once, by the innermost copy that holds it.

A node an inner copy already rebased, or a table or a tree wrote, holds addresses on the page. So a copy around it renames its ids, points a bare fragment that names one of the copy's ids at that id's new name, and leaves every other address as it is. Read again as a source path, a route could name another document when `routes` gives one document another's path, and a path that climbed out of the library would be spelled from the wrong directory.

The raw HTML attributes are `href`, `src`, `poster`, `data`, `xlink:href` and each candidate of `srcset`, which keeps its width or density, the same resources the exporter copies. The matching `hProperties` of a lowered element (`srcSet` among them) are rebased alike.

An address is rebased by what it spells:

- A fragment link keeps pointing into the copy when the copy carries that id and otherwise names the source document's route with the fragment.
- A link with no path, `?tab=2` or an empty `href`, names the source document it was copied from, not that document's directory.
- A relative path resolves against the source document's library path. A path naming a collected document by its library path or id (`/guide/setup.md`, `/guide/setup`, `/guide/setup/`), or naming the directory of an index document (`/guide/` for `guide/index`), takes that document's route, and any other path stays as the normalized root-relative path.
- A directory spelled with its trailing slash names its index document even beside a document of the directory's own name, which the spelling without one names. A `.` or `..` path names a directory the same way.

A relative path that climbs out of the library root, `../../outside.png` from `internal/notes.md`, names no library path and would name another file clamped at the root. So it is spelled from the embedding document instead (`../outside.png` in `guide.md`): from the two files' own directories when the library has its roots, which reaches the same file, and from the library paths otherwise. That last case is worked out on the paths alone rather than against the working directory. A directory keeps its trailing slash, which names its index. It is left as written when the embedding document is not known.

A JSX element's attributes may `require()` a relative module, `./` or `../` after any webpack loaders, as Docusaurus writes a Markdown image ([`data.cudocImage`](./document.md#semantic-ast)) or a link to a local file. That path is re-expressed from the directory of the file the copy lands in, read as the JavaScript string it is and written back as one escaped for its own quotes. It is re-expressed once however deeply the copy was nested, so a page in another directory can still resolve it.

The directories are the files' when the library has its roots, and the library paths' otherwise, which match only where every root's base mirrors its directory. When the embedding document's id names no collected document, the path is left as collected.

Missing sections, circular dependencies, incompatible replacements and depth beyond 64 fail with context. Use different `prefix` values when combining independent `resolveEmbed` results. The whole-document and preparation APIs number their own embed blocks.

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

`resolveTree(library, spec, context)` returns the lines a tree embed draws, for a program that writes the tree in a form of its own, such as an outliner that keeps it as blocks in a page it generates. `spec` is an embed whose `render` is a tree, validated as `parseEmbedSpec` validates one; any other render throws `cudoc: resolveTree needs an embed whose render is a tree`, and a source that names nothing throws what the resolver throws. `context.documentId` is where relative sources resolve from and what extractors receive, and `prefix` is not used.

Every level down to `depth` is there, whatever `open` and `print` say. The result is plain data, so the same library and spec give the same `JSON.stringify` output, which a program that hashes what it wrote can rely on. `buildEmbedTree(nodes, render)` turns the lines into the mdast `resolveEmbed` produces, so a program that edits the lines first still renders them as an embed would. The example below reads the library `cudoc collect` published to `.cudoc/documents` and prints the tree as an outliner's indented blocks.

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

Prepared embeds are every embed block of a library resolved once and stored in `embeds.json`, so a host build splices them in without resolving. Source/import: [prepare-embeds.ts](../../packages/cudoc/src/node/prepare-embeds.ts), `@cudoment/cudoc/node/prepare-embeds`.

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

`prepareEmbeds` visits fenced embeds in all collected documents, resolves them asynchronously and atomically replaces `embeds.json`. Every block is resolved before anything is written, and nothing is written when any block fails. Its default `outDir` is `.cudoc/documents`, **not inferred from the library**; pass your custom collection path explicitly.

A single block that fails is thrown as `cudoc: <sourcePath>, embed <number>: <message>` with the resolver's error as its `cause`, and several as one `AggregateError` whose `errors` are the individual failures and whose message is `cudoc: <n> embeds could not be prepared:` followed by a line per block (`<sourcePath>, embed <number>: <message>`).

`PreparedEmbeds` contains `schemaVersion: 2`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>` and `dependencies: Record<string,string[]>`, the `cudocDependencies` of each block under the same key. Keys are `documentId:index:sha256(fenceValue)`, with block numbering starting at 1.

`readPreparedEmbeds` checks schema, manifest configuration, current document source hash and manifest document hashes. Missing or stale data throws and requests recollection; a file written by an earlier version is stale. The returned object is shared between calls: copy a block before putting it into a tree of your own.

`embeds.json` and `manifest.json` are parsed once per resolved `outDir` and kept while neither file's inode, size and modification time change, so a host that asks once per page, or once per block, does not parse them again. Every publication replaces both, so the next call after a recollection reads the new files.

`expandPreparedEmbeds` is the splice every host integration performs: it replaces each `cudoc-embed` fence in `tree`, in document order, with the children of a copy of its prepared block, and returns the same tree, modified in place. The remark embed plugin, the markdown-it adapter and `cudoc-export`'s `library` mode all splice through it.

`target` names the published library (`outDir`), the embedding document and its source as collected. It is read only when the first fence is met, so a document without embeds needs no library, and a function defers the work of finding the target until then. `onBlock` receives each copy before it is spliced in. A fence without a prepared block throws `cudoc: prepared embed missing in <id>; recollect documents`.

With `previous`, a block is taken from that result unresolved when four things hold:

- the configuration is the same
- the set of document ids is the same (a document added or removed changes what links inside any block resolve to)
- the embedding document's hash is unchanged
- every id in the block's `dependencies` hashes as it did

A block whose dependencies include `"*"` always resolves again. The written file is complete either way; only the work is saved.

`buildDocuments` followed by `prepareEmbeds` publishes twice, the library and then its `embeds.json`. A preparation that fails in between leaves a library without prepared embeds, and a host build asks for recollection until a preparation succeeds. [`collectDocuments`](#watching), which `cudoc collect` runs, prepares into the staging directory of the library's own publication instead, so the library and `embeds.json` are replaced together or not at all.

## Watching

`collectDocuments` runs one collection pass, library and prepared embeds in one publication, and `watchDocuments` runs it again on every change. Source/import: [watch.ts](../../packages/cudoc/src/node/watch.ts), `@cudoment/cudoc/node/watch`.

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

`collectDocuments` is one pass of what the CLI's `collect` does: compile the library, resolve its embeds, and publish both to `outDir` in one [`publishDirectory`](#storage) transaction. It compiles through the async builder when the config has a `compiler`, which may return a promise or a value. It hands `previous.library` and `previous.prepared` to the two steps so unchanged documents and unaffected blocks are reused. Nothing is written until every embed has resolved, so a pass that fails leaves the previous library and its `embeds.json` in place, still matching each other.

The pass reports the document ids it compiled (every id on a full pass), how many documents and blocks it reused, and its wall-clock time. `previousCollection(outDir)` loads what a finished run left in `outDir`, the library through `loadLibrary` and the preparation when its schema is current, so a new process continues from the last run. A library that is missing, unreadable or incompatible gives `{}`, and a preparation that is gives `{ library }` alone.

`watchDocuments` runs a pass, then another whenever a `.md` or `.mdx` file under any root is created, changed, renamed or deleted, after `debounce` milliseconds of quiet (default 150). It uses `fs.watch` recursively on each root directory. A change during a pass queues one more pass. Unless `reuseOutput: false`, the first pass starts from `previousCollection(outDir)`.

A change to a directory, or to an entry that is no longer there, starts a pass too, because it may be a directory renamed, moved or deleted with documents inside. The entry is looked at on disk rather than judged by its name, so `v1.5/` counts. Changes under dot entries and `node_modules`, which collection never reads, are ignored.

A failed pass, a document that does not compile or an embed whose source is missing, goes to `onError`. The state of the last good pass is kept for the next one, the output directory keeps that pass's library and embeds, and watching continues. An error the file watcher itself emits, such as the system refusing more watched files or a root being deleted, goes to `onError` as well rather than ending the process. Without `onError`, errors are printed to stderr.

`ready` settles when the first pass is over, whether it succeeded or failed, and after any pass a change during it queued. It does not say that changes are reported yet. On macOS the recursive watch starts a moment after the call, and a file changed in that moment, after the first pass read it, may go unreported. Such a file is then collected by the pass the next change starts. `close()` stops the watchers, and a pass in progress finishes.

## Reference checking

`checkReferences` reports every broken link, anchor, image and embed of a collected library as issues with codes, and `formatCheckResult` renders them. Source/import: [node/check.ts](../../packages/cudoc/src/node/check.ts), `@cudoment/cudoc/node/check`; [node/report.ts](../../packages/cudoc/src/node/report.ts), `@cudoment/cudoc/node/report`.

`checkReferences(library: Library, options?: CheckOptions): CheckResult` walks every document and returns `{ issues, documentCount, checkedReferences }`. It reads only; nothing is written and the library is not modified.

Each `ReferenceIssue` carries these fields:

| Field                         | Content                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`, `severity`, `message` | The code, `"error"` or `"warning"`, and the message                                                                                                                                                                                                                                         |
| `documentId`, `sourcePath`    | The document carrying the reference. `unused-asset` names a file rather than a document: its `documentId` is empty and its `sourcePath` and `reference` are the file's path from the working directory, without a position                                                                  |
| `reference`                   | The author's own text: a URL in the first form `sourceForms` finds in the source, so a link a host stored as `guide` is reported as the `guide.md` the author wrote                                                                                                                         |
| `position`                    | Optional                                                                                                                                                                                                                                                                                    |
| `available`                   | On `missing-anchor` and `missing-embed-anchor`, the anchors the target document really has; for `missing-embed-anchor` its heading ids only, since an id raw HTML declares can be linked to but starts no section to embed. On `unmatched-tree-order`, the titles on the tree's first level |
| `suggestions`                 | On `missing-document`, `missing-asset`, `missing-anchor`, `path-case-mismatch`, `undefined-variable` and `undefined-link-reference`, up to three corrections nearest first; absent when nothing is close enough                                                                             |

A name, or a path's file name, is close enough when it differs only in letter case or by at most one edit for every three characters of the longer one, and always one. So `api` suggests `app` but not `cli`. A link to a file that is no page, such as `/file/a.csv`, is corrected to a file with the same extension under the roots or an asset directory rather than to a document.

A suggested path is written in the form the source holds, so replacing the reference with one fixes the issue:

- the same relative or root-relative path
- the deployment base the link spelled, when `withoutBase` removes it and the target is reached without it (a document, or a file under an asset directory, while a file under the roots is reached as written)
- an extension only if the link had one
- the query and fragment kept
- for `path-case-mismatch` on an image or another file, the percent escapes the link was written with

A path made from a file's name has the white space, `#`, `?`, `%`, `\`, `&`, `<` and `>` in it percent-escaped, and its parentheses when they do not pair up, as `start%20here.md` for `start here.md`. A link destination holds no space and takes parentheses only in pairs. In a destination, `#` and `?` would start its fragment or query, `%`, `\` and `&` an escape or a character reference, and `<` an address in angle brackets.

This table lists each code and its severity; the paragraphs below give the rules in full. → [What it reports](../check.md#what-it-reports)

| Code                          | Severity |
| ----------------------------- | -------- |
| `missing-document`            | error    |
| `missing-anchor`              | error    |
| `missing-asset`               | error    |
| `missing-embed-source`        | error    |
| `missing-embed-anchor`        | error    |
| `invalid-embed-spec`          | error    |
| `duplicate-anchor`            | error    |
| `empty-anchor`                | error    |
| `unstable-anchor-link`        | warning  |
| `unmatched-embed-replacement` | warning  |
| `unreplaceable-embed-section` | error    |
| `empty-embed-cell`            | warning  |
| `unportable-embed-component`  | warning  |
| `imported-embed-component`    | error    |
| `cyclic-embed`                | error    |
| `unmatched-tree-order`        | warning  |
| `table-column-count`          | error    |
| `table-unclosed-code`         | error    |
| `path-case-mismatch`          | error    |
| `missing-translation`         | warning  |
| `translation-anchor-mismatch` | warning  |
| `translation-visibility`      | warning  |
| `invalid-anchor-format`       | warning  |
| `missing-title`               | warning  |
| `empty-alt`                   | warning  |
| `unused-asset`                | warning  |
| `undefined-variable`          | error    |
| `undefined-link-reference`    | warning  |
| `unmatched-table-note`        | warning  |

Links and images are checked as the tree stores them. A reference-style one, which a remark host stores as `linkReference` or `imageReference`, is checked as the address of the first definition of its label, as a markdown-it host stores the link or image it resolved. It is placed where that definition spells the address.

`CheckOptions` accepts these fields; each is described below:

| Option                | Meaning                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ignore`              | Codes dropped from the result                                                                                                                                                                                                                          |
| `sourceRoot`, `roots` | Where documents live on disk, defaulting to the library's own roots. Without any roots the file pass is skipped and only document links, anchors and embeds are checked, and `unusedAssets` reports nothing, since no reference was resolved to a file |
| `assetDirs`           | Directories a local target is also looked up under at its library path, after the roots                                                                                                                                                                |
| `withoutBase`         | The deployment base a root-relative path is looked up once more without                                                                                                                                                                                |
| `externalPaths`       | Root-relative prefixes another application serves on the same host; links into them are not checked                                                                                                                                                    |
| `siteOrigins`         | Origins as URLs; an absolute URL on one is checked as the root-relative path after it                                                                                                                                                                  |
| `translations`        | At least two `{ code, prefix?, suffix? }` languages whose documents are compared                                                                                                                                                                       |
| `anchorPattern`       | A regular expression source every explicit heading anchor must match whole                                                                                                                                                                             |
| `requireTitle`        | Reports `missing-title`                                                                                                                                                                                                                                |
| `requireAlt`          | Reports `empty-alt`                                                                                                                                                                                                                                    |
| `unusedAssets`        | Glob patterns, from the working directory, for files every one of which some document should reference                                                                                                                                                 |

A document link resolves in library coordinates: a relative path against the document's library path and a root-relative path as a library path directly. When `withoutBase` is given, a root-relative path is looked up once more with the deployment base removed, the way the exporter looks a route up. A relative path that climbs above the top of the library names no document.

A path that names a directory, such as `./` or `guide/`, resolves to that directory's index document; with its trailing slash it does so even beside a document of the directory's own name, which the spelling without one names. A query names no other document, so `guide/?tab=1` is checked as `guide/`.

The path is percent-decoded first; a `%` that is not an escape, as in `100%.md`, is looked up as written and reported as missing with its document instead of ending the check. A fragment matches an anchor either as written or decoded, since hosts percent-encode a fragment that is not ASCII.

`externalPaths` lists root-relative prefixes another application serves on the same host, such as `/sdk`; a link whose pathname is one of them or sits beneath one is external and not checked, and `isExternalPath(url, prefixes)` is the exported test.

Local links and images then resolve through [`resolveLocalTarget`](../../packages/cudoc/src/node/local-target.ts), exported with `isExternalPath`, `externalUrl` and `parseSrcSet` from `@cudoment/cudoc/node/local-target`, the same function `cudoc-export` copies assets with, so the checker and the exporter cannot disagree about whether a target exists. Its `LocalTargetRoots` is `{ roots, assetDirs?, withoutBase?, externalPaths? }`, and a document-relative path reaches disk through the root that holds its library path.

`resolveLocalTarget(url, documentSourcePath, roots)` returns a `LocalTarget`. A fragment, a scheme, a protocol-relative URL or a path under `externalPaths` is `{ kind: "external", url }`. A file that exists is `{ kind: "resolved", relative, source, suffix }`: `relative` is its library path, or its path under an asset directory, `source` the file on disk and `suffix` the query and fragment as written. Anything else is `{ kind: "missing", relative, suffix }`.

It tries the files a URL may name in order: under the roots by the library path the URL names, then under each asset directory by the root-relative path with the base removed. `parseSrcSet(value)` returns the `{ url, descriptor }` candidates of a `srcset` as the HTML standard reads them. A URL runs to the next ASCII white space, commas it ends with are separators, empty candidates are skipped, and a descriptor runs to the next comma outside parentheses. The embed resolver and the exporter both read `srcset` with it.

`siteOrigins` lists origins as URLs; each is reduced to `scheme://host[:port]` and one that does not parse, or is not `http` or `https`, throws. An absolute link or image URL starting with one of them, compared without letter case and followed by `/`, `?`, `#` or nothing, is checked as the root-relative path after it, through every step above. It is reported with the URL as written.

`anchorPattern` is a regular expression source matched against every explicit heading anchor whole (`^(?:pattern)$` with the `u` flag), one that does not compile throws, and a mismatch is `invalid-anchor-format`, placed at the anchor's marker.

`requireTitle` reports `missing-title` at 1:1 for a document with no depth-1 heading with visible text anywhere in its tree and no front matter `title` that [`documentTitle`](./document.md#page-metadata) would take. Docusaurus wraps the page's `#` heading in a `<header>`, and a badge is not text. The `title` it would take is a string that is not only white space, or a number. `requireAlt` reports `empty-alt` for a Markdown image, or a host component standing for one, whose alternative text is empty or white space.

`unusedAssets` is a list of glob patterns in the [collection dialect](#collection), read from the working directory. Each pattern's leading segments without `*` or `?` name the folder walked, dot entries and `node_modules` skipped. Every file a pattern matches that no link, image or definition (`[label]: ./chart.svg`, which `![alt][label]` cites) resolved to during the check is `unused-asset`. The paths are compared as `fs.realpathSync.native` spells them.

Raw HTML, an MDX element left a JSX element because an attribute is an expression, such as `<img src={img}>`, and front matter are not read, so a file referenced only there is reported.

`path-case-mismatch` is decided the same way on every disk. A document link whose path names no document but does name one when ids are compared without letter case is reported with that document's library path written the way the link was.

A local target the file pass resolves is checked segment by segment against the directory listings for the segments the URL spells, `.` and `..` aside. One that resolves only through a case-insensitive disk is reported. On a case-sensitive disk the same URL resolves to nothing, and before reporting it missing the files `resolveLocalTarget` tries are looked up the same way. So the verdict and the suggestion are the same on both.

`translations` is a list of at least two `{ code, prefix?, suffix? }` languages with distinct codes; at most one may have neither a prefix nor a suffix, and it takes every id the others do not claim. A document belongs to the first language whose prefix starts its id and whose suffix ends it, leaving a non-empty key, and documents with the same key are translations.

For each document and each other language, a missing counterpart is `missing-translation` (its `reference` is the expected id). Explicit anchors the document has and the counterpart lacks, compared against every anchor the counterpart offers, are one `translation-anchor-mismatch` on the counterpart naming up to five of them. A published document with a private counterpart is `translation-visibility` on the published one. These three are placed at 1:1.

When the library was collected with `variables`, every `(=name)` marker its trees still hold in the fields normalization replaces, a tab's label and a code block's title included, outside `cudoc-` fences, names a variable the library does not define. It is `undefined-variable` (an error), once per marker and document, with the closest defined names as `(=name)` suggestions.

A link made from a shared link reference has its issues placed at the `[label]` it came from, with ` (the shared link reference [label] in linkReferences)` added to the message and no `suggestions`, since the correction belongs in the configuration. Such a link is one normalization marked `data.cudoc.kind: "reference"`, or, on a markdown-it host that resolved it itself, one whose address the source does not spell in any form `sourceForms` tries and that a `linkReferences` address does.

When the library was collected with `linkReferences`, a full reference `[text][label]` or a collapsed `[label][]` still in a text node, whose label holds a letter and no bracket and which the source spells as written, names a label nobody defined. It is `undefined-link-reference` (a warning), once per label and document, with the closest shared labels as `[label]` suggestions. One the source writes with escaped brackets, as `\[text\]\[label\]`, is text the author meant and is not reported.

It is placed at the label where the source first spells the reference outside code and after no odd run of backslashes. That search passes over an example in a fenced, indented or raw HTML block, front matter, an MDX expression or a code span, one running over a paragraph's lines included.

When collection read table notes, `syntax.tableNote` taking cudoc syntax or the `docs` host, whose `Footnote` is one unless `tableNote` is `off`, every table is compared with the `tableNote`s right after it. It is compared with every one of them, since each `Footnote` of the `docs` profile is a note of its own. A table is a GFM `table` or one written or rebuilt by a layout rule as elements under the HTML names, which the `docs` host gives its `Table` components too. A table drawn under other component names, as a layout rule's `components` may give it, is not read.

The marks a table's cells carry are matched against the marks its note paragraphs start with. A cell's words are read whole across bold and other formatting, a line break or a list in the cell separating words as white space does. A mark is a run of `*`, `†` or `‡`, or of superscript digits optionally closed by `⁾`. It stands right after a letter, digit, closing bracket or quote or a code span, and is followed by the end, white space or punctuation, as in `X*`, `**X**\*` or `` `id`† ``. Marks come one or several in a row, as in `X¹⁾²⁾`, never inside code.

A note numbered `1)`, as the `docs` profile's `Footnote` often is, gives the same number in superscript, `¹⁾`, which is how a cell writes it, and is reported as it is written. Superscript digits alone count only when a note starts with them, since `m²` writes a unit.

A mark no note gives is reported at the marked word, and a note no cell refers to at the note, both `unmatched-table-note` (a warning). A note under a table whose cells carry no mark at all is a remark on the whole table, as `\* Subject to change.` is, and is not reported.

Each is placed within its own table's lines. The tree's tables are matched to the source's in order by their header row, links, tags, code spans, emphasis and header cells merged away with `>>` aside. When a header does not match and the tree and the source hold as many tables, they are matched by their order alone.

A table found neither way, as one written as elements is, which the source holds as no pipe table, is searched from the line after the table before it, the last of its marks and notes found ending it. A note is placed at the words it opens with, up to its first formatting, on the first line after the table that holds them.

Table issues come from [parsed-tables.ts](../../packages/cudoc/src/node/parsed-tables.ts), which parses `document.source.text` with the library's own parser: remark (`remark-parse` and `remark-gfm`, with `remark-directive` on Docusaurus and `remark-mdx` for an `.mdx` document) on every host but VitePress and Eleventy, and markdown-it on those two. markdown-it is the package their adapters take as a peer dependency, loaded from the library's roots or else the working directory, with raw HTML on and with the host's own block rules.

On VitePress the block rules are its containers (`tip`, `info`, `warning`, `danger`, `details`, `v-pre`, `raw` and `code-group`), its `[[toc]]` and its `<<<` code snippet, each of which takes its line, and its raw HTML in place of markdown-it's. VitePress's defaults are assumed, so a site's own `markdown` options, such as component tags or a `toc` pattern, are not read.

In VitePress's raw HTML, `<script>`, `<pre>` and `<style>` in any case run to a closing tag of any of the three, `<textarea>` reads as any other lone tag, and an attribute may start with `@`. A line opening a component, any tag but an HTML inline or block-level element's, ends a table or a paragraph and, closed on its line, takes that line alone.

On Eleventy a container of any name opens, as markdown-it-container registered under that name opens it, and indented code blocks are off, as Eleventy turns them off in every renderer it is given. A container closes at a line of at least as many `:` and nothing else but spaces or tabs. Front matter at the top is blanked first, its lines kept, since a host reads it before its parser does.

The parse places every table in its block quotes and list items, lazy lines and indentation included, and keeps every cell a row has. A micromark row node holds the cells the page drops, and markdown-it's table rule is wrapped so each row is read from where that rule starts it in its container.

A header the delimiter row below disagrees with makes no table, so no parse shows one. Each line over a delimiter row is therefore counted with every leading list item or block quote marker taken off in turn, and the source is parsed again with the delimiter row given that many cells. A table there is one `table-column-count` at the header.

Lines the parse puts in a code block, a raw HTML block or an MDX expression or import are not tried, save a block's first line on markdown-it, which tries a table before any other block. In an `.mdx` document a cell's expression is read blanked, so no backtick or pipe in its JavaScript counts.

The table notes check places marks with the same reading, and a document's parsed reading is kept until its source changes, so `cudoc lsp` parses again only a document that changed. A markdown-it not found is looked for again after 30 seconds. When the source does not parse, as MDX that does not compile, or no markdown-it can be loaded, the line reader answers.

The line reader, [source-tables.ts](../../packages/cudoc/src/node/source-tables.ts), which `withoutCode` uses too, reads `document.source.text` line by line as the library's parser reads a pipe table. Front matter at the top, fenced code and raw HTML are skipped.

Raw HTML follows CommonMark: a comment, `<?`, `<!X` and `<![CDATA[` run to their closing marks, and `<pre>`, `<script>`, `<style>` and `<textarea>` to the line holding a closing tag of the four. A block-level tag such as `<div>`, `<details>` or `<table>` runs to the next blank line. Any other tag opens raw HTML only when it stands alone on its line and does not continue a paragraph, so a line opening with `<b>` is text.

An `.mdx` document has no raw HTML, since a tag there is a component whose children are Markdown, and skips every MDX expression `{…}` instead, a comment `{/* … */}` included. An expression is JavaScript, read with its strings, templates, regular expressions and JSX as JavaScript reads them, and front matter's braces open none, so an attribute's template string holding rows is no table. Braces in a code span, which may run over the lines of its paragraph when a run of as many backticks closes it there, or in a quoted attribute value are text.

A `/` after a `}` is read as JavaScript reads it. After the `}` that closes a block of statements, `catch {}`, `for await (…) {}` and `case 1: {}` included, or the body of a function or class declared where a statement starts, a `/` starts a regular expression, as in `if (a) {} /{/.test(b)`. A declaration on a new line after a value stands where a statement starts too. After an object's `}`, after the body of a function or class written as a value, as in `(function () {} / 2)`, or after `++` and `--` it divides, a comment in between changing nothing.

Block quotes and list items are containers: a fence or raw HTML ends with its container, and a delimiter row and every row of a table sit in the header's container. A line outside the container of the paragraph before it that starts no block of its own continues that paragraph lazily and, with one exception, heads no table. A line that opens a block quote left of the list item that paragraph sits in starts the quote instead, and a `===` at another quote depth than the paragraph is never its underline.

The exception is micromark's: it takes a lazy line as a table's header when the delimiter row below it sits in the paragraph's container with as many cells. This reader reads such a table, in the quote, only where it places the paragraph exactly. That is in block quotes alone, each `>` starting its line or right after the one before, from a lazy line indented less than four columns that is not a lone tag. So `> quote` over `a | b` over `> --- | ---` is a table there.

After a lazy line starting with a list item's marker, which is the paragraph's, no lazy line heads a table until the paragraph has a line inside its quote again. markdown-it keeps a lazy line in a block quote's paragraph.

micromark also makes such a table under an indented `>`, and both parsers make one in a list item; this reader leaves those out, so it can miss such a table. Outside MDX, which has no indented code, a line indented four or more columns past the list item it sits in opens nothing, and a delimiter row or a row indented that far is not the table's. Such a line is code only where indented code blocks are on, so not on Eleventy.

A table is a header row followed by a delimiter row, one that does not start `- `, which is a list item. micromark, used on every host but VitePress and Eleventy, takes a header without an unescaped `|` over a delimiter row of one cell. It leaves a row of more, which makes no table with it, to head a table of its own. It never takes a line of tags alone as a header. Outside MDX, over a row that matches it, the tag opens raw HTML that runs to a blank line, and in MDX the tags are a component that ends the paragraph, lazily continued or not.

markdown-it wants a `|` in the header, escaped or not, and tries a table before a heading or a list item, so `## a | b` or `2. a | b` over a matching delimiter row heads one there.

The body runs to the first line that is blank, leaves the container, or starts another block: a fence, a list item, a heading, a thematic break or raw HTML. On markdown-it that raw HTML does not include a lone tag, and in MDX it is a line of tags alone. On markdown-it any line starting `:::` is another such block, read as a container's, and it ends a paragraph too. Every other line is a row, a pipe or none, so a note written right under a table without a blank line is a row of one cell.

A row is split on every unescaped `|` after one leading and one trailing pipe are dropped, which is how both micromark and markdown-it 14 split it, code spans included. What escapes a pipe follows the library's host: markdown-it, on VitePress and Eleventy, takes a pipe right after a backslash as escaped, and micromark, everywhere else, one after an odd run of backslashes. So `\\|` divides a row there and not on a markdown-it host.

A header whose cell count differs from the delimiter row's is one `table-column-count` (the lines are no table), and so is each row with a different count. In each cell, a run of backticks that no run of the same length closes is `table-unclosed-code` at the run. When the same run closes on the whole row, the message names the pipe that split it, and the run that closes it in a later cell is not reported again. Both are errors and placed at the row or the run.

Positions are recovered from `document.source.text` rather than the stored tree, because collection strips `position` when it persists an AST. A duplicate anchor reports its later declaration. A reference the source no longer contains yields no position rather than a wrong one.

The search passes over text that spells a reference without being it. It prefers an occurrence terminated by a Markdown destination delimiter, so `guide.md#limit` does not report the line holding `guide.md#limits`. It skips a link's own text, so `[./guide.md](./guide.md)` is placed at its destination. It skips code blocks and spans, so an editor's fix does not edit a code example that shows the same link; a reference written only in code, such as a variable, is found there.

`formatCheckResult(result: CheckResult): string` renders the result grouped by document with `line:column` prefixes, each document's issues ordered by position with unplaced ones first. It shows at most four `available` entries before summarising the rest, anchors as `#id`, the names of an `unmatched-tree-order` in double quotes, and `suggestions` on a `did you mean:` line. Its last line counts the errors and warnings and the documents they are in, with unused files counted apart, as in `1 warning in 0 of 1 documents and 1 file`.

Embed sources resolve through `resolveDocumentReference`, the function the resolver itself calls, so a source the checker accepts is one the build finds. Whatever it rejects (a missing document, a URL, a backslash path, a path escaping the root, a malformed percent-escape in the anchor) is `missing-embed-source` with the resolver's message. A source whose anchor the target lacks, and a selection that matches no section, are `missing-embed-anchor`, as the resolver fails on both.

A tree embed's sources are read through `resolveTreeSource`, as the resolver reads them. A source it rejects, a folder with no document below it among them, is `missing-embed-source` with its message. A document source whose anchor names none of the target's heading ids is `missing-embed-anchor` with those ids as `available`. A column naming an extractor the library does not carry is `invalid-embed-spec`, placed at the extractor's name. A folder source is read with the embedding document as `page`, so a folder whose documents a public page would all leave out is `missing-embed-source` too.

When every source resolves, each `order` entry other than `...` that matches no first-level line, as `namesTreeNode` matches, a private document the page leaves out among them, is `unmatched-tree-order`, placed on the entry's own line inside the fence after `order:`. A tree is neither followed for cycles nor inspected for components or empty cells, because it copies no section text and leaves an empty column out of its line.

`cyclic-embed` follows the embeds inside every section a block copies, parsing each nested block the way the resolver expands it, in the copy the block's `replace` rules leave. So a rule that turns a nested fence into ordinary code ends the chain there, and one that points a nested source back starts one. It reports a chain that returns to a section already being copied, or reaches the resolver's depth limit of 64, as `a#* -> b#limits -> a#*` at the line of the fence that starts it. The build fails on the same chain.

`invalid-embed-spec` covers a block that `parseEmbedSpec` rejects. The reported line is the fence line plus the parser's own line when it has one. The column is the parser's own column plus whatever stands before the block's text on that line of the file (indentation, a quote's `>`, a list item's offset). So the coordinate is the file's rather than the block's, and the parser's block-relative `at line N, column M` suffix is removed from the message instead of being repeated. An error without a coordinate is placed on the fence.

The fences are found by parsing the stored source as Markdown with GFM and front matter, as MDX for an `.mdx` document. A fence shown inside a longer fence or an indented code block is example text, and one inside a quote, a callout or a list item counts. The fences found have to hold the document's embed blocks in order, compared by their text without `\r` or trailing whitespace. When they do not, or the source does not parse, the source is scanned line by line, with a fence closed as Markdown closes it. When that does not find the blocks either, the embed diagnostics carry no position.

A host that reads a block differently from Markdown, such as a VitePress component's HTML block that runs on over a fence, therefore gets no position, unless the fence Markdown reads holds the same text as the host's block. `cyclic-embed` is placed on its fence the same way.

`unmatched-embed-replacement` reads the same text the rules rewrite, `sectionText` in [replace.ts](../../packages/cudoc/src/node/replace.ts): `source.sections[anchor]` bounded by `end` or `ownEnd`, a list item's marks and indentation taken off, or the whole `source.text` for a whole-document embed. It applies the rules in order to each, recording which found something. A rule is reported only when it matched no slice, because a rule list runs against every selected section and one aimed at a single section misses the rest by design. An unusable pattern counts as matched; that is the resolver's error to raise.

`unreplaceable-embed-section` reports each selected section that `unreplaceableSection` from the same file refuses, with its message, so the check stops where the build would, whichever compiler each has.

`empty-embed-cell` runs the same extraction a table render performs, through `buildEmbedRow` and `extractCell`, over every selected section of every column written as a mapping. It reports each cell whose value is missing with the column's number and header, the row's section and the extractor's `problem` text. Shorthand columns are not reported: `summary` of a section that opens with a table is legitimately blank. An `{ extractor }` column naming an unregistered extractor is reported as `invalid-embed-spec` once per row instead of aborting the check.

`unportable-embed-component` inspects what an embed would actually copy. The selection is applied with [`collectSections`](../../packages/cudoc/src/sections.ts), the same function the resolver uses, so `includeChildren: false` and `select` narrow the inspected tree the way they narrow the copy. A section named in the source (`reference.md#limits`) is combined with `select` as the resolver combines them, and a `render: { type: table }` embed is skipped because only heading text travels.

A node whose type begins with `mdx` or ends with `Directive` is reported, excluding `mdxjsEsm` and `yaml`, which [`documentToHast`](../../packages/cudoc/src/render.ts) drops rather than refusing. When `select.anchors` names a section that does not exist, `collectSections` throws and that is reported as `missing-embed-anchor` rather than swallowed, because the build raises the same error.

Under `replace` rules the copy is not the section as collected but its rewritten Markdown compiled again, and `cyclic-embed`, `empty-embed-cell`, `unportable-embed-component` and `imported-embed-component` all read that copy, so a rule that rewrites a component into prose leaves nothing to report. The rewriting is the resolver's own: both import it from [replace.ts](../../packages/cudoc/src/node/replace.ts). Each copy is compiled once per check, however many inspections and chains read it.

A library with a synchronous host compiler compiles the copy with it. `cudoc check` loads one without, and a library collected through an asynchronous compiler keeps none the checker can call, so there the standalone compiler reads the rewritten Markdown with the library's options. It reads embed fences, components and tables as the host does, but syntax only the host's parser knows is lost or refused. A VitePress `::: tip` container stays text, and MDX that carries Docusaurus's `{#id}` or an HTML comment does not compile.

A section whose copy cannot be built is left out of those four inspections rather than read as collected, since the rules may have changed exactly what they look for. Its copy cannot be built when the standalone compiler loses or refuses host-only syntax, or when the resolver refuses the rules, the snapshot or a repeated section id, which fails the build on its own.

`unportable-embed-component`'s wording depends on the library's host: for `next`, `docusaurus` and `nextra` it says the host renders the copy where it is spliced in and only standalone export needs a renderer. For every other host it says neither can render it.

`imported-embed-component` compares the copied components' names (the part before any `.`) against `target.imports` and `doc.imports`. A name the source document imports in its own file and the embedding document does not is reported as an error. That is an error because the export drops `mdxjsEsm` and the spliced copy lands in a module with no binding for it. It is reported only for a `render: section` embed, after `unportable-embed-component`.

`collectAnchors(tree: Root)` returns `{ id, explicit }` for every heading anchor and for every id an element in raw HTML declares, such as `<a id="legacy"></a>`, which counts as explicit because an author wrote it. For a heading, `explicit` reflects `data.cudoc.explicitId`, which is what separates an author's anchor from a slugger's, and therefore what `unstable-anchor-link` keys on. `duplicate-anchor` compares heading ids only.

`unstable-anchor-link` fires for a link to a generated anchor ending in `-<digits>` only when the same id without the suffix is also in the document. `#overview-1` beside `#overview` is a slugger's disambiguation that moves when another heading of that title is inserted, while `## Version 2`, whose own text makes `version-2`, is left alone.

## Datasets

`generateDataset` publishes the projected ASTs of a collected library as a dataset. Source/import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)` synchronously publishes projected ASTs and returns `{ schemaVersion: "1.0.0", documentCount, documents }`.

`DatasetOptions` extends `ProjectionOptions` with these fields:

| Field                 | Meaning                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inputDir`            | Required; a directory of AST JSON, typically `.cudoc/documents/documents`                                                                                                |
| `outDir`              | Required                                                                                                                                                                 |
| `library`             | Optional; the collected library directory those ASTs came from, read for scopes and private documents; defaults to the library whose `documents` directory `inputDir` is |
| `documents`, `scopes` | Optional; the documents and scopes to include                                                                                                                            |
| `projectionId`        | Default `custom`                                                                                                                                                         |
| `requireVersion`      | Default true                                                                                                                                                             |

A `manifest.json` or `meta.json` at the top of `inputDir` is skipped; a document with either name in a subdirectory is a document like any other. Document IDs are exact extensionless relative paths. Explicitly requested missing IDs throw.

With `library`, its manifest's root bases decide where a document's scope segment starts: the first segment after the longest base prefixing the ID, so `docs/ko/guide` and `terms/ko/token` both belong to scope `ko` under bases `docs` and `terms`. Its private documents are left out, so requesting one in `documents` is an error. `scopeOf(id, bases)` is exported.

Without `library`, an `inputDir` named `documents` beside a library's `manifest.json` reads that library, so a dataset made straight from a collection leaves its private documents out. A `manifest.json` whose `schemaVersion` is not a number, such as a dataset's own, is not a library's. For any other input the scope is the first path segment and nothing is private.

The generator projects the stored ASTs and resolves nothing: a `cudoc-embed` block stays the `code` node it was collected as, so an embedded section appears in the dataset only in the document that owns it.

Output is `documents/<id>.json` plus `manifest.json`, containing schema `"1.0.0"`, projection ID/options, document count, scopes and `{ id, hash, outputHash }` entries. `hash` covers input file bytes decoded as UTF-8; `outputHash` covers serialized projected AST. Input and output are validated. File-specific failures retain their cause and abort publication. See [projectAst](./document.md#projection) for filtering semantics.

## Storage

`publishDirectory` replaces a generated output directory whole, so a reader never finds one half written. Source/import: [storage.ts](../../packages/cudoc/src/node/storage.ts), `@cudoment/cudoc/node/storage`.

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

Publication rejects overlapping input/output and a symlink output. **Any existing output, even an empty directory, must already carry `.cudoc-output` with `cudoc\n`.** Start with a nonexistent output directory. The callback receives a staging path; a staging directory that cannot be created releases the lock again.

The lock, `<output>.lock`, holds the writing process's id and is linked into place with the id already written, so it is never read empty. A lock whose process is still running fails with `cudoc: <output> is being written by process <pid>; wait for it to finish`.

Any other lock was left by a build that was killed: it is claimed by renaming it, and the lock is taken again before anything else is touched. A process that finds a live id in what it moved puts it back and reports that build instead, and one that finds the stale lock already claimed tries the lock again. What the killed build left is recovered by the process holding the lock, because a running build's own directories exist only while it holds the lock. The moment between reading a dead id and renaming the lock is the one window in which a third writer can still slip in.

Recovery looks only at the names publication gives, `<output>.previous-<uuid>` for a backup and `<output>.cudoc-staging-` followed by six letters or digits for a staging directory. It also looks only at a real directory whose `.cudoc-output` holds exactly `cudoc\n`, the test an existing output has to pass. Such a backup is moved back when the output itself is missing and removed otherwise, and such a staging directory is removed. A directory under any other name, one whose marker says anything else and a symbolic link are left where they are.

An owned directory is removed with its marker last, so a removal that stops partway leaves one the next recovery finishes; a leftover that cannot be moved or removed fails the publication and releases the lock. Two leftovers are not recovered: a staging directory from a build killed before it wrote the marker, and the lock's own temporary files, `<output>.lock.<pid>-<uuid>` and `<output>.lock.stale-<pid>-<uuid>`, from a build killed while it took the lock. They hold nothing of the output and can be deleted.

The callback may be synchronous or asynchronous. `publishDirectory` inspects what `build` returned: a thenable defers the commit until it settles and makes the call itself return a promise, anything else commits immediately and returns nothing. The overload signatures are a convenience; that runtime check is what decides. A failed build leaves the previous output intact, and a failed final rename restores it.

The lock is held for the whole transaction, so a concurrent publication to the same output fails while an asynchronous build is still running. A process killed mid-build leaves the lock and the staging directory behind until the next publication to that output recovers them; an asynchronous build widens that window rather than adding a new failure. These helpers protect generated output; they are not a sandbox for arbitrary compiler or renderer callbacks.

## Individual AST snapshots

These public primitives handle one AST file at a time; they do not create library manifests, original-source snapshots or prepared fenced embeds, and the usage guides use the library workflow instead. Sources: [export-ast.ts](../../packages/cudoc/src/node/export-ast.ts), [load-ast-file.ts](../../packages/cudoc/src/node/load-ast-file.ts), [paths.ts](../../packages/cudoc/src/node/paths.ts).

- `exportAst(options?)`, the default from `/embed` or `/node/export-ast`, is a remark plugin writing a snapshot at its pipeline position. It leaves the rendering tree intact and atomically writes each file.
- `resolveExportAstOptions(options?) → ExportAstContext`, `projectTree(node, context) → unknown`, `buildExportedAst(tree, context) → object` expose export preparation without requiring disk writes. `buildExportedAst` takes what cudoc drew for the screen off a copy with `withoutPresentation`, so a snapshot written after presentation holds the semantics and the meta as written, and then strips the configured properties.
- Export defaults: source `docs`, output `.cudoc/ast`, extensions `.md`/`.mdx`; `strip` removes `position` and `estree` from every node (`DEFAULT_STRIPPED_PROPERTIES`); `dropNodeTypes` removes `mdxjsEsm`, `yaml` and `toml` with their subtrees (`DEFAULT_DROPPED_NODE_TYPES`); write version `cudocAstVersion: 1`; validate true. Options also include custom `version`, `tableCellElement`, `write(filePath, contents)` and path options.
- `loadAst(documentPath, options?)` from `/embed` reads an extensionless relative ID inside the output directory; a path that leads out of it, such as `../../secrets`, throws `cudoc: path escapes document root` instead of being read. `loadAstFile(filePath, options?)` from `/node/load-ast-file` reads a known file directly. Both validate by default and return `ExportedCudocAstRoot`, and their reader options are `version`, `validate` and `tableCellElement`, to which `loadAst` adds path options.
- `/node/paths` exposes `resolvePathOptions`, `getRelativeOutputPath`, `getOutputPath`, `DEFAULT_SOURCE_ROOT`, `DEFAULT_OUTPUT_ROOT`, `DEFAULT_EXTENSIONS`. `PathOptions` is `{ sourceRoot?, outDir?, extensions?, cwd? }`; unmatched/outside source paths return `null` from output mapping.

Prefer `loadAstFile` for a known server-bundle path. Include required JSON in deployment artifacts when runtime code reads it. The `/embed` barrel re-exports the individual export/read/path functions and lower-level query helpers, not the APIs earlier on this page.

## CLI

The `cudoc` command runs collection, checking, dataset generation and the language server from one configuration file. Source: [cli.ts](../../packages/cudoc/src/node/cli.ts), which runs [command.ts](../../packages/cudoc/src/node/command.ts).

```sh
cudoc collect --config cudoc.config.mjs [--watch]
cudoc check --config cudoc.config.mjs [--format text|json] [--strict]
cudoc dataset --config dataset.config.json
cudoc lsp --config cudoc.config.mjs
```

Only these commands and the `--config <path>` argument form are accepted; another command, a missing `--config` value or a `--format` other than `text` or `json` prints `Usage: cudoc <collect|check|dataset|lsp> --config config.mjs [--watch] [--format text|json] [--strict]` and exits 1, and any other argument is ignored. ESM files must default-export a configuration object; `.json` files are parsed directly. Paths inside config resolve from the invoking working directory, not the config's directory.

Errors go to stderr and set exit code 1. The usage line and an error whose message starts with a package prefix and a colon, such as `cudoc:` or `cudoc-vitepress:`, are printed as their message. A `caused by:` line follows for each cause it wraps, and any other error prints with its stack.

`collect` runs one [`collectDocuments`](#watching) pass: collection and preparation, published to `outDir` together, so a failed run leaves the previous library and its `embeds.json` in place, and embeds that cannot be prepared are listed together in one message (see [`prepareEmbeds`](#prepared-embeds)). A supplied compiler may be sync or async. It prints `{ documentCount, outDir }` as JSON, and without `--watch` it is always a full build. The configuration's `check` key is left out of collection, so it does not change the library's configuration hash, as it does not in the language server.

`collect --watch` runs [`watchDocuments`](#watching) with the same configuration and keeps running. The first pass continues from what `outDir` already holds, and every pass prints one JSON line (`documentCount`, `compiled`, the ids compiled, `reused`, `blocks`, `reusedBlocks`, `outDir`, `elapsed`). A failed pass prints its error and leaves the last good output in place.

`check` reads the library the last collection published in `outDir` (default `.cudoc/documents`) through `loadLibrary`, and runs [reference checking](#reference-checking) against it with the optional `check` key of the same configuration, which takes every [`CheckOptions`](#reference-checking) field. It collects nothing and writes nothing, so it needs no compiler; the only Markdown it compiles is an embed's copy that `replace` rules rewrite, which the standalone compiler reads. A host whose collector is a script of its own gives `check` a configuration naming the same `outDir`.

`roots` or `sourceRoot` at the top level of the configuration are handed to `loadLibrary`, so they must carry the bases the library was collected with. They tell the check where documents live on disk. Without them, at the top level or under `check`, a path is checked only against the collected documents: an image with no file and a link that names neither a document nor a file are not reported. Without a collected library it fails with `cudoc: no collected library in <outDir>; collect documents before checking them`.

`--format text`, the default, prints what `formatCheckResult` renders; `--format json` prints the whole result. Its exit code is 1 when any error is reported, or when `--strict` is given and anything at all is.

`lsp` serves the [language server](#language-server) on stdin and stdout with the configuration, destroys stdin when the editor exits so the process ends, and exits with the code the server returns. `dataset` passes its configuration to `generateDataset`, so `library` there names the collected library to read scopes and private documents from, and prints its JSON summary. The export CLI is documented in [adapters](./adapters.md#export).

## Language server

`serveLanguageServer` runs collection and the reference check for an editor over the Language Server Protocol, on every save. Source/import: [lsp.ts](../../packages/cudoc/src/node/lsp.ts), `@cudoment/cudoc/node/lsp`.

```ts
serveLanguageServer(
  config: LanguageServerConfig, // CollectConfig & { check?: CheckOptions }
  streams: { input: Readable; output: Writable },
): Promise<number>
```

It reads JSON-RPC 2.0 messages framed by `Content-Length` headers from `input`, writes its own to `output` and nothing else there, and implements this part of the Language Server Protocol:

| Message                                         | Behaviour                                                                                                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize`                                    | Replies with `capabilities` holding `textDocumentSync` `{ openClose: true, change: 1, save: { includeText: false } }` and `codeActionProvider` `{ codeActionKinds: ["quickfix"] }`, and with `serverInfo` `{ name: "cudoc", version }` |
| `initialized`, `textDocument/didSave`           | Runs a pass: `collectDocuments(config without check, previous)`, starting from `previousCollection(outDir)`, then `checkReferences(library, config.check)`. One pass runs at a time; saves during it ask for one more after            |
| `textDocument/didOpen`, `didChange`, `didClose` | Keeps the editor's text of each open document (full sync), which code actions read                                                                                                                                                     |
| `textDocument/codeAction`                       | Offers, for each diagnostic carrying suggestions, one `quickfix` per suggestion, the first preferred, replacing the first occurrence of the diagnostic's `reference` within its range with the suggestion                              |
| `cudoc/counterpart`                             | Answers `{ textDocument: { uri } }` with `{ language, uri }[]`, the documents the `check.translations` languages pair with it that exist; `[]` without `translations` or for a document in no language                                 |
| `shutdown`                                      | Replies `null` once a pass in progress has published                                                                                                                                                                                   |
| `exit`, or the end of `input`                   | Stops reading `input` and resolves with 0 after `shutdown`, 1 without it                                                                                                                                                               |

Any other request is answered with error `-32601`; any other notification is ignored. A request whose handler throws, as `cudoc/counterpart` does for a URI that names no file, is answered with error `-32603` and the error's message.

A pass publishes `textDocument/publishDiagnostics` for every file with issues and an empty list for each file the previous pass published and this one does not. An issue's file is its document's source file through the library's roots, or for `unused-asset` its path from the working directory. Its range is the issue's position converted to 0-based lines and characters, or the start of the file when it has none.

A diagnostic carries `severity` 1 for an error and 2 for a warning, `code`, `source: "cudoc"`, `message` and `data: { reference, suggestions }`. Each pass also sends `window/logMessage` with type 3 naming the documents checked and compiled and the issue count; a pass that throws sends type 1 with the error's message and leaves the published diagnostics as they were. Collection writes its compile diagnostics to stderr, never to `output`.

Before each pass the server reads `manifest.json` in `outDir`. When the library there was collected with another `compilerId` or for another `host` than the configuration names, the pass collects nothing and sends type 1 naming both, since writing would replace the library the site's build reads. A configuration or manifest without `compilerId` counts as the standalone compiler, and one without `host` as `markdown`. Without a readable `manifest.json` the pass collects as configured.
