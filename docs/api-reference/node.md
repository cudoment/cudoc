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
```

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

Every root scans `.md` and `.mdx` recursively, skipping dot entries and `node_modules` and rejecting symlinks. A root's `base` is normalized by dropping surrounding slashes; it may hold several segments (`docs/v2`), may be empty, and may not contain `.`, `..`, `?` or `#`. Two roots may share a base, and a base may extend another (`docs` and `docs/api`); the same directory may not be listed twice. `resolveRoots` performs this resolution and is what every consumer calls.

A document's **library path** is its root's base followed by its POSIX path under that root's directory, and its ID is the library path without the extension: `content/ko/guide.md` collected with `{ dir: "content", base: "docs" }` is `docs/ko/guide.md` and `docs/ko/guide`. With `sourceRoot` the base is empty and IDs are as before. `StoredDocument.sourcePath` is the library path. Library paths are the coordinate system for everything that names documents — links, embed `sources`, the checker, the exporter and `exclude`/`private` patterns — so a root-relative link `/terms/token.md` names the document `terms/token` whichever directory it was read from, and a relative link resolves in library coordinates too: it crosses from one root into another exactly when the bases mirror the directory names, and otherwise reports as missing. `documentIdOf` and `libraryPathOf` map a file to that coordinate through the innermost root containing it; `sourceFileOf` maps a library path back to a file, trying roots with the longest matching base first and preferring one that exists. Extension and case collisions across all roots are errors naming both files. Default URLs are `routeBase + id + routeSuffix` with the joining slash normalized, so bases become URL prefixes. Overrides must be unique root-relative pathnames, starting with `/` but not `//`, and containing no `?` or `#`. Frontmatter slugs are not inferred.

Glob patterns are matched against library paths with a small dialect: `*` and `?` within a segment, `**` for any number of segments, and a pattern without `/` matching a file or directory name anywhere. A trailing `/**` also matches the directory itself, so an excluded directory is not entered and a symlink inside it is never seen. There are no brace sets, character classes or negations; an empty pattern or one containing `..` is an error. `exclude` decides what is a document at all; `private` marks documents that are collected, checked and embeddable but carry `private: true` in the library and the manifest, which `cudoc-export` and `generateDataset` read.

Collection without a custom compiler is allowed for `markdown`, `html`, `next`, or an omitted host. Other host profiles require a callback. A Next.js project with additional plugins also needs a matching callback to retain parity.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler has the same arguments and returns Promise<CompiledDocument>.
```

`filePath` is absolute and `options.format` is inferred per file. Return a position-bearing tree before export removes source positions. Collection prints returned diagnostics to stderr with the relative file and line. It snapshots source ranges, validates/version-tags the export and publishes the library. The async builder compiles each file before publishing and retains the async compiler for replacements.

With `previous`, a document is taken from that library as it is — tree, snapshot, front matter, `private`, `imports` — when the configuration hash is the same, its library path is the same and its source text hashes to the stored hash; everything else compiles as usual, a document that disappeared from disk is dropped, and the published directory is complete either way. A reused document's diagnostics are not printed again. The result carries `incremental: { compiled, reused }` naming the document ids each way. A configuration change — options, routing, roots, patterns, extractor versions, `compilerId` — reuses nothing, which is also why a host upgrade must change `compilerId`: the hash cannot see what the compiler does.

`Library` has `documents: StoredDocument[]`, `options`, `configuration` (hash), `bases: string[]` (the roots' bases as collected, `[""]` for one root at the top), optional runtime `roots: ResolvedRoot[]` (absolute `dir`, normalized `base`), `compiler`, `asyncCompiler`. Each `StoredDocument` has `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`, `private: true` when a `private` pattern matched, and `imports: string[]` when the document imports anything: the local names its `import` statements bind, read from the compiler's `mdxjsEsm` estree before the export drops those nodes (`CompiledDocument.imports`, computed by `importedNames(tree)` from `@cudoment/cudoc/mdx`, also re-exported by `/markdown`). A host capture records the same, and for an `.mdx` file also scans the source with `importedNamesFromSource(source)` — top-level `import` statements outside fenced code, parsed as a module — because a host such as Nextra hoists the ESM out of the tree before the capture sees it. Compiler functions and the absolute root directories are not serialized; the manifest records each root's `base` only.

`loadLibrary` defaults to `.cudoc/documents`, validates the manifest version, AST contract and stored hashes, and reconstructs the library. It does not compare files on disk with current source documents or infer current compiler settings. Recollect to refresh source/configuration. Supply `roots` — a directory for the single-root shorthand, or the same `{ dir, base }` list collection used — to restore where documents live, which replacement compilation and asset resolution need; the bases given must be the ones recorded in the manifest, because the IDs were derived from them, and a mismatch is an error naming the recorded bases. Pass the original sync compiler for replacement, or attach the original callback to `library.asyncCompiler` and use async APIs. A preloaded library used only with prepared embeds needs no compiler. `{ cache: true }` keeps the loaded documents in memory per resolved `outDir` and returns the same `documents` array while `manifest.json` reads back byte for byte the same; a changed manifest, which every recollection produces, loads afresh, and the `roots` given are still checked against the recorded bases on every call. Without the option each call reads the files again. A server that loads the library on every request — a route handler rendering embeds, a search endpoint — uses the cached form; a build step that runs once does not need it.

## Library files

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  documents/<id>.json
  sources/<id>.json
  embeds.json              # Added by prepareEmbeds
```

