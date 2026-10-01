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

The ASTs are the documents as collected, and an embed is not expanded in them: it stays a `code` node with `lang: "cudoc-embed"` whose value names its sources, so a fact shared through embeds appears once, in the document that owns it. A consumer that wants a page as readers see it follows the block's `sources` to that section. `excludeNodeTypes: ["code"]` removes the block along with every other code block.

Nothing is excluded by default. If both `documents` and `scopes` are provided, both must match. A document's scope is its first path segment, or with `library` the first segment after its root's base, so `docs/ko/guide` and `terms/ko/token` collected under bases `docs` and `terms` both belong to `ko`. With `library`, documents collected under a `private` pattern are left out, and naming one in `documents` is an error. `type` and `children` cannot be stripped. A component already normalized into Markdown nodes is no longer selected by its original JSX name.

Versioned input is required by default. Use `requireVersion: false` only when intentionally consuming an unversioned AST corpus; structural validation still applies.

For documents written with the `docs` host profile's table components, spread `docsDatasetProjection` from `@cudoment/cudoc/dataset` into your configuration. It excludes the `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead` and `TableCell` components and `DocDataEmbed`, not ordinary Markdown tables.

The output directory is published in one step, so a failed run leaves the previously published dataset in place. Check that the command succeeded rather than that a manifest exists.

See [projection APIs and manifest](./api-reference/node.md#datasets) for programmatic use and [projectAst](./api-reference/document.md#projection) for an in-memory transform.
