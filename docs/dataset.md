# AST datasets

**English** | [한국어](./dataset.ko.md) · [All guides](./README.md)

Create a filtered copy of compiled documents for indexing or another downstream consumer. Dataset generation reads AST JSON, not Markdown, and does not modify its input. It does not create a search engine or a link monitor.

## Collect first

Complete [document collection](./embedding.md#set-up-collection). The dataset input is `.cudoc/documents/documents`, which contains the AST files, rather than the library root with manifests and source snapshots.

Create `dataset.config.mjs`:

```js
export default {
  inputDir: ".cudoc/documents/documents",
  outDir: ".cudoc/dataset",
  excludeNodeTypes: ["code"],
  excludeComponents: ["InternalNote"],
  stripProperties: ["position"],
  projectionId: "search-v1",
}
```

Run:

```sh
npx cudoc dataset --config dataset.config.mjs
```

Read the filtered ASTs from `.cudoc/dataset/documents/` and the document list from `.cudoc/dataset/manifest.json` in your consumer. Use a dedicated output directory separate from the input.

## Choose content

| Option                                | Effect                                                 |
| ------------------------------------- | ------------------------------------------------------ |
| `documents: ["guide/start"]`          | Include exact relative document IDs without extensions |
| `library: ".cudoc/documents"`         | Read root bases and private documents from the library |
| `scopes: ["en", "ko"]`                | Include documents whose scope segment matches          |
| `excludeNodeTypes: ["code"]`          | Remove matching nodes and their subtrees recursively   |
| `excludeComponents: ["InternalNote"]` | Remove MDX JSX nodes with those component names        |
| `stripProperties: ["position"]`       | Remove named properties recursively                    |
| `projectionId: "search-v1"`           | Identify this consumer's projection policy             |

Nothing is excluded by default. If both `documents` and `scopes` are provided, both must match. A document's scope is its first path segment, or with `library` the first segment after its root's base, so `docs/ko/guide` and `terms/ko/token` collected under bases `docs` and `terms` both belong to `ko`. With `library`, documents collected under a `private` pattern are left out, and naming one in `documents` is an error. `type` and `children` cannot be stripped. A component already normalized into Markdown nodes is no longer selected by its original JSX name.

Versioned input is required by default. Use `requireVersion: false` only when intentionally consuming an unversioned AST corpus; structural validation still applies.

For a Docs-specific exclusion policy, explicitly spread `docsDatasetProjection` from `@cudoment/cudoc/dataset` into your configuration. It excludes named Docs table components and `DocDataEmbed`, not ordinary Markdown tables. Applying this preset does not migrate the Docs project.

## Relationship to the Docs dataset tool

The common behavior is postprocessing compiled ASTs, recursively excluding entire component subtrees, retaining Markdown tables and preserving relative document paths. It is not a drop-in replacement for `src/tools/docs-ast-dataset`:

- Docs validates `data.docsAstVersion: 2` and publishes `meta.json`; cudoc collection uses `data.cudocAstVersion: 1` and its dataset publishes `manifest.json`. Do not bypass version checks to disguise this contract difference.
- Docs has source-path coverage checks and injected commit/ref metadata. cudoc's generic generator does not implement those release gates or determine which scopes are safe to publish.
- Docs preserves input bytes for unchanged payloads and removes previous output on failure. cudoc serializes the projected AST and preserves the previous successfully published output if staging fails. Consumers must check the command's success, not just the existence of an older manifest.
- Exclusion by component name must run while those JSX names still exist. After normalization into HTML/Markdown, the Docs component-name preset cannot identify the original components.

Before replacing the Docs command, decide the consumer contract, scope allowlist, build provenance and failure behavior. Keep Docs-specific postprocessing in its existing `buildDocumentPayload` entry point; reusing `projectAst` there is a separate integration change, not a reason to reparse Markdown.

See [projection APIs and manifest](./api-reference/node.md#datasets) for programmatic use and [projectAst](./api-reference/document.md#projection) for an in-memory transform.
