# cudoc-remark

The [cudoc](https://github.com/cudoment/cudoc) remark plugin: explicit heading anchors, inline badges, lists inside table cells, and tables laid out as host components.

Every feature is configured on its own and can be turned off. All options are JSON-serializable, so the plugin works under a bundler that hands its config to a worker.

```bash
npm install cudoc-remark
```

```js
import cudocPrepare from "cudoc-remark"

const remarkPlugins = [["remark-gfm"], [cudocPrepare, {}]]
```

Individual transforms are available on their own subpaths: `cudoc-remark/table-cell-list`, `cudoc-remark/table-column-layout`, `cudoc-remark/badge`.

For optional table of contents export with `@next/mdx`, see the [Next.js guide](https://github.com/cudoment/cudoc/blob/main/docs/next-mdx.md#table-of-contents). The standalone export plugin is `cudoc-remark/toc`.

## Components

The plugin emits capitalized elements such as `Anchor` and `Badge`, which MDX resolves from the components your host provides and throws over when one is missing. `cudoc-remark/components` ships a plain implementation of every one of them:

```jsx
import { cudocComponents } from "cudoc-remark/components"

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents }
}
```

They are markup with class names to hook styles onto, meant to be restyled or replaced. `cudoc-docusaurus` and `cudoc-nextra` both use this same set, so a document renders the same markup wherever it is built. React is an optional peer dependency, needed only if you import them.

The supplied components are `Anchor` and `Badge`. Default layout tables reuse the host's HTML table mappings and retain column alignment. Rules naming capitalized table components require the site's own implementations.

## Heading ids

`cudoc-remark/heading-ids` copies each anchor id onto the heading itself, which is where a deep link resolves and where a host that generates its own ids will look:

```js
remarkPlugins: [[cudocPrepare, options], "cudoc-remark/heading-ids"]
```

This is required with the supplied `Anchor`, which renders only the badge. Omit it only if your own component renders the ID.

## Writing a host adapter

`createHostPlugins(options, adapter)` returns the plugin list a site generator needs — the transforms and the id promotion, with options validated when the config loads. It is what `cudoc-docusaurus` and `cudoc-nextra` are built on.

See the [main README](https://github.com/cudoment/cudoc#readme) for the syntax and the full option list, and the [host guides](https://github.com/cudoment/cudoc/tree/main/docs) for setting it up on a particular site generator.

## License

[MIT](./LICENSE)
