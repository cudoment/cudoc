# cudoc on Next.js

**English** | [한국어](./next-mdx.ko.md)

Setting cudoc up in a Next.js App Router project with `@next/mdx`, from an empty project to a rendered page.

There is no adapter package for Next.js. `@next/mdx` passes remark plugins straight through, so `cudoc-remark` connects to it directly; what this guide adds is the two things that are easy to get wrong — how plugins have to be named, and which components you have to provide.

A working version of everything below is in [`examples/next-mdx`](../examples/next-mdx).

## Install

```bash
npm install cudoc-remark @next/mdx @mdx-js/loader @mdx-js/react remark-gfm
npm install cudoc
```

`cudoc` arrives as a dependency.

## Configure

```js
// next.config.mjs
import createMDX from "@next/mdx"

const cudocOptions = {
  headingMetadata: { depths: [2, 3, 4] },
  badge: true,
  tableCellList: true,
}

const withMDX = createMDX({
  options: {
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", cudocOptions],
      ["cudoc-remark/heading-ids", {}],
    ],
  },
})

export default withMDX({
  pageExtensions: ["js", "jsx", "md", "mdx"],
})
```

### Why the plugins are named by string

Turbopack hands the MDX config to a worker, and a worker cannot receive a function. Passing `[cudocPrepare, options]` works under webpack and fails under Turbopack, which is the kind of difference that only shows up when someone switches bundlers.

A string specifier avoids the problem in both. Under Turbopack the worker resolves the package itself; under webpack `@next/mdx`'s loader resolves it with `require.resolve` before handing it to `@mdx-js/loader`. One form, both bundlers — verified by building the example with `next build --turbopack` and `next build --webpack`.

The same constraint is why every option value has to be plain JSON: no functions, no `RegExp`. cudoc's options are designed for that, which is why syntax is described with delimiter pairs and conditions with declarative selectors.

### Heading ids

`cudoc-remark/heading-ids` copies each anchor id onto the heading itself, so `## Rate limits (#rate-limits)` renders as `<h2 id="rate-limits">` rather than leaving the id on a nested element.

`@next/mdx` generates no heading ids of its own. This plugin is required with the supplied `Anchor`, which renders only the badge. Omit it only when your own heading or anchor component supplies the ID.

It has to run after `cudoc-remark`, which is what creates the anchors it reads.

### Table of contents

To export a table of contents with `@next/mdx`, add `toc` to `cudocOptions`:

```js
const cudocOptions = {
  toc: {
    titleDepth: 1, // false to collect no title
    depths: [2, 3],
    exportName: "toc",
  },
}
```

It is off by default. Use `toc: true` for the defaults above. Import the named `toc` export from the MDX document to render it in your page; it contains `title` and `headings`, with each heading's `id`, `text` and `children`.

## Provide the components

cudoc emits capitalized elements. MDX destructures them from the components you provide and throws at render time when one is missing, so this step is not optional.

Provide `Anchor` for heading metadata and `Badge` for badges. `cudoc-remark/components` supplies both. Layout tables use the host's existing HTML table mappings; additional components are needed only if a rule explicitly names them:

```jsx
// mdx-components.jsx
import { cudocComponents } from "cudoc-remark/components"

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents }
}
```

`@next/mdx` wires this file up as the MDX provider automatically. It goes at the project root, or under `src/`. Without it a capitalized element compiles to a scope variable instead of a lookup, and the page fails with `Expected component 'Anchor' to be defined`.

They are markup with class names to hook styles onto — `span.cudoc-badge` — and are meant to be restyled or replaced. To replace one, put it after the spread:

```jsx
import { Badge, cudocComponents } from "cudoc-remark/components"

function Anchor({ id, headerLevel, badge }) {
  return (
    <>
      {badge ? <Badge>{badge}</Badge> : null}
      <a
        aria-label="Permalink to this section"
        className="cudoc-anchor"
        data-header-level={headerLevel}
        href={`#${id}`}
      >
        #
      </a>
    </>
  )
}

export function useMDXComponents(components) {
  return { ...components, ...cudocComponents, Anchor }
}
```

That particular replacement is worth making here. The default `Anchor` renders only the badge, because Docusaurus and Nextra draw their own heading links; `@next/mdx` draws none, so nothing links to the heading unless you add it.

Note what it does _not_ render: an `id`. `cudoc-remark/heading-ids` has already put that on the heading, and two elements sharing one id make a deep link ambiguous. Drop that plugin and you have to put `id={id}` back.

## Add a document

An `.mdx` file under `app/` becomes a route once `pageExtensions` includes `mdx`:

```
app/showcase/page.mdx
```

To keep documents outside the routing tree — which is what you want if `cudoc/embed` is writing their AST out from a source root — put them in their own directory and import:

```jsx
// app/showcase/page.jsx
import Showcase from "../../docs/showcase.mdx"

export default function ShowcasePage() {
  return <Showcase />
}
```

## Export the AST

```js
remarkPlugins: [
  ["remark-gfm"],
  ["cudoc-remark", cudocOptions],
  ["cudoc-remark/heading-ids", {}],
  ["cudoc/embed", { sourceRoot: "docs", outDir: ".cudoc/ast" }],
]
```

Every document under `sourceRoot` is written to a matching path under `outDir`, so `docs/showcase.mdx` becomes `.cudoc/ast/showcase.json`. Documents outside `sourceRoot` are skipped.

It runs last, so the tree it writes is the one every other transform has already finished with.

Read it back with `loadAst`, which validates the schema version on the way in:

```js
import { loadAst } from "cudoc/embed"

const document = loadAst("showcase", { outDir: ".cudoc/ast" })
```

Add `outDir` to `.gitignore`: it is build output, regenerated on every compile.

When a server component knows the file path, use `loadAstFile` from `cudoc/node/load-ast-file`. This entry excludes build-time path mapping from the reader's module graph. Include the required JSON in file tracing. The example's `/embed` route uses:

```js
export default withMDX({
  outputFileTracingIncludes: { "/embed": ["./.cudoc/ast/showcase.json"] },
})
```

Use your own route and data paths. The source MDX still has to compile before the route reads its AST; see the [embedding guide](./embedding.md#the-build-has-to-compile-the-document-first).

## Check it worked

```bash
npx next build
```

Then look at the prerendered HTML rather than trusting the build to have run the plugin — a missing plugin produces a page that renders fine, with the syntax still visible as literal text:

```bash
grep -o 'id="[a-z-]*"' .next/server/app/showcase.html
ls .cudoc/ast
```

A remark plugin only runs when MDX is really compiled. If you have a stale build cache, both the page and the exported AST can stay on the previous version of a document while the build reports success.

## Verified against

Next.js 16.3, `@next/mdx` 16.3, React 19.2, Node 20 and later, under both Turbopack and webpack.

## Troubleshooting

**`Expected component 'Anchor' to be defined`** — the components are not reaching MDX. Check that `mdx-components.jsx` is at the project root or under `src/`, and that it exports `useMDXComponents` by that name.

**The syntax renders as literal text** (`## Rate limits (#rate-limits)` shows the parentheses) — the plugin did not run. Check that the package name in `remarkPlugins` resolves from the project root, and delete `.next/` to rule out a stale cache.

**Under Turbopack: an error about serializing the config** — something in the options is not JSON. Look for a function or a `RegExp`; use delimiter pairs and selectors instead.

**Two elements with the same id** — you have both `cudoc-remark/heading-ids` and an `Anchor` that renders `id={id}`. Keep one.
