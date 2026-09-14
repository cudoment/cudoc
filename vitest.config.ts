import { defineConfig } from "vitest/config"

/**
 * Three tiers, separated by what each one needs to be present.
 *
 * `npm test` runs all of them. A tier whose prerequisite is missing reports
 * skipped cases with the command that satisfies it, so a fresh clone still
 * finishes with a meaningful result.
 *
 * The checks under `tests/scripts/` are deliberately absent: they rewrite a
 * fixture that every example shares and rebuild each example twice, so they
 * have to run alone. `npm run test:scripts` runs those in sequence.
 */
export default defineConfig({
  test: {
    projects: [
      {
        // The packages' own contracts. Needs nothing but the workspace.
        test: {
          name: "unit",
          include: ["packages/*/__tests__/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Compiles shared fixtures with each example's installed compiler.
        // Needs `npm ci` in the examples, but no site build.
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
      {
        // Reads the built example sites. Needs `npm run build` in each example.
        test: {
          name: "built",
          include: ["tests/built/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