| File                  | Contract                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 2`, configuration hash, document options, optional compiler ID, `roots: [{ base }]`, per-document metadata and hashes |
| `documents/<id>.json` | Versioned mdast root; `data.cudocAstVersion: 1`; export strips `position`/`estree` and drops `mdxjsEsm`                               |
| `sources/<id>.json`   | Original text, SHA-256 hash, format and section offsets                                                                               |
| `embeds.json`         | `schemaVersion: 2`; prepared embedded AST blocks, the documents each block read, and freshness metadata                               |

Manifest document entries contain `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`, `private: true` for a private document, and `imports` — the local names the document's own `import` statements bind — when it has any. AST/snapshot hashes cover `JSON.stringify` of their objects; the source hash covers original text. `configuration` hashes options, routing, the root bases, the `exclude` and `private` patterns and the compiler identity, so changing any of them invalidates prepared embeds. `LIBRARY_SCHEMA_VERSION` exports the current version; a manifest with another version is rejected with "incompatible document manifest". Use public functions to produce these files; do not hand-edit them.

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

Offsets use JavaScript string indexing. `start` begins at the heading; `end` is the next same/shallower heading or document boundary; `ownEnd` ends before a child heading. Dependency spans locate definitions in the original source. These ranges enable original-Markdown replacement even though exported AST positions are removed.

## Embedding

Source/import: [resolve-embed.ts](../../packages/cudoc/src/node/resolve-embed.ts), `@cudoment/cudoc/node/resolve-embed`.

```ts
type Replacement = { find: string; replace: string; regex?: boolean; flags?: string }
type CellValue =
  | "title" | "summary" | "parent"
  | { table?: number; row: number; column: number; skipTablesWithHeaders?: string[] }
  | { extractor: string }
type TableColumn =
  | "title" | "link" | "summary"
  | { header?: string; value: CellValue; link?: "section" | "parent" | "document"; minWidth?: string }
type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: TableColumn[] }
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
  extract(row: EmbedRow, context: { library: Library; documentId: string; column: TableColumn }):
    string | ExtractedCell | undefined
}

