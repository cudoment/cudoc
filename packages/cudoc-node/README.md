# cudoc-node

The Node-side pieces of [cudoc](https://github.com/cudoment/cudoc): resolving output paths, writing each document's compiled AST to JSON, and loading it back.

```bash
npm install cudoc-node
```

```js
import exportAst, { loadAst } from "cudoc-node"

const remarkPlugins = [
  ["remark-gfm"],
  [cudocPrepare, cudocOptions],
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]

const document = loadAst("en/setup/app", { outDir: ".cudoc/ast" })
```

The tree written out is the one the host actually compiled, not a second parse of the source. Positions and export-only nodes are dropped, a schema version is recorded, and the contract is validated on the way out and again on the way in.

See the [main README](https://github.com/cudoment/cudoc#readme) for the full picture.

## License

[MIT](./LICENSE)
