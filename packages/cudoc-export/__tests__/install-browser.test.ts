import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../install-browser.mjs",
)

/** What the install script prints with only these variables set. */
const run = (variables: Record<string, string>) => {
  const env = { ...process.env }
  delete env.CUDOC_SKIP_BROWSER_DOWNLOAD
  delete env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...env, ...variables },
    encoding: "utf8",
  })
}

const skipped = (name: string) =>
  `cudoc-export: ${name} is set, skipping the browser download.`

describe("the browser download switch", () => {
  // Only runs that skip are made here: any other would install the browser.
  it.each([
    ["CUDOC_SKIP_BROWSER_DOWNLOAD", "1"],
    ["CUDOC_SKIP_BROWSER_DOWNLOAD", "FALSE"],
    ["CUDOC_SKIP_BROWSER_DOWNLOAD", " 0"],
    ["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", "true"],
  ])("%s=%j skips the download, as Playwright reads it", (name, value) => {
    const result = run({ [name]: value })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(skipped(name))
  })

  it.each(["0", "false"])(
    "CUDOC_SKIP_BROWSER_DOWNLOAD=%s asks for the download",
    (value) => {
      // Playwright's variable still skips it, and is the one named.
      const result = run({
        CUDOC_SKIP_BROWSER_DOWNLOAD: value,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(
        skipped("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"),
      )
      expect(result.stdout).not.toContain(
        skipped("CUDOC_SKIP_BROWSER_DOWNLOAD"),
      )
    },
  )
})
