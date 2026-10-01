# Checks that have to run alone

Every other check in this repository is a vitest suite: `packages/*/__tests__`
for the packages' own contracts, `tests/integration` for the example compilers
and `tests/built` for the built sites. `npm test` runs all three.

The five checks here are tests too, which is why they live under `tests/`, but
they cannot run inside the runner:

| Check                  | Why it runs alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild-portable.mjs` | Rewrites `examples/fixtures/reference.md`, which all six examples share, then rebuilds each of them twice.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rebuild-mdx.mjs`      | Rewrites `examples/fixtures/showcase.mdx` the same way for the three MDX examples.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packed-consumers.mjs` | Packs every workspace package and installs the tarballs into a temporary project, and runs the installed `cudoc collect --watch` through one change. Minutes long, and it uses the npm cache.                                                                                                                                                                                                                                                                                                                          |
| `guide-consumers.mjs`  | Follows each host guide, and the standalone export guide's first site, in a new project: the smallest site the guide assumes, the guide's own install lines with cudoc's packages from packed tarballs, the files its code blocks show and the build its scripts define, then looks for an embedded section in the built page and runs `npm audit`, which may report nothing the matching example's does not. Host versions come from the example lockfiles. Minutes long, and it uses the npm cache and the registry. |
| `export-showcase.mjs`  | Rebuilds `examples/export/showcase-output/` into a temporary directory and compares the committed sample with it, text outputs byte for byte, PDF by page count and size, Word by size. Needs the export example installed and its browser.                                                                                                                                                                                                                                                                            |

The two rebuild checks exist because a cached build can pass while serving a
stale page: the only way to prove that a changed source reaches an untouched
embedding document is to change a real file and rebuild for real. They restore
the fixture in a `finally` block, so a normal failure leaves the tree clean, but
a killed process does not run it. If a run is interrupted, check
`git status examples/fixtures/` before trusting any later result.

CI runs the two rebuild checks after building the examples, and
`packed-consumers.mjs` and `guide-consumers.mjs` in jobs of their own; the
publish workflow runs `packed-consumers.mjs` again before it publishes, and
publishes only a commit whose CI run passed. `export-showcase.mjs` runs
only on the release machine: the sample is built there, and the PDF, its page
count and the contents page numbers written into the volume's print HTML follow
the fonts installed on that machine.

Run them from anywhere; each resolves the repository root from its own location.
`guide-consumers.mjs` takes host names to follow only those guides, and keeps
the sites it built in the temporary directory it prints when
`CUDOC_KEEP_GUIDE_SITES=1` is set.

```sh
npm run test:scripts   # all five, in sequence
npm run test:all       # npm test, then the five above
```

Sequencing is the point. Two of them mutate shared fixtures, so nothing else may
touch the examples while they run.
