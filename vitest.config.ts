import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vitest/config"
import type { Reporter } from "vitest/reporters"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolves every workspace package name to its TypeScript source.
 *
 * A test imports `@cudoment/cudoc/query` the way a consumer does, and the
 * workspace symlink would hand it the compiled `dist`: a stale build the moment
 * a source file changes, and a second copy of every module next to the ones a
 * test imports by relative path. Each package's own `exports` map says which
 * file a subpath names, and `dist/<file>.js` is compiled from
 * `src/<file>.ts` (or `.tsx`), so the mapping follows from the manifest rather
 * than from a list kept here.
 */
function workspaceSources(): Plugin {
  const entries: { name: string; subpath: string; target: string }[] = []
  for (const dir of fs.readdirSync(path.join(root, "packages"))) {
    const manifestPath = path.join(root, "packages", dir, "package.json")
    if (!fs.existsSync(manifestPath)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      name: string
      exports: Record<string, string | { default: string }>
    }
    for (const [subpath, value] of Object.entries(manifest.exports)) {
      const target = typeof value === "string" ? value : value.default
      if (!target.startsWith("./dist/") || !target.endsWith(".js")) continue
      entries.push({
        name: manifest.name,
        subpath,
        target: path.join(root, "packages", dir, target),
      })
    }
  }
  const source = (file: string) => {
    const base = file.replace(
      `${path.sep}dist${path.sep}`,
      `${path.sep}src${path.sep}`,
    )
    for (const extension of [".ts", ".tsx"]) {
      const candidate = base.replace(/\.js$/, extension)
      if (fs.existsSync(candidate)) return candidate
    }
    return undefined
  }
  return {
    name: "cudoc-workspace-sources",
    enforce: "pre",
    resolveId(id) {
      for (const { name, subpath, target } of entries) {
        if (id !== name && !id.startsWith(`${name}/`)) continue
        const wanted = id === name ? "." : `.${id.slice(name.length)}`
        if (subpath === wanted) return source(target)
        if (subpath.endsWith("/*")) {
          const prefix = subpath.slice(0, -1)
          if (!wanted.startsWith(prefix)) continue
          return source(target.replace("*", wanted.slice(prefix.length)))
        }
      }
      return undefined
    },
  }
}

/**
 * With `CUDOC_STRICT` set, a skipped case fails the run.
 *
 * Every skip in this repository stands for a missing prerequisite (an example
 * not installed or not built, the runtime bundle not built, no browser), and
 * prints the command that provides it. A job that provides them all sets the
 * variable, so a moved build output or a browser that stopped installing
 * cannot turn its assertions into skips that pass.
 */
function strictSkips(): Reporter {
  return {
    onTestRunEnd(modules) {
      if (!process.env.CUDOC_STRICT) return
      const skipped = modules.flatMap((module) =>
        [...module.children.allTests("skipped")].map(
          (test) => `${test.project.name}: ${test.fullName}`,
        ),
      )
      if (!skipped.length) return
      console.error(
        `CUDOC_STRICT is set and ${skipped.length} ${skipped.length === 1 ? "case was" : "cases were"} skipped:\n${skipped.map((name) => `  - ${name}`).join("\n")}`,
      )
      process.exitCode = 1
    },
  }
}

/**
 * Three tiers, separated by what each one needs to be present.
 *
 * `npm test` runs all of them. A tier whose prerequisite is missing reports
 * skipped cases with the command that satisfies it, so a fresh clone still
 * finishes with a meaningful result, and `CUDOC_STRICT` turns those skips into
 * a failure.
 *
 * The checks under `tests/scripts/` are deliberately absent: they rewrite a
 * fixture that every example shares and rebuild each example twice, so they
 * have to run alone. `npm run test:scripts` runs those in sequence.
 */
export default defineConfig({
  test: {
    reporters: ["default", strictSkips()],
    projects: [
      {
        // The packages' own contracts, run against their sources. Needs
        // nothing but the workspace install.
        plugins: [workspaceSources()],
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
