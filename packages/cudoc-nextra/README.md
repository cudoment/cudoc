# cudoc-nextra

The [cudoc](https://github.com/cudoment/cudoc) adapter for Nextra: the remark wiring, the heading ids, and default components for what cudoc emits.

```bash
npm install cudoc-nextra
```

`cudoc-remark` and `cudoc` arrive as dependencies.

## Wiring

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"

const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: cudocRemarkPlugins({
      headingMetadata: { depths: [2, 3, 4] },
    }),
  },
})

export default withNextra({})
```

Nextra puts these in front of its own remark plugins, which is the order cudoc needs: the anchors have to exist before `remarkHeadings` reads heading ids.

```jsx
// mdx-components.jsx
import { useMDXComponents as getThemeComponents } from "nextra-theme-docs"
import { cudocComponents } from "cudoc-nextra/components"

const themeComponents = getThemeComponents()

export function useMDXComponents(components) {
  return { ...themeComponents, ...cudocComponents, ...components }
}
```

cudoc emits capitalized elements, and MDX throws at render time when one is missing, so this step is not optional: `Anchor` and `Badge` have to resolve. Default layout tables reuse the theme's HTML table mappings. `cudoc-nextra/components` re-exports `cudoc-remark/components`, the same set `cudoc-docusaurus` and a plain Next.js site use, so a document renders the same markup wherever it is built.

## Heading ids

Nextra makes a heading id by slugifying the heading text. On its own that produces a second id beside cudoc's anchor, and a deep link resolves to whichever the browser finds first.

So each anchor id is copied onto its heading before Nextra looks at it. Nextra slugifies the supplied value again, so use unique lowercase slug IDs to keep heading links equal to the authored ID. An id set another way — including Nextra's own `[#custom-id]` syntax — is left alone. Pass `promoteHeadingIds: false` to turn the copying off, in which case you also have to supply your own `Anchor`, because the one here renders no id of its own.

## Verified against

Nextra 4.6.0, Next.js 15.5, React 19, Node 20 and later.

The example pins Nextra and its theme to 4.6.0. Validate other versions with a build and rendered-output comparison.

Because the wiring depends on where Nextra places plugins in its pipeline, pin your versions and rebuild the [example site](https://github.com/cudoment/cudoc/tree/main/examples/nextra) after an upgrade.

See the [host guide](https://github.com/cudoment/cudoc/tree/main/docs) for a full walkthrough, and [`createHostPlugins`](https://github.com/cudoment/cudoc/tree/main/packages/cudoc-remark#writing-a-host-adapter) if you are writing an adapter for another host.

## License

[MIT](./LICENSE)
