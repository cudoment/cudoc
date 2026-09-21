/**
 * Each example installs from its own lockfile, and that lockfile records the
 * workspace packages it links — version and dependencies — as npm saw them
 * when it was written. A stale record means `npm ci` in the example installs
 * yesterday's dependency set beside today's code, so this reads nothing but
 * files and fails naming the command that rewrites them.
 */

import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ROOT } from "./hosts.js"

type Manifest = {
  name: string
  version: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  engines?: Record<string, string>
}
type Lockfile = {
  packages: Record<string, Partial<Manifest> & { link?: boolean }>
}

const read = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(file, "utf8")) as T

/** npm writes maps with sorted keys; a manifest lists them in any order. */
const canonical = (value: unknown): string =>
  JSON.stringify(
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : (value ?? null),
  )

const examples = fs
  .readdirSync(path.join(ROOT, "examples"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) =>
    fs.existsSync(path.join(ROOT, "examples", name, "package-lock.json")),
  )

/** The fields npm copies from a linked package's manifest into the lockfile. */
const RECORDED = [
  "version",
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "engines",
] as const

describe("example lockfiles", () => {
  it.each(examples)(
    "examples/%s records the linked workspace packages as they are",
    (example) => {
      const lock = read<Lockfile>(
        path.join(ROOT, "examples", example, "package-lock.json"),
      )
      const linked = Object.keys(lock.packages).filter((key) =>
        key.startsWith("../../packages/"),
      )
      expect(linked.length).toBeGreaterThan(0)
      const stale: string[] = []
      for (const key of linked) {
        const manifest = read<Manifest>(
          path.join(ROOT, "examples", example, key, "package.json"),
        )
        const recorded = lock.packages[key]!
        for (const field of RECORDED)
          if (canonical(recorded[field]) !== canonical(manifest[field]))
            stale.push(`${manifest.name} ${field}`)
      }
      expect(
        stale,
        `examples/${example}/package-lock.json is behind the workspace (${stale.join(", ")}); run \`npm run lock:examples\``,
      ).toEqual([])
    },
  )
})
