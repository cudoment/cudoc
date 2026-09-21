#!/usr/bin/env node
/**
 * Installs the headless browser PDF output needs, at install time.
 *
 * This is not compiled into `dist`: at a workspace `npm ci` the postinstall
 * runs before anything is built, so a script under `dist/` would fail on every
 * fresh clone.
 *
 * It never exits non-zero. A failing postinstall aborts `npm install` for the
 * consumer's entire tree, and "PDF output is unavailable" is a far better
 * outcome than "this package cannot be installed behind a proxy". When the
 * browser is missing, the export says so and names this command.
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"

const SKIP = ["CUDOC_SKIP_BROWSER_DOWNLOAD", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"]
const CHANNEL = "chromium-headless-shell"

for (const name of SKIP)
  if (process.env[name]) {
    console.log(`cudoc-export: ${name} is set, skipping the browser download.`)
    process.exit(0)
  }

try {
  const require = createRequire(import.meta.url)
  // playwright-core exports no subpath for its CLI; its manifest names the
  // file under `bin`. Installing through the resolved package guarantees the
  // revision matches the one `launch()` will look for at run time.
  const manifestPath = require.resolve("playwright-core/package.json")
  const { bin } = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const cli = path.join(
    path.dirname(manifestPath),
    typeof bin === "string" ? bin : bin["playwright-core"],
  )
  const result = spawnSync(process.execPath, [cli, "install", CHANNEL], {
    stdio: "inherit",
  })
  if (result.status !== 0)
    console.warn(
      `cudoc-export: could not install ${CHANNEL}. PDF output will be unavailable until you run: npx cudoc-export install-browser`,
    )
} catch (error) {
  console.warn(
    `cudoc-export: could not install ${CHANNEL} (${error instanceof Error ? error.message : error}).\n` +
      `PDF output will be unavailable until you run: npx cudoc-export install-browser`,
  )
}
process.exit(0)
