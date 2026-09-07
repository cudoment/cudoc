# cudoc-docusaurus

The [cudoc](https://github.com/cudoment/cudoc) adapter for Docusaurus: the remark wiring, the heading ids, and a theme that supplies the components cudoc emits.

```bash
npm install cudoc-docusaurus
```

`cudoc-remark` and `cudoc` arrive as dependencies.

## Wiring

```js
// docusaurus.config.mjs
import { cudocRemarkPlugins } from "cudoc-docusaurus"

export default {
  presets: [
    [
      "classic",
      {
        docs: {
          beforeDefaultRemarkPlugins: cudocRemarkPlugins({
            headingMetadata: { depths: [2, 3, 4] },
          }),
        },
      },
    ],
  ],
  plugins: ["cudoc-docusaurus"],
}
```

`beforeDefaultRemarkPlugins`, not `remarkPlugins`: Docusaurus assigns heading ids in its own remark plugins, and the anchors have to be in the tree by then.

The plugin entry contributes only the theme. Adding it puts `Anchor` and `Badge` in front of the classic theme's `MDXComponents`, so nothing has to be swizzled. Leave it out and MDX throws at render time on the first document that uses cudoc syntax.

## Heading ids

Docusaurus makes a heading id by slugifying the heading text. On its own that produces a second id beside cudoc's anchor, and a deep link resolves to whichever the browser finds first.

So each anchor id is copied onto its heading before Docusaurus looks at it. The heading and the anchor then agree on one value, and `#your-id` lands where the author meant it to. An id set another way is left alone. Pass `promoteHeadingIds: false` to turn the copying off, in which case you also have to supply your own `Anchor`, because the one here renders no id of its own.

A heading with no cudoc anchor keeps the id Docusaurus generates for it.

## Components

The implementations come from `cudoc-remark/components`, the same set `cudoc-nextra` and a plain Next.js site use, so a document renders the same markup wherever it is built. They are deliberately plain: a badge is a `span.cudoc-badge`, layout tables reuse the theme's `table`/`thead`/`tbody`/`tr`/`th`/`td` mappings. Style them from your site's CSS, or replace one by adding your own `src/theme/MDXComponents` that spreads the adapter's underneath.

`Anchor` renders only the badge. Its id is already on the heading, and Docusaurus draws its own heading link, so rendering either again would duplicate it.

## Verified against

Docusaurus 3.10, React 19, Node 20 and later. Both the wiring and the theme layering depend on Docusaurus internals — the order of the default remark plugins, and `@theme-init` for reaching the component being wrapped — so pin your version and rebuild the [example site](https://github.com/cudoment/cudoc/tree/main/examples/docusaurus) after an upgrade.

See the [host guide](https://github.com/cudoment/cudoc/tree/main/docs) for a full walkthrough, and [`createHostPlugins`](https://github.com/cudoment/cudoc/tree/main/packages/cudoc-remark#writing-a-host-adapter) if you are writing an adapter for another host.

## License

[MIT](./LICENSE)
