# cudoc on Nextra

**English** | [한국어](./nextra.ko.md)

Setting cudoc up in a Nextra 4 site with the `cudoc-nextra` adapter, from an empty project to a built site.

The adapter applies cudoc anchors before Nextra assigns heading ids and provides the components cudoc emits. Nextra 4 also expects a particular App Router layout, which this guide includes because cudoc has to be wired into it.

A working version of everything below is in [`examples/nextra`](../examples/nextra).

## Install

```bash
npm install cudoc-nextra nextra@4.6.0 nextra-theme-docs@4.6.0 next@15.5 react react-dom
npm install cudoc
```

`cudoc-remark` and `cudoc` arrive as dependencies.

The install command pins the tested Nextra and theme versions. See [Verified against](#verified-against).

## Configure

```js
// next.config.mjs
import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"

const cudocOptions = {
  headingMetadata: { depths: [2, 3, 4] },
  badge: true,
  tableCellList: true,
}

const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: cudocRemarkPlugins(cudocOptions),
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "md", "mdx"],
})
```

Nextra puts the plugins given here in front of its own, which is the order cudoc needs: the anchors have to exist before `remarkHeadings` reads heading ids. Unlike Docusaurus there is no separate "before" list to opt into — the ordering is already right.

## Provide the components

cudoc emits capitalized elements, and MDX throws at render time when one is missing, so this step is not optional.

```jsx
// mdx-components.jsx
import { useMDXComponents as getThemeComponents } from "nextra-theme-docs"
import { cudocComponents } from "cudoc-nextra/components"

const themeComponents = getThemeComponents()

export function useMDXComponents(components) {
  return { ...themeComponents, ...cudocComponents, ...components }
}
```

The theme's components first, then cudoc's, then anything the caller passes — so a page can still override a single component without losing the rest.

## The app structure

Nextra 4 renders documents through a catch-all route. Three files, plus a `content/` directory holding the documents:

```jsx
// app/layout.jsx
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          footer={<Footer>Docs</Footer>}
          navbar={<Navbar logo={<b>Docs</b>} />}
          pageMap={await getPageMap()}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
```

```jsx
// app/[[...mdxPath]]/page.jsx
import { generateStaticParamsFor, importPage } from "nextra/pages"
import { useMDXComponents as getMDXComponents } from "../../mdx-components.jsx"

export const generateStaticParams = generateStaticParamsFor("mdxPath")

export async function generateMetadata(props) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props) {
  const params = await props.params
  const {
    default: MDXContent,
    toc,
    metadata,
  } = await importPage(params.mdxPath)

  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
```

```jsx
// app/not-found.jsx
import { NotFoundPage } from "nextra-theme-docs"

export default function NotFound() {
  return <NotFoundPage>Page not found.</NotFoundPage>
}
```

`app/not-found.jsx` is required, not decorative: without it the build fails while prerendering `/_not-found`, because the theme layout renders for that route too.

Documents go in `content/`, and their paths become routes — `content/showcase.mdx` is `/showcase`.

## Heading ids

Nextra makes a heading id by slugifying the heading text. Left alone that would put a generated id on the heading and cudoc's authored id on a nested anchor, and a deep link would resolve to whichever the browser found first.

The adapter copies each anchor id onto its heading before Nextra looks at it. Nextra uses `data.hProperties.id` as the input to its slugger. Use unique lowercase slug IDs so the final heading links retain the authored value:

```md
## Rate limits (#rate-limits)
```

renders as `<h2 id="rate-limits">`.

An id set another way is left alone, including Nextra's own `[#custom-id]` syntax. A heading with no cudoc anchor keeps the id Nextra generates for it.

Pass `promoteHeadingIds: false` to turn the copying off. Then the ids no longer agree, and you have to supply your own `Anchor`, because the one the adapter ships renders no id.

## Styling the components

`cudoc-nextra/components` re-exports `cudoc-remark/components`, the same set the Docusaurus adapter and a plain Next.js site use, so all three hosts render the same markup. The implementations are deliberately plain: a badge is a `span.cudoc-badge`, and layout tables use the theme's existing HTML table components. Style them from a stylesheet imported in the layout:

```css
/* app/cudoc.css */
.cudoc-badge {
  border: 1px solid currentColor;
  border-radius: 0.5rem;
  font-size: 0.75em;
  margin-left: 0.35rem;
  opacity: 0.8;
  padding: 0.05rem 0.4rem;
  vertical-align: middle;
}
```

To replace one instead, put your own after `cudocComponents` in `mdx-components.jsx`.

`Anchor` renders only the badge. Its id is already on the heading and the theme draws its own heading link, so rendering either again would duplicate it.

## Export the AST

```js
import exportAst from "cudoc/embed"

const withNextra = nextra({
  mdxOptions: {
    remarkPlugins: [
      ...cudocRemarkPlugins(cudocOptions),
      [exportAst, { sourceRoot: "content", outDir: ".cudoc/ast" }],
    ],
  },
})
```

`sourceRoot` is `content` here, matching where Nextra keeps documents, so `content/showcase.mdx` becomes `.cudoc/ast/showcase.json`.

Add `outDir` to `.gitignore`.

## Check it worked

```bash
npx next build
```

Then read the prerendered HTML rather than trusting the build — a missing plugin produces a page that renders fine, with the syntax still visible as literal text:

```bash
grep -o '<h2[^>]*id="[^"]*"' .next/server/app/showcase.html
ls .cudoc/ast
```

## Verified against

Nextra 4.6.0, `nextra-theme-docs` 4.6.0, Next.js 15.5.25, React 19.2, Node 20 and later.

The example pins Nextra and its theme to 4.6.0, and other versions need their own build and render checks. On 4.6.1 the docs theme's `Layout` rejected its own props under zod 4 — on a plain Nextra site as much as with cudoc — so a version bump is worth verifying with a build before anything else.

Because the wiring depends on where Nextra places plugins in its pipeline, pin your versions and rebuild after an upgrade.

## Troubleshooting

**`Invalid input: expected nonoptional, received undefined → at children`** — the theme is rejecting its own props, which has nothing to do with cudoc's transforms. It appeared on Nextra 4.6.1 under zod 4; check that Nextra and its theme are on a version pair you have built successfully.

**The build fails prerendering `/_not-found`** — `app/not-found.jsx` is missing.

**`Expected component 'Anchor' to be defined`** — `cudocComponents` is not in `mdx-components.jsx`, or the catch-all route is importing a different components file than the one you edited.

**The syntax renders as literal text** — the plugins are not reaching `mdxOptions.remarkPlugins`. Delete `.next/` to rule out a stale cache, then check the config actually exports the wrapped object.
