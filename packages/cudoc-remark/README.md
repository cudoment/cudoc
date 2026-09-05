# cudoc-remark

The [cudoc](https://github.com/cudoment/cudoc) remark plugin: explicit heading anchors, inline badges, lists inside table cells, and tables laid out as host components.

Every feature is configured on its own and can be turned off. All options are JSON-serializable, so the plugin works under a bundler that hands its config to a worker.

```bash
npm install cudoc-remark
```

```js
import cudocPrepare from "cudoc-remark"

const remarkPlugins = [["remark-gfm"], [cudocPrepare, { toc: true }]]
```

Individual transforms are available on their own subpaths: `cudoc-remark/table-cell-list`, `cudoc-remark/table-column-layout`, `cudoc-remark/badge`, `cudoc-remark/toc`.

The plugin emits capitalized elements such as `Anchor` and `Badge`, which your host must provide as MDX components.

See the [main README](https://github.com/cudoment/cudoc#readme) for the syntax, the full option list and the host wiring.

## License

[MIT](./LICENSE)
