/**
 * Copies the shared showcase document into an example site.
 *
 * The three hosts must render byte-identical source for their output to be
 * comparable, and a copy is what makes the "rebuild after an edit" check
 * meaningful: touching the fixture has to reach every site.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, "..", "fixtures", "showcase.mdx")

const [target, ...rest] = process.argv.slice(2)
if (!target || rest.length > 0) {
  console.error("usage: sync-fixture.mjs <target-path>")
  process.exit(1)
}

const destination = path.resolve(process.cwd(), target)
const contents = fs.readFileSync(fixture, "utf-8")

fs.mkdirSync(path.dirname(destination), { recursive: true })

// Skipping an identical write keeps file watchers and build caches quiet.
const unchanged =
  fs.existsSync(destination) &&
  fs.readFileSync(destination, "utf-8") === contents
if (!unchanged) fs.writeFileSync(destination, contents)

console.log(
  `${unchanged ? "unchanged" : "synced"} ${path.relative(process.cwd(), destination)}`,
)
