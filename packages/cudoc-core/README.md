# cudoc-core

Framework-agnostic core for [cudoc](https://github.com/cudoment/cudoc): the document AST contract, its validation, the single-pass traversal every transform shares, and delimiter-based syntax parsing.

It touches neither the file system nor any framework, so it can be imported from a browser bundle as well as from a build step.

```bash
npm install cudoc-core
```

Most users install [`cudoc-remark`](https://github.com/cudoment/cudoc/tree/main/packages/cudoc-remark) instead, which depends on this package. Reach for `cudoc-core` directly when you are writing your own transform, or when a checker needs to parse the same syntax the compiler does.

```js
import {
  splitByDelimiters,
  matchesSectionHeading,
  validateAstContract,
} from "cudoc-core"
```

Subpaths: `cudoc-core/ast`, `cudoc-core/syntax`, `cudoc-core/mdx`.

See the [main README](https://github.com/cudoment/cudoc#readme) for the full picture.

## License

[MIT](./LICENSE)