parseEmbedSpec(value: string): EmbedSpec
resolveDocumentReference(library: Library, reference: string, from: string): {
  document: StoredDocument; anchor?: string
}
resolveEmbed(library: Library, spec: EmbedSpec, context: EmbedContext): Root
resolveDocumentEmbeds(library: Library, documentId: string): Root
buildEmbedRow(document: StoredDocument, anchorId: string | undefined, tree: Root): EmbedRow
extractCell(library: Library, column: TableColumn, row: EmbedRow, context: EmbedContext): {
  cell: ExtractedCell; problem?: string
}
buildEmbedTable(library: Library, columns: TableColumn[], rows: EmbedRow[], context: EmbedContext): Root
// Async counterparts return Promise<Root>:
// resolveEmbedAsync(library, spec, context)
// resolveDocumentEmbedsAsync(library, documentId)
```

`parseEmbedSpec` parses YAML and validates supported top-level, selection and replacement keys, source lists, rendering choices and replacement rules. Unknown keys are rejected at all three levels and the message lists the known ones; `flags` without `regex: true` is an error rather than a silently ignored value. `parseEmbedBlock(value, documentId, number?)` wraps it so a failure names the document, the block and, for a parser error, its line and column. `sources` must be nonempty. The default render is `section`; default table columns are `DEFAULT_TABLE_COLUMNS`, title/link/summary. A table column is a shorthand name or a mapping validated key by key: `value` is required and is one of the three names, a cell coordinate mapping (`row` and `column` non-negative integers, optional `table` index and `skipTablesWithHeaders` strings) or `{ extractor }` alone; `link` is one of `section`, `parent`, `document`; `minWidth` is a CSS length matching a number and one of `px`, `rem`, `em`, `ch`, `%`. `render` accepts no key beyond `type` and `columns`. Selection behavior is defined in [document queries](./document.md#sections-and-queries).

A table render produces one `EmbedRow` per selected section through `buildEmbedRow`, read before ids are rebased so a cell's link points into the source document: `section.title` is the heading's visible text (or the document title for a whole document), `parent` is the nearest shallower heading above the section in the source tree, and `url` is the document route plus the anchor. `extractCell` turns one column into text and an optional link: `title`, `summary` (first paragraph among the section's direct children, plain text), `parent`, a table cell (tables inside the section in document order, minus those whose header row contains a `skipTablesWithHeaders` name; `row` 0 is the header row; text via `nodeText`) or an extractor's return value. A column's `link` resolves to the section's `url`, the parent heading's address (its anchor when it has one, else the document route) or the document route; an extractor's own `url` wins over none. When the value is missing — no paragraph, no heading above, too few tables, rows or cells, an extractor returning `undefined` or `""` — `cell.text` is `""` and `problem` says what was expected and what the section has. `buildEmbedTable` writes the header row with `data.hProperties.style` of `min-width: <minWidth>` on any column that sets it, then one row per `EmbedRow`. An `{ extractor }` column naming an extractor the library does not carry throws.

Extractors come from `BuildDocumentsOptions.extractors`, a name-to-`{ version, extract }` map: `version` must be a non-empty string and enters the configuration hash as `{ name: version }` sorted by name, so a changed extractor recollects like a changed compiler; the functions live on `Library.extractors` at runtime and are not serialized, and a loaded library has none, which is fine for prepared embeds and an error only when resolving a `{ extractor }` column anew.

References resolve relative to `context.documentId`, or from the document root when beginning with `/`. `.md`/`.mdx` and `#anchor` are supported. URLs, backslash paths, root escapes and missing documents fail. An anchorless source without a selector uses its whole document.

Resolution clones source ASTs. When replacement is requested, it reads the original selected source range, applies rules in order and recompiles with the original compiler/options. Literal replacement uses split/join (all occurrences); regex uses JavaScript `RegExp`, default flags `g`. Dependencies outside the selected range are appended unchanged. The original source and AST are not mutated. Async APIs retain an async compiler through a per-resolution compile cache. The returned root carries `data.cudocEmbedPrefix`, which the renderer uses to namespace footnote labels, and `data.cudocDependencies`: the sorted ids of every document the resolution read, the fence's sources and those of every embed nested in them, plus `"*"` when a `{ extractor }` column ran, since an extractor may read any document.

IDs, footnotes and definitions are namespaced; links/images and supported raw HTML attributes are rebased. Missing sections, circular dependencies, incompatible replacements and depth beyond 64 fail with context. Use different `prefix` values when combining independent `resolveEmbed` results. The whole-document and preparation APIs number their own embed blocks.

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

## Prepared embeds

Source/import: [prepare-embeds.ts](../../packages/cudoc/src/node/prepare-embeds.ts), `@cudoment/cudoc/node/prepare-embeds`.

```ts
prepareEmbeds(library: Library, outDir?: string, options?: { previous?: PreparedEmbeds }): Promise<PreparedEmbeds>
readPreparedEmbeds(outDir: string, documentId: string, source: string): PreparedEmbeds
embedKey(documentId: string, value: string, index: number): string
```

`prepareEmbeds` visits fenced embeds in all collected documents, resolves them asynchronously and atomically replaces `embeds.json`. Its default `outDir` is `.cudoc/documents`, **not inferred from the library**; pass your custom collection path explicitly.

