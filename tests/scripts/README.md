# Checks that have to run alone

Every other check in this repository is a vitest suite: `packages/*/__tests__`
for the packages' own contracts, `tests/integration` for the example compilers
and `tests/built` for the built sites. `npm test` runs all three.

The four checks here are tests too, which is why they live under `tests/`, but
they cannot run inside the runner:

| Check                  | Why it runs alone                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild-portable.mjs` | Rewrites `examples/fixtures/reference.md`, which all six examples share, then rebuilds each of them twice.                                                                                                              |
| `rebuild-mdx.mjs`      | Rewrites `examples/fixtures/showcase.mdx` the same way for the three MDX examples.                                                                                                                                      |
| `packed-consumers.mjs` | Packs every workspace package and installs the tarballs into a temporary project, and runs the installed `cudoc collect --watch` through one change. Minutes long, and it uses the npm cache.                           |
| `export-showcase.mjs`  | Rebuilds `examples/export/showcase-output/` into a temporary directory and compares the committed sample with it, text outputs byte for byte, PDF and Word by size. Needs the export example installed and its browser. |

The two rebuild checks exist because a cached build can pass while serving a
stale page: the only way to prove that a changed source reaches an untouched
embedding document is to change a real file and rebuild for real. They restore
the fixture in a `finally` block, so a normal failure leaves the tree clean, but
a killed process does not run it. If a run is interrupted, check
`git status examples/fixtures/` before trusting any later result.

Run them from anywhere; each resolves the repository root from its own location.

```sh
npm run test:scripts   # all four, in sequence
npm run test:all       # npm test, then the four above
```

Sequencing is the point. Two of them mutate shared fixtures, so nothing else may
touch the examples while they run.
