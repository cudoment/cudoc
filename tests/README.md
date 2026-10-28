# Tests

Every check in this repository is a test: `npm test` runs three tiers, and a
tier whose prerequisite is missing skips, naming the command that satisfies it.

A fresh clone therefore finishes with a meaningful result rather than a wall of
failures.

| Directory                        | Needs              | Command                 | What it asserts                                                              |
| -------------------------------- | ------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `packages/*/__tests__/`          | nothing            | `npm run test:run`      | Each package's own contract, against its source                              |
| [`integration/`](./integration/) | examples installed | `npm run test:examples` | The shared fixtures compiled by each example's own installed compiler        |
| [`built/`](./built/)             | examples built     | `npm run test:built`    | The generated pages themselves, read back out of each example's build output |

The packages' unit tests stay beside their source, because they test that source
directly and move with it. A test that imports a sibling package by its
published name, `@cudoment/cudoc/query` for instance, is handed that package's
`src` file rather than its `dist`, so the unit tier needs no build. Only the
browser cases of `cudoc-export` read a built file, the runtime bundle they load
into the page. Everything that needs another package, an example, or a built
site lives here.

```sh
npm ci
npm run build
npm test
```

Set `CUDOC_STRICT=1` where every prerequisite is meant to be present, as the
CI job that installs and builds the examples does. A skipped case then fails
the run and is listed by name, so a moved build output or a browser that
stopped installing cannot turn assertions into skips that pass.

## Which tier to reach for

The integration tier needs no site build, so it is the fastest way to catch a
syntax, normalization or embedding regression:

```sh
npm run test:examples
```

It resolves each example's real compiler rather than a stand-in, so a host that
changes how it slugs headings or renders containers shows up here first. The
built tier answers a different question: not whether the compiler produces the
right tree, but whether the page a reader actually opens carries it.

Six suites in the integration tier need nothing installed:

- `example-locks.test.ts` checks that every example lockfile records the linked
  workspace packages as they are, and names `npm run lock:examples` when one is
  behind.
- `release.test.ts` checks what the publish workflow relies on:
  - the comparison with npm treats only npm's not-found as unpublished and
    stops on any other failure;
  - packages are listed after the workspace packages they depend on;
  - the release job creates a release npm has and GitHub does not only at the
    commit npm recorded;
  - the documentation site deploys only a release that is on npm from its
    commit and tagged there, and never an older version over a newer one;
  - every package shares one version and pins its siblings to exactly that
    version.
- `guides.test.ts` holds each Korean host guide to the steps of its English
  counterpart, which `tests/scripts/guide-consumers.mjs` follows in a new
  project, and each guide's `overrides` to its example's. It also holds the
  supported versions table in `docs/README.md` to the example lockfiles and the peer
  ranges the adapters declare, which start where support starts.
- `links.test.ts` checks that every local link in the published pages, the
  guides, the API reference and the READMEs, names a file that exists, and
  every fragment into a Markdown file one of its headings as GitHub slugs it.
- `docs-style.test.ts` holds every published page to the writing rules of
  CONTRIBUTING.md "Writing a page": the page lead that the site shows as its
  description, a sentence under every heading, paragraph and sentence
  length, and the English/Korean block structure. It and `links.test.ts` read the same list of
  pages from `tests/integration/documents.ts`.
- `docs-site.test.ts` builds the documentation site as the release workflow
  does and checks that it holds every guide and nothing else. It checks that
  every link and anchor inside it resolves and that a link to a source file
  opens it on GitHub at the built commit. It also checks how the site takes in the host
  demos, which CI builds after the examples, and that every address the guides
  give for a demo names the page its build writes.

## Adding a feature

Every integration suite is a table crossed with `HOST_CASES`. Adding a row runs
that case on every installed host; adding a host to
[`integration/hosts.ts`](./integration/hosts.ts) runs every existing case on it.
Nothing else has to change. Besides the six examples, `HOST_CASES` holds the
`docs` profile, the Next.js site that writes its own `Tabs`, `TabsContent` and
`Footnote`, compiled by cudoc's standalone MDX compiler.

