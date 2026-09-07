# Examples

Three sites that render the same document, so that "cudoc works on this host" means something checkable rather than something asserted.

| Directory                    | Host                               | Adapter            |
| ---------------------------- | ---------------------------------- | ------------------ |
| [`next-mdx`](./next-mdx)     | Next.js 16 App Router, `@next/mdx` | none needed        |
| [`docusaurus`](./docusaurus) | Docusaurus 3.10                    | `cudoc-docusaurus` |
| [`nextra`](./nextra)         | Nextra 4.6.0, Next.js 15.5         | `cudoc-nextra`     |

The document is [`fixtures/showcase.mdx`](./fixtures/showcase.mdx) and the options are [`fixtures/cudoc-options.mjs`](./fixtures/cudoc-options.mjs). Each site copies the fixture in before it builds, so an edit reaches all three.

For setting cudoc up in your own project rather than reading one of these, see the [host guides](../docs).

## Running one

The examples are **not** workspace packages. Three site generators pulling in their own React, bundler and MDX versions would make `npm ci` at the root slow and leave the packages sharing hoisted versions they never asked for. Each site installs on its own and links the packages with `file:` paths, which resolve to the built `dist` directories:

```bash
npm run build                 # from the repository root, first
cd examples/next-mdx
npm install
npm run dev                   # or: npm run build
```

`examples/next-mdx` also has `dev:webpack` and `build:webpack`, because Next.js can run either bundler and cudoc has to work under both.

## Comparing the three

```bash
node scripts/compare-hosts.mjs
```

It reads the built HTML of each site and compares the heading ids, the badge texts, the list nesting and the table grid. Comparing the exported AST would be easier and would prove less: the AST is what the remark plugin produced, while these four things are what a reader actually gets after each host has run its own renderer over it.

Build all three first, or the script will tell you which one is missing and how to build it.

```bash
node scripts/check-rebuild.mjs
```

builds each site, edits the fixture, builds again, and requires the edit to appear in the rendered page, the exported AST and the consuming embed page. A remark plugin only runs when MDX is really compiled, so a reused compilation cache can leave a site a version behind while still reporting success.

## Reading the AST back

`examples/next-mdx` also has an [`/embed` page](./next-mdx/app/embed) that renders nothing of its own: the section summaries and the table on it are read out of `.cudoc/ast/showcase.json` with `loadAstFile` and `cudoc/query`. It is there because exporting the AST is only worth doing if something reads it, and that path deserves to be exercised rather than described.

## What the document exercises

Heading anchors and heading badges, badges in prose, lists inside table cells (nested and ordered), and a table whose column is laid out as host components and split across two cells.

## Verified version combinations

These are the combinations the examples are built against. Others may work; these are the ones that were run.

| Host       | Versions                                                             |
| ---------- | -------------------------------------------------------------------- |
| Next.js    | Next.js 16.3, `@next/mdx` 16.3, React 19.2, Turbopack and webpack    |
| Docusaurus | Docusaurus 3.10.2, React 19.2                                        |
| Nextra     | Nextra 4.6.0, `nextra-theme-docs` 4.6.0, Next.js 15.5.25, React 19.2 |

Nextra and its theme are pinned to the tested 4.6.0 combination. Rebuild and compare the examples before changing either version.
