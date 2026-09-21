/**
 * The stylesheet is a golden fixture, compared byte for byte.
 *
 * Its design tokens are being moved out of the template literal into a
 * structured object that the paginated formats read as well, so the CSS has to
 * be generated rather than written. This fixture is what proves the generated
 * stylesheet is the same one, down to the byte: a change here is either a
 * deliberate design change with the fixture updated in the same commit, or a
 * regression in the generator.
 */

import { it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { siteStyles } from "../src/index.js"

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "site.css",
)

it("emits the stylesheet byte for byte", () => {
  expect(siteStyles).toBe(fs.readFileSync(fixture, "utf8"))
})