`PreparedEmbeds` contains `schemaVersion: 2`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>` and `dependencies: Record<string,string[]>`, the `cudocDependencies` of each block under the same key. Keys are `documentId:index:sha256(fenceValue)`, with block numbering starting at 1. `readPreparedEmbeds` checks schema, manifest configuration, current document source hash and manifest document hashes. Missing or stale data throws and requests recollection; a file written by an earlier version is stale.

With `previous`, a block is taken from that result unresolved when four things hold: the configuration is the same, the set of document ids is the same (a document added or removed changes what links inside any block resolve to), the embedding document's hash is unchanged, and every id in the block's `dependencies` hashes as it did. A block whose dependencies include `"*"` always resolves again. The written file is complete either way; only the work is saved.

Collection publishes the library directory; preparation publishes its file afterward. They are separate publication boundaries. If preparation fails after a successful collection, rerun preparation/collection before building the host. Do not claim that the entire multi-step build rolls back as a single transaction.

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

`collectDocuments` is one pass of what the CLI's `collect` does: build the library — through the async builder when the config has a `compiler`, which may return a promise or a value — then prepare the embeds into `outDir`, handing `previous.library` and `previous.prepared` to the two steps so unchanged documents and unaffected blocks are reused. The pass reports the document ids it compiled (every id on a full pass), how many documents and blocks it reused, and its wall-clock time. `previousCollection(outDir)` loads what a finished run left in `outDir` — the library through `loadLibrary`, the preparation when its schema is current — and returns `{}` for anything missing, unreadable or incompatible, so a new process continues from the last run.

`watchDocuments` runs a pass, then another whenever a `.md` or `.mdx` file under any root is created, changed, renamed or deleted, after `debounce` milliseconds of quiet (default 150). It uses `fs.watch` recursively on each root directory. A change during a pass queues one more pass. A failed pass — a document that does not compile, an embed whose source is missing — goes to `onError`, the state of the last good pass is kept for the next one, and watching continues; collection may still have published a library the failed preparation does not match, in which case the host's read of `embeds.json` reports stale data until the next good pass, as it would after a failed `collect`. Unless `reuseOutput: false`, the first pass starts from `previousCollection(outDir)`. `ready` settles when the first pass is over, `close()` stops the watchers.

## Reference checking

Source/import: [node/check.ts](../../packages/cudoc/src/node/check.ts), `@cudoment/cudoc/node/check`; [node/report.ts](../../packages/cudoc/src/node/report.ts), `@cudoment/cudoc/node/report`.

`checkReferences(library: Library, options?: CheckOptions): CheckResult` walks every document and returns `{ issues, documentCount, checkedReferences }`. It reads only; nothing is written and the library is not modified.

`ReferenceIssue` carries `code`, `severity` (`"error"` or `"warning"`), `documentId`, `sourcePath`, `message`, `reference` (the author's own text), an optional `position`, and for `missing-anchor` and `missing-embed-anchor` an `available` array naming the anchors the target document really has. Codes are `missing-document`, `missing-anchor`, `missing-asset`, `missing-embed-source`, `missing-embed-anchor`, `invalid-embed-spec`, `duplicate-anchor`, `empty-anchor`, `unstable-anchor-link`, `unmatched-embed-replacement`, `empty-embed-cell`, `unportable-embed-component` and `imported-embed-component`. `unstable-anchor-link`, `unmatched-embed-replacement`, `empty-embed-cell` and `unportable-embed-component` are warnings.

`CheckOptions` accepts `ignore` (codes dropped from the result), `assetDirs`, `withoutBase`, `externalPaths`, and `sourceRoot` or `roots`, defaulting to the library's own roots; without any roots the file pass is skipped and only document links, anchors and embeds are checked. A document link resolves in library coordinates: a relative path against the document's library path, a root-relative path as a library path directly and, when `withoutBase` is given, once more with the deployment base removed, the way the exporter looks a route up. `externalPaths` lists root-relative prefixes another application serves on the same host, such as `/sdk`; a link whose pathname is one of them or sits beneath one is external and not checked, and `isExternalPath(url, prefixes)` is the exported test. Local links and images then resolve through [`resolveLocalTarget`](../../packages/cudoc/src/node/local-target.ts), the same function `cudoc-export` copies assets with, so the checker and the exporter cannot disagree about whether a target exists; its `LocalTargetRoots` is `{ roots, assetDirs?, withoutBase?, externalPaths? }`, and a document-relative path reaches disk through the root that holds its library path.

Positions are recovered from `document.source.text` rather than the stored tree, because collection strips `position` when it persists an AST. The search prefers an occurrence terminated by a Markdown destination delimiter, so `guide.md#limit` does not report the line holding `guide.md#limits`; a duplicate anchor reports its later declaration. A reference the source no longer contains yields no position rather than a wrong one.

