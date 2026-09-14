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
directly and move with it. Everything that needs another package, an example, or
a built site lives here.

```sh
npm ci
npm run build
npm test
```

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

## Fixtures

[`fixtures/showcase.md`](./fixtures/showcase.md) carries every configurable
feature in portable form: explicit anchors, badges, six callout types, five
table-cell-list shapes, a column layout, six link shapes and nine embed shapes.
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

## Checks that run outside the runner

Three checks cannot run inside vitest: two rewrite a fixture every example
shares, and the third packs and installs every package. They live in
[`scripts/`](./scripts/README.md) and run in sequence.

```sh
npm run test:scripts   # the three above
npm run test:all       # npm test, then the three above
```
