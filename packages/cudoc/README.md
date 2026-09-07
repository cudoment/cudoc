# cudoc

Reuse document sections and tables from compiled MDX ASTs. Export a snapshot during compilation, load it on the server, select content by a stable anchor and render it with your site's components.

```bash
npm install cudoc
```

## Embedding

Add the export plugin after the transforms whose results you want to store:

```js
import exportAst from "cudoc/embed"

const remarkPlugins = [
  // Your remark transforms go here.
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

Once the source document has compiled, read it in a server component or build script:

```js
import { loadAst, sliceSectionByAnchorId } from "cudoc/embed"

const document = loadAst("guide/limits", { outDir: ".cudoc/ast" })
const section = sliceSectionByAnchorId(document, "rate-limits")
if (!section) throw new Error("Missing section: rate-limits")
// Render section.children with your site's components.
```

The snapshot is the host's remark tree at the export plugin. Later host transforms and MDX component execution are outside it. Export and load validate the same AST contract and schema version. Section slices preserve referenced link, image and footnote definitions.

Source compilation must finish before loading an embed. Keep compiler caches and exported ASTs together, and include the JSON files in deployments that read them at runtime. Queries do not execute MDX expressions; rendering and missing-reference policy belong to the consuming site.

## Entry points

| Import                                      | Runtime         | Purpose                                                 |
| ------------------------------------------- | --------------- | ------------------------------------------------------- |
| `cudoc`                                     | Browser or Node | AST contract, validation, traversal, syntax and queries |
| `cudoc/query`                               | Browser or Node | Sections, headings, text and table queries              |
| `cudoc/ast`, `cudoc/syntax`, `cudoc/mdx`    | Browser or Node | Focused common APIs                                     |
| `cudoc/embed`                               | Node            | AST export, loading and queries together                |
| `cudoc/node/load-ast-file`                  | Node            | Load a known JSON file without build-time path mapping  |
| `cudoc/node/export-ast`, `cudoc/node/paths` | Node            | Focused export and path APIs                            |

All entries share one internal core. Internal source paths are not public exports and the core is not a separate npm package. Browser imports never depend on the Node entry points.

For a server bundle that traces files, use `loadAstFile` from `cudoc/node/load-ast-file` with a concrete file path and configure your host's output file tracing.

The optional `cudoc-remark`, `cudoc-docusaurus` and `cudoc-nextra` packages provide syntax transforms and host integration. Their publication is separate from this package.

See the [embedding guide](https://github.com/cudoment/cudoc/blob/main/docs/embedding.md) and [project README](https://github.com/cudoment/cudoc#readme).

## License

[MIT](./LICENSE)