`formatCheckResult(result: CheckResult): string` renders the result grouped by document with `line:column` prefixes, showing at most four `available` anchors before summarising the rest.

`invalid-embed-spec` covers a block that `parseEmbedSpec` rejects. The reported position is the fence line plus the parser's own line when it has one, so the coordinate is the file's rather than the block's, and the parser's block-relative `at line N, column M` suffix is removed from the message instead of being repeated.

`unmatched-embed-replacement` recomputes the source slices `transformedSection` cuts — `source.sections[anchor]` bounded by `end` or `ownEnd`, or the whole `source.text` for a whole-document embed — and applies the rules in order to each, recording which found something. A rule is reported only when it matched no slice, because a rule list runs against every selected section and one aimed at a single section misses the rest by design. An unusable pattern counts as matched; that is the resolver's error to raise.

`empty-embed-cell` runs the same extraction a table render performs, through `buildEmbedRow` and `extractCell`, over every selected section of every column written as a mapping, and reports each cell whose value is missing with the column's number and header, the row's section and the extractor's `problem` text. Shorthand columns are not reported: `summary` of a section that opens with a table is legitimately blank. An `{ extractor }` column naming an unregistered extractor is reported as `invalid-embed-spec` once per row instead of aborting the check.

`unportable-embed-component` inspects what an embed would actually copy. The selection is applied with [`collectSections`](../../packages/cudoc/src/sections.ts), the same function the resolver uses, so `includeChildren: false` and `select` narrow the inspected tree the way they narrow the copy, and a `render: { type: table }` embed is skipped because only heading text travels. A node whose type begins with `mdx` or ends with `Directive` is reported, excluding `mdxjsEsm` and `yaml`, which [`documentToHast`](../../packages/cudoc/src/render.ts) drops rather than refusing. When `select.anchors` names a section that does not exist, `collectSections` throws and that is reported as `missing-embed-anchor` rather than swallowed, because the build raises the same error.

`unportable-embed-component`'s wording depends on the library's host: for `next`, `docusaurus` and `nextra` it says the host renders the copy where it is spliced in and only standalone export needs a renderer; for every other host it says neither can render it.

`imported-embed-component` compares the copied components' names (the part before any `.`) against `target.imports` and `doc.imports`: a name the source document imports in its own file and the embedding document does not is reported as an error, because the export drops `mdxjsEsm` and the spliced copy lands in a module with no binding for it. It is reported only for a `render: section` embed, after `unportable-embed-component`.

`collectAnchors(tree: Root)` returns `{ id, explicit }` for every heading anchor. `explicit` reflects `data.cudoc.explicitId`, which is what separates an author's anchor from a slugger's, and therefore what `unstable-anchor-link` keys on.

## Datasets

