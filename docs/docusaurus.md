# cudoc on Docusaurus

**English** | [한국어](./docusaurus.ko.md)

Setting cudoc up in a Docusaurus site with the `cudoc-docusaurus` adapter, from an empty project to a built static site.

The adapter applies cudoc anchors before Docusaurus assigns heading ids and supplies the components cudoc emits.

A working version of everything below is in [`examples/docusaurus`](../examples/docusaurus).

## Install

```bash
npm install cudoc-docusaurus
npm install cudoc
```

`cudoc-remark` and `cudoc` arrive as dependencies.

## Configure

```js
// docusaurus.config.mjs
import { cudocRemarkPlugins } from "cudoc-docusaurus"

const cudocOptions = {
  headingMetadata: { depths: [2, 3, 4] },
  badge: true,
  tableCellList: true,
}

export default {
  title: "Docs",
  url: "https://example.com",
  baseUrl: "/",

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.mjs",
          beforeDefaultRemarkPlugins: cudocRemarkPlugins(cudocOptions),
        },
      },
    ],
  ],

  plugins: ["cudoc-docusaurus"],
}
```

Two separate pieces, and both are needed. `beforeDefaultRemarkPlugins` puts the syntax transforms in the pipeline; the `plugins` entry contributes the theme that supplies the components they emit.

If you also render blog posts or standalone pages with cudoc syntax, add the same `beforeDefaultRemarkPlugins` to the `blog` and `pages` preset options — each content plugin has its own MDX pipeline.

### Why `beforeDefaultRemarkPlugins`

Docusaurus assigns heading ids in its own remark plugins. Register cudoc under `beforeDefaultRemarkPlugins` so its anchors are available when those ids are assigned.

`beforeDefaultRemarkPlugins` runs first, which is the order cudoc needs.

### Why the `plugins` entry

cudoc provides `Anchor` and `Badge`. Default layout tables reuse the classic theme's HTML table mappings. MDX resolves them from the site's MDX components and throws at render time when one is missing.

Adding `cudoc-docusaurus` to `plugins` layers a `MDXComponents` over the classic theme's own, so those names resolve without anyone swizzling anything. Leave it out and the first document using cudoc syntax fails to render.

## Heading ids

Docusaurus makes a heading id by slugifying the heading text. Left alone that would put a generated id on the heading and cudoc's authored id on a nested anchor, and a deep link would resolve to whichever the browser found first.

The adapter copies each anchor id onto its heading before Docusaurus looks at it. Docusaurus honours an id that is already on `data.hProperties`, so the heading and the anchor all end up agreeing on the authored value:

```md
## Rate limits (#rate-limits)
```

renders as `<h2 id="rate-limits">`.

An id set another way is left alone, including Docusaurus's own `{#custom-id}` syntax. A heading with no cudoc anchor keeps the id Docusaurus generates for it — worth knowing if you compare output across hosts, because a host that generates no ids of its own will not have one there.

Pass `promoteHeadingIds: false` to turn the copying off. Then the ids no longer agree, and you have to supply your own `Anchor`, because the one the adapter ships renders no id.

## Styling and replacing the components

The implementations come from `cudoc-remark/components`, the same set the Nextra adapter and a plain Next.js site use, so all three hosts render the same markup. They are deliberately plain: a badge is a `span.cudoc-badge`, and layout tables use the theme's existing HTML table components. Style them from your site's CSS:

```css
/* src/css/custom.css */
.cudoc-badge {
  border: 1px solid var(--ifm-color-emphasis-400);
  border-radius: 0.5rem;
  font-size: 0.75em;
  margin-left: 0.35rem;
  padding: 0.05rem 0.4rem;
  vertical-align: middle;
}
```

`Anchor` renders only the badge. Its id is already on the heading and Docusaurus draws its own heading link, so rendering either again would duplicate it.

To replace a component rather than restyle it, add your own `MDXComponents` to the site's `src/theme` and spread the adapter's underneath:

```jsx
// src/theme/MDXComponents/index.jsx
import MDXComponents from "@theme-original/MDXComponents"
import MyBadge from "@site/src/components/MyBadge"

export default { ...MDXComponents, Badge: MyBadge }
```

The site's own `src/theme` always sits on top of every plugin theme, so `@theme-original` here means the adapter's version — the one you are wrapping. Inside a _plugin's_ theme the same alias would point at the plugin itself, which is why the adapter reaches the classic theme through `@theme-init` instead.

## Export the AST

```js
import exportAst from "cudoc/embed"

beforeDefaultRemarkPlugins: [
  ...cudocRemarkPlugins(cudocOptions),
  [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
],
```

Appended after the adapter's plugins, so the tree it writes is the one they have finished with. `docs/showcase.mdx` becomes `.cudoc/ast/showcase.json`; documents outside `sourceRoot` are skipped.

Add `outDir` to `.gitignore`.

## Check it worked

```bash
npm run build
```

Then read the built HTML rather than trusting the build — a missing plugin produces a page that renders fine, with the syntax still visible as literal text:

```bash
grep -o '<h2[^>]*id="[^"]*"' build/docs/showcase/index.html
ls .cudoc/ast
```

## Verified against

Docusaurus 3.10.2, React 19.2, Node 20 and later.

Both the wiring and the theme layering depend on Docusaurus internals — the order of the default remark plugins, `data.hProperties` being honoured, and `@theme-init` for reaching the component being wrapped. Pin your version and rebuild after an upgrade.

## Troubleshooting

**`Converting circular structure to JSON` while the config loads** — Docusaurus serializes the content plugin's options to a cache file, and something in them cannot be serialized.

One way to hit this without doing anything obviously wrong: keeping the cudoc options in their own module and exporting the same object twice.

```js
// cudoc-options.mjs — do not do this
export const cudocOptions = {/* ... */}
export default cudocOptions
```

Docusaurus loads its config through jiti, which collapses a module exporting one object under two names into an object holding a reference to itself. Export it once, under one name.

**`Cannot access '__WEBPACK_DEFAULT_EXPORT__' before initialization`** — a theme component is importing itself. In a plugin's theme, `@theme-original/X` resolves to that same plugin's file; `@theme-init/X` is the theme that first provided the component.

**`Expected component 'Anchor' to be defined`** — `cudoc-docusaurus` is missing from `plugins`, or a swizzled `MDXComponents` replaced the adapter's instead of spreading it.

**The syntax renders as literal text** — the plugins are under `remarkPlugins` rather than `beforeDefaultRemarkPlugins`, or they were added to the `docs` options while the document lives in `blog` or `pages`.
