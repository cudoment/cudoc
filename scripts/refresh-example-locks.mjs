/**
 * Brings every example's lockfile up to date with the workspace packages it
 * links.
 *
 * An example installs from its own lockfile, and that lockfile records each
 * linked package — `../../packages/cudoc` and its siblings — with the version
 * and the dependency list npm saw when the lockfile was last written. After a
 * version bump or a dependency change in `packages/`, `npm ci` in the example
 * would install the old dependency set beside the new code. This rewrites the
 * lockfiles without installing anything, so the change is a diff to review
 * rather than a surprise in CI; `tests/integration/example-locks.test.ts`
 * fails while any of them is behind.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const EXAMPLES = path.join(ROOT, "examples")

const examples = fs
  .readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(EXAMPLES, entry.name))
  .filter(
    (dir) =>
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "package-lock.json")),
  )

for (const dir of examples) {
  const before = fs.readFileSync(path.join(dir, "package-lock.json"), "utf8")
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  })
  const after = fs.readFileSync(path.join(dir, "package-lock.json"), "utf8")
  console.log(
    `${path.relative(ROOT, dir)}: ${before === after ? "unchanged" : "updated"}`,
  )
}
