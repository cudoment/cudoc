# Tests

Every check in this repository is a test. `npm test` runs the three tiers
below, and a tier whose prerequisite is missing reports skipped cases naming the
command that satisfies it, so a fresh clone still finishes with a meaningful
result rather than a wall of failures.

| Directory                        | Needs              | Command                 | What it asserts                                                              |
| -------------------------------- | ------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `packages/*/__tests__/`          | nothing            | `npm run test:run`      | Each package's own contract, against its source                              |
| [`integration/`](./integration/) | examples installed | `npm run test:examples` | The shared fixtures compiled by each example's own installed compiler        |
| [`built/`](./built/)             | examples built     | `npm run test:built`    | The generated pages themselves, read back out of each example's build output |

The packages' unit tests stay beside their source, because they test that source
directly and move with it: a test that imports a sibling package by its
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

The integration tier also holds four suites that need nothing installed.
`example-locks.test.ts` checks that every example lockfile records the linked
workspace packages as they are, and names `npm run lock:examples` when one is
behind. `release.test.ts` checks what the publish workflow relies on: that the
comparison with npm treats only npm's not-found as unpublished and stops on any
other failure, that packages are listed after the workspace packages they
depend on, that the release job creates a release npm has and GitHub does not
only at the commit npm recorded, and that every package shares one version and
pins its siblings to exactly that version. `guides.test.ts` holds each Korean
host guide to the steps of its English counterpart, which
`tests/scripts/guide-consumers.mjs` follows in a new project, each guide's
`overrides` to its example's, and the supported versions table in
`docs/README.md` to the example lockfiles and the peer ranges the adapters
declare, which start where support starts.
`links.test.ts` checks that every local link in the guides, the API reference
and the READMEs names a file that exists, and every fragment into a Markdown
file one of its headings as GitHub slugs it.

The integration tier needs no site build, so it is the fastest way to catch a
syntax, normalization or embedding regression:

```sh
npm run test:examples
```

It resolves each example's real compiler rather than a stand-in, so a host that
changes how it slugs headings or renders containers shows up here first. The
built tier answers a different question: not whether the compiler produces the
right tree, but whether the page a reader actually opens carries it.

## Adding a feature

Every integration suite is a table crossed with `HOST_CASES`. Adding a row runs
that case on every installed host; adding a host to
[`integration/hosts.ts`](./integration/hosts.ts) runs every existing case on it.
Nothing else has to change.

| Suite                           | The table              | One row is                         |
| ------------------------------- | ---------------------- | ---------------------------------- |
| `integration/syntax.test.ts`    | assertions in the body | a syntax feature in the fixture    |
| `integration/native.test.ts`    | `NATIVE`               | a host's own spelling of a feature |
| `integration/embedding.test.ts` | `SHAPES`               | an embed shape                     |
| `integration/check.test.ts`     | `CASES`                | a reference diagnostic             |

`integration/word.test.ts` is the paginated counterpart: it runs the Word writer
on every installed host's tree of the showcase fixture, so a regression in the
writer's dispatch order shows up on the host that triggers it. In the built tier,
`built/paginated-export.test.ts` exports the five host libraries to print HTML
and Word under all three link policies, and checks the PDF's page arithmetic on
one host when the browser is installed.
`packages/cudoc-export/__tests__/annotations-browser.test.ts` drives the
review-note runtime over `file://` in the browser the PDF printer installs, and
skips, naming the command, when that browser or the built bundle
(`npm run build --workspace packages/cudoc-export`) is absent.
`packages/cudoc-export/__tests__/theme-browser.test.ts` does the same for the
theme switch: the button, the system/light/dark cycle and the remembered
choice.

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
`src` alone, and vitest strips types with esbuild instead of checking them, so
without that project a test could contradict a compiler contract and still pass.
It allows JavaScript so that `release.test.ts` can import the release scripts it
tests.

## Checks that run outside the runner

Five checks cannot run inside vitest: two rewrite a fixture every example
shares, the third packs and installs every package, the fourth follows every
host guide in a new project from those packed packages, and the fifth rebuilds
the committed export showcase and compares it with the committed copy. They
live in [`scripts/`](./scripts/README.md) and run in sequence.

```sh
npm run test:scripts   # the five above
npm run test:all       # npm test, then the five above
```