Source/import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)` synchronously publishes projected ASTs and returns `{ schemaVersion: "1.0.0", documentCount, documents }`.

`DatasetOptions` extends `ProjectionOptions` with required `inputDir`, `outDir`; optional `library`, `documents`, `scopes`; `projectionId` default `custom`; `requireVersion` default true. Input is a directory of AST JSON, typically `.cudoc/documents/documents`. `manifest.json` and `meta.json` are skipped. Document IDs are exact extensionless relative paths. `library` names the collected library directory those ASTs came from: its manifest's root bases decide where a document's scope segment starts — the first segment after the longest base prefixing the ID, so `docs/ko/guide` and `terms/ko/token` both belong to scope `ko` under bases `docs` and `terms` — and its private documents are left out, so requesting one in `documents` is an error. Without `library` the scope is the first path segment and nothing is private. `scopeOf(id, bases)` is exported. Explicitly requested missing IDs throw.

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

Publication rejects overlapping input/output and a symlink output. **Any existing output, even an empty directory, must already carry `.cudoc-output` with `cudoc\n`.** Start with a nonexistent output directory. A lock uses exclusive creation; the callback receives a staging path.

The callback may be synchronous or asynchronous. `publishDirectory` inspects what `build` returned: a thenable defers the commit until it settles and makes the call itself return a promise, anything else commits immediately and returns nothing. The overload signatures are a convenience; that runtime check is what decides. A failed build leaves the previous output intact, and a failed final rename restores it. The lock is held for the whole transaction, so a concurrent publication to the same output fails while an asynchronous build is still running. A process killed mid-build leaves the lock and the staging directory behind; an asynchronous build widens that window rather than adding a new failure. These helpers protect generated output; they are not a sandbox for arbitrary compiler or renderer callbacks.

## Individual AST snapshots

Sources: [export-ast.ts](../../packages/cudoc/src/node/export-ast.ts), [load-ast-file.ts](../../packages/cudoc/src/node/load-ast-file.ts), [paths.ts](../../packages/cudoc/src/node/paths.ts).

These public primitives handle one AST file at a time. They do not create library manifests, original-source snapshots or prepared fenced embeds. The usage guides use the library workflow instead.

- `exportAst(options?)`, the default from `/embed` or `/node/export-ast`, is a remark plugin writing a snapshot at its pipeline position. It leaves the rendering tree intact and atomically writes each file.
- `resolveExportAstOptions(options?) → ExportAstContext`, `projectTree(node, context) → unknown`, `buildExportedAst(tree, context) → object` expose export preparation without requiring disk writes.
- Export defaults: source `docs`, output `.cudoc/ast`, extensions `.md`/`.mdx`; strip `position`/`estree`; drop `mdxjsEsm`; write version `cudocAstVersion: 1`; validate true. Options also include custom `version`, `tableCellElement`, `write(filePath, contents)` and path options.
- `loadAst(documentPath, options?)` from `/embed` reads an extensionless relative ID; `loadAstFile(filePath, options?)` from `/node/load-ast-file` reads a known file directly. Both validate by default and return `ExportedCudocAstRoot`. Reader options are `version`, `validate`, `tableCellElement`; `loadAst` also takes path options.
- `/node/paths` exposes `resolvePathOptions`, `getRelativeOutputPath`, `getOutputPath`, `DEFAULT_SOURCE_ROOT`, `DEFAULT_OUTPUT_ROOT`, `DEFAULT_EXTENSIONS`. `PathOptions` is `{ sourceRoot?, outDir?, extensions?, cwd? }`; unmatched/outside source paths return `null` from output mapping.

Prefer `loadAstFile` for a known server-bundle path. Include required JSON in deployment artifacts when runtime code reads it. The `/embed` barrel re-exports the individual export/read/path functions and lower-level query helpers, not the APIs earlier on this page.

## CLI

Source: [cli.ts](../../packages/cudoc/src/node/cli.ts).

```sh
cudoc collect --config cudoc.config.mjs [--watch]
cudoc check --config cudoc.config.mjs [--format json] [--strict]
cudoc dataset --config dataset.config.json
```

Only these commands and the `--config <path>` argument form are accepted. ESM files must default-export a configuration object; `.json` files are parsed directly. Paths inside config resolve from the invoking working directory, not the config's directory. `collect` runs collection and preparation; a supplied compiler may be sync or async. `check` collects the same way and then runs [reference checking](#reference-checking) against the result, reading the optional `check` key of the same configuration (`ignore`, `assetDirs`, `externalPaths`, `roots`); it writes nothing. `dataset` passes its configuration to `generateDataset`, so `library` there names the collected library to read scopes and private documents from. Its exit code is 1 when any error is reported, or when `--strict` is given and anything at all is. `collect` and `dataset` print JSON summaries; errors go to stderr and set exit code 1. `collect --watch` runs [`watchDocuments`](#watching) with the same configuration and keeps running: the first pass continues from what `outDir` already holds, every pass prints one JSON line — `documentCount`, `compiled` (the ids compiled), `reused`, `blocks`, `reusedBlocks`, `outDir`, `elapsed` — and a failed pass prints its error and leaves the last good output in place. `collect` without the flag is always a full build. The export CLI is documented in [adapters](./adapters.md#export).
