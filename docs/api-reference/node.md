# Node APIs

**English** | [한국어](./node.ko.md) · [API reference](./README.md)

These entry points read or write files and belong in Node.js build/server code. Relative filesystem paths resolve from the current working directory unless otherwise noted.

## Collection

Source/import: [library.ts](../../packages/cudoc/src/node/library.ts), `@cudoment/cudoc/node/library`.

```ts
buildDocuments(options: BuildDocumentsOptions): Library
buildDocumentsAsync(options: Omit<BuildDocumentsOptions, "compiler"> & {
  compiler: AsyncDocumentCompiler
}): Promise<Library>
loadLibrary(outDir?: string, compiler?: DocumentCompiler, sourceRoot?: string): Library
```

`BuildDocumentsOptions` extends `DocumentOptions`:

| Property      | Default                  | Meaning                                             |
| ------------- | ------------------------ | --------------------------------------------------- |
| `sourceRoot`  | Required                 | Input directory; scans `.md` and `.mdx` recursively |
| `outDir`      | `.cudoc/documents`       | Owned library output directory                      |
| `routeBase`   | `/`                      | Prefix for default document routes                  |
| `routeSuffix` | `""`                     | Suffix such as `.html`                              |
| `routes`      | `{}`                     | Overrides keyed by extensionless document ID        |
| `compiler`    | Standalone compiler      | Actual host compiler callback when supplied         |
| `compilerId`  | Required with `compiler` | Caller-managed compiler/configuration identity      |

A document ID is its POSIX path relative to `sourceRoot`, without the extension. Extension and case collisions are errors. Default URLs are `routeBase + id + routeSuffix` with the joining slash normalized. Overrides must be unique root-relative pathnames, starting with `/` but not `//`, and containing no `?` or `#`. Frontmatter slugs are not inferred.

Collection without a custom compiler is allowed for `markdown`, `html`, `next`, or an omitted host. Other host profiles require a callback. A Next.js project with additional plugins also needs a matching callback to retain parity.

```ts
type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
// AsyncDocumentCompiler has the same arguments and returns Promise<CompiledDocument>.
```

`filePath` is absolute and `options.format` is inferred per file. Return a position-bearing tree before export removes source positions. Collection prints returned diagnostics to stderr with the relative file and line. It snapshots source ranges, validates/version-tags the export and publishes the library. The async builder compiles each file before publishing and retains the async compiler for replacements.

`Library` has `documents: StoredDocument[]`, `options`, `configuration` (hash), optional runtime `sourceRoot`, `compiler`, `asyncCompiler`. Each `StoredDocument` has `id`, `sourcePath`, `route`, `tree`, `source: SourceSnapshot`, `frontmatter`. Compiler functions and the absolute source root are not serialized.

`loadLibrary` defaults to `.cudoc/documents`, validates the manifest version, AST contract and stored hashes, and reconstructs the library. It does not compare files on disk with current source documents or infer current compiler settings. Recollect to refresh source/configuration. Supply `sourceRoot` to restore absolute compilation paths for relative links/imports. Pass the original sync compiler for replacement, or attach the original callback to `library.asyncCompiler` and use async APIs. A preloaded library used only with prepared embeds needs no compiler.

## Library files

```text
.cudoc/documents/
  .cudoc-output
  manifest.json
  documents/<id>.json
  sources/<id>.json
  embeds.json              # Added by prepareEmbeds
```

| File                  | Contract                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | `schemaVersion: 1`, configuration hash, document options, optional compiler ID, per-document metadata and hashes |
| `documents/<id>.json` | Versioned mdast root; `data.cudocAstVersion: 1`; export strips `position`/`estree` and drops `mdxjsEsm`          |
| `sources/<id>.json`   | Original text, SHA-256 hash, format and section offsets                                                          |
| `embeds.json`         | Prepared embedded AST blocks and freshness metadata                                                              |

Manifest document entries contain `id`, `sourcePath`, `route`, `frontmatter`, `hash`, `astHash`, `snapshotHash`. AST/snapshot hashes cover `JSON.stringify` of their objects; the source hash covers original text. `configuration` hashes options, routing and the compiler identity. Use public functions to produce these files; do not hand-edit them.

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
type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: ("title" | "link" | "summary")[] }
  replace?: Replacement[]
}
type EmbedContext = { documentId: string; prefix?: string }

parseEmbedSpec(value: string): EmbedSpec
resolveDocumentReference(library: Library, reference: string, from: string): {
  document: StoredDocument; anchor?: string
}
resolveEmbed(library: Library, spec: EmbedSpec, context: EmbedContext): Root
resolveDocumentEmbeds(library: Library, documentId: string): Root
// Async counterparts return Promise<Root>:
// resolveEmbedAsync(library, spec, context)
// resolveDocumentEmbedsAsync(library, documentId)
```

`parseEmbedSpec` parses YAML and validates supported top-level/selection keys, source lists, rendering choices and replacement rules. `sources` must be nonempty. The default render is `section`; default table columns are title/link/summary. Selection behavior is defined in [document queries](./document.md#sections-and-queries).

References resolve relative to `context.documentId`, or from the document root when beginning with `/`. `.md`/`.mdx` and `#anchor` are supported. URLs, backslash paths, root escapes and missing documents fail. An anchorless source without a selector uses its whole document.