| Suite                            | The table              | One row is                                                 |
| -------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `integration/syntax.test.ts`     | assertions in the body | a syntax feature in the fixture                            |
| `integration/syntax-off.test.ts` | `WRITTEN`              | a feature's syntax, which stays as written when it is off  |
| `integration/native.test.ts`     | `NATIVE`               | a host's own spelling of a feature                         |
| `integration/embedding.test.ts`  | `SHAPES`               | an embed shape                                             |
| `integration/check.test.ts`      | `CASES`                | a reference diagnostic                                     |
| `integration/metadata.test.ts`   | assertions in the body | a page or image fact `pages.json` or `images.json` records |
| `integration/lsp.test.ts`        | assertions in the body | what an editor receives from `cudoc lsp`                   |

`integration/word.test.ts` is the paginated counterpart: it runs the Word writer
on every installed host's tree of the showcase fixture, so a regression in the
writer's dispatch order shows up on the host that triggers it.

In the built tier, `built/paginated-export.test.ts` exports the five host
libraries to print HTML and Word under all three link policies, and checks the
PDF's page arithmetic on one host when the browser is installed.

`packages/cudoc-export/__tests__/annotations-browser.test.ts` drives the
review-note runtime over `file://` in the browser the PDF printer installs, and
skips, naming the command, when that browser or the built bundle
(`npm run build --workspace packages/cudoc-export`) is absent.

`packages/cudoc-export/__tests__/theme-browser.test.ts` does the same for the
header menus: the theme menu's light and dark choice, the system setting it
follows and the remembered choice. It does the same for the language menu,
which closes on a press elsewhere without a script and on Escape or a focus move with one.

`packages/cudoc-export/__tests__/layout-browser.test.ts` opens a site in that
browser at a phone's width, a tablet's and a desktop's, and skips, naming the
command, when the browser is absent; it needs no built bundle. On the phone a
floating button opens the sidebar as a panel over a page held still, and the
panel scrolls inside itself, wraps a long word and closes from its backdrop,
its close line or the keyboard.

Wider, the sidebar and, on the desktop, the contents stay beside the page and
scroll inside themselves. A wheel on either when it is short or at its end, and
a swipe on a short sidebar at a tablet's width, scroll the page.

`integration/table-parsers.test.ts` compares the tables `cudoc check` reads on
the two markdown-it hosts with the host's own: VitePress's renderer, and the
Eleventy example's markdown-it with the containers it registers. It runs fixed
pages and a seeded run of pages mixing tables with containers, raw HTML,
components and `[[toc]]`, so a host rule the checker leaves out shows up as a
table placed elsewhere.

Two suites also guard against the table drifting from what ships: `embedding`
asserts its row count matches the embed blocks in the fixture, and `check`
asserts its rows cover every code the checker can emit. A feature added to one
side without the other fails rather than going unverified.

Hosts legitimately differ, and a case that cannot hold everywhere says so
instead of forcing uniformity. Docusaurus and Nextra run a slug-shaped heading
id through their slugger after cudoc, so a duplicate explicit anchor never
reaches the tree there;
Docusaurus's MDX loader refuses to compile a document whose image does not
resolve. Both suites assert the property that matters, that the problem does
not ship, rather than demanding the same diagnostic from every host.

## Fixtures

[`fixtures/showcase.md`](./fixtures/showcase.md) carries every configurable
feature in portable form: explicit anchors, badges, six callout types, five
table-cell-list shapes, a column layout, six link shapes and eleven embed shapes.
[`fixtures/reference.md`](./fixtures/reference.md) is the document those embeds
draw from.

Native host syntax cannot live in a shared fixture, because each host spells it
differently. [`integration/native.test.ts`](./integration/native.test.ts)
composes that half per host instead.

`examples/fixtures/` is a separate set: those documents are what the example
sites render and deploy, and the checks under `scripts/` rewrite them. The
fixtures here are only ever read.

## Type checking

`npm run typecheck` covers this directory and `packages/*/__tests__/` through
[`tsconfig.test.json`](../tsconfig.test.json). The packages' own projects compile
`src` alone, and vitest strips types instead of checking them, so without that
project a test could contradict a compiler contract and still pass.
It allows JavaScript so that `release.test.ts` can import the release scripts it
tests.

## Checks that run outside the runner

Five checks cannot run inside vitest: two rewrite a fixture every example
shares, and the third packs and installs every package. The fourth follows every
host guide in a new project from those packed packages, and the fifth rebuilds
the committed export samples and compares them with the committed copies. They
live in [`scripts/`](./scripts/README.md) and run in sequence.

```sh
npm run test:scripts   # the five above
npm run test:all       # npm test, then the five above
```