Resolution clones source ASTs. When replacement is requested, it reads the original selected source range, applies rules in order and recompiles with the original compiler/options. Literal replacement uses split/join (all occurrences); regex uses JavaScript `RegExp`, default flags `g`. Dependencies outside the selected range are appended unchanged. The original source and AST are not mutated. Async APIs retain an async compiler through a per-resolution compile cache.

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
prepareEmbeds(library: Library, outDir?: string): Promise<PreparedEmbeds>
readPreparedEmbeds(outDir: string, documentId: string, source: string): PreparedEmbeds
embedKey(documentId: string, value: string, index: number): string
```

`prepareEmbeds` visits fenced embeds in all collected documents, resolves them asynchronously and atomically replaces `embeds.json`. Its default `outDir` is `.cudoc/documents`, **not inferred from the library**; pass your custom collection path explicitly.

`PreparedEmbeds` contains `schemaVersion: 1`, `configuration`, `sourceHashes: Record<string,string>`, `blocks: Record<string,Root>`. Keys are `documentId:index:sha256(fenceValue)`, with block numbering starting at 1. `readPreparedEmbeds` checks schema, manifest configuration, current document source hash and manifest document hashes. Missing or stale data throws and requests recollection. It is not a live source watcher.

Collection publishes the library directory; preparation publishes its file afterward. They are separate publication boundaries. If preparation fails after a successful collection, rerun preparation/collection before building the host. Do not claim that the entire multi-step build rolls back as a single transaction.

## Datasets

Source/import: [node/dataset.ts](../../packages/cudoc/src/node/dataset.ts), `@cudoment/cudoc/node/dataset`.

`generateDataset(options: DatasetOptions)` synchronously publishes projected ASTs and returns `{ schemaVersion: "1.0.0", documentCount, documents }`.

`DatasetOptions` extends `ProjectionOptions` with required `inputDir`, `outDir`; optional `documents`, `scopes`; `projectionId` default `custom`; `requireVersion` default true. Input is a directory of AST JSON, typically `.cudoc/documents/documents`. `manifest.json` and `meta.json` are skipped. Document IDs are exact extensionless relative paths; scopes match the first segment. Explicitly requested missing IDs throw.

Output is `documents/<id>.json` plus `manifest.json`, containing schema `"1.0.0"`, projection ID/options, document count, scopes and `{ id, hash, outputHash }` entries. `hash` covers input file bytes decoded as UTF-8; `outputHash` covers serialized projected AST. Input and output are validated. File-specific failures retain their cause and abort publication. See [projectAst](./document.md#projection) for filtering semantics.

## Storage

Source/import: [storage.ts](../../packages/cudoc/src/node/storage.ts), `@cudoment/cudoc/node/storage`.

| Function                                         | Behavior                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `hash(value)`                                    | SHA-256 hex of a string                                                                                                       |
| `posix(value)`                                   | Converts platform path separators to `/`                                                                                      |
| `contained(root, target)`                        | Tests containment, including root equality                                                                                    |
| `realPath(target)`                               | Resolves existing ancestors and appends missing path parts                                                                    |
| `safePath(root, relative)`                       | Resolves a contained descendant; rejects escape and root equality                                                             |
| `sourceFiles(root, extensions?)`                 | Sorted recursive absolute file paths; default `.md`, `.mdx`; skips dot entries and node_modules; rejects source-tree symlinks |
| `writeJson(file, value)`                         | Creates parent directories and writes compact JSON; not itself transactional                                                  |
| `publishDirectory(inputRoot, outputRoot, build)` | Locks, stages and replaces an owned output directory                                                                          |

Publication rejects overlapping input/output and a symlink output. **Any existing output, even an empty directory, must already carry `.cudoc-output` with `cudoc\n`.** Start with a nonexistent output directory. A lock uses exclusive creation; the synchronous callback receives a staging path. A failed build leaves the previous output intact, and a failed final rename restores it. These helpers protect generated output; they are not a sandbox for arbitrary compiler or renderer callbacks.

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
cudoc collect --config cudoc.config.mjs
cudoc dataset --config dataset.config.json
```

Only these commands and the exact `--config <path>` argument form are accepted. ESM files must default-export a configuration object; `.json` files are parsed directly. Paths inside config resolve from the invoking working directory, not the config's directory. `collect` runs collection and preparation; a supplied compiler may be sync or async. Successful commands print JSON summaries; errors go to stderr and set exit code 1. There is no watch command. HTML CLI is documented in [adapters](./adapters.md#html).
