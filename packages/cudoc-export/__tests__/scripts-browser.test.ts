/// <reference lib="dom" />
/** Consumer scripts keep their source, global scope and order over file://. */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { Browser } from "playwright-core"
import { buildSite } from "../src/index.js"
import {
  browserAvailable,
  browserInstallCommand,
  launchBrowser,
} from "../src/pdf.js"

const available = await browserAvailable()
if (!available)
  console.log(
    `scripts-browser: browser not installed; run ${browserInstallCommand().join(" ")}`,
  )
const suite = available ? describe : describe.skip

suite("consumer scripts in the browser", () => {
  let root: string
  let browser: Browser

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-scripts-browser-"))
    browser = await launchBrowser()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  it.each(["site", "standalone", "annotate", "hosted-review"] as const)(
    "preserves JavaScript values, scope and deferred order in %s",
    async (mode) => {
      const dir = path.join(root, mode)
      const sourceRoot = path.join(dir, "docs")
      fs.mkdirSync(sourceRoot, { recursive: true })
      fs.writeFileSync(path.join(sourceRoot, "index.md"), "# Home\n\nText.\n")
      const first = path.join(dir, "first.js")
      const second = path.join(dir, "second.js")
      fs.writeFileSync(
        first,
        [
          "const sharedText = String.raw`</script>`;",
          'globalThis.consumerValues = [sharedText, 0 </script/.test("script"), "한글 😀"];',
          'document.addEventListener("DOMContentLoaded", () => { globalThis.consumerReady = true; });',
        ].join("\n"),
      )
      fs.writeFileSync(second, 'consumerValues.push(sharedText, "second");\n')
      const outDir = path.join(dir, "out")
      buildSite({
        sourceRoot,
        outDir,
        mode: mode === "hosted-review" ? "annotate" : mode,
        ...(mode === "hosted-review"
          ? { annotate: { target: "hosted", reviewId: "scripts" } }
          : {}),
        themeSwitch: true,
        scripts: [first, second],
      })
      const page = await browser.newPage()
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      try {
        await page.goto(pathToFileURL(path.join(outDir, "index.html")).href)
        expect(errors).toEqual([])
        expect(await page.evaluate("globalThis.consumerValues")).toEqual([
          "</script>",
          true,
          "한글 😀",
          "</script>",
          "second",
        ])
        expect(await page.evaluate("globalThis.consumerReady")).toBe(true)
      } finally {
        await page.close()
      }
    },
  )

  it("carries an HTML comment opener without changing it or the page", async () => {
    const dir = path.join(root, "comment")
    const sourceRoot = path.join(dir, "docs")
    fs.mkdirSync(sourceRoot, { recursive: true })
    fs.writeFileSync(path.join(sourceRoot, "index.md"), "# Home\n\nText.\n")
    const script = path.join(dir, "comment.js")
    fs.writeFileSync(script, 'globalThis.commentText = "<!--";\n')
    const outDir = path.join(dir, "out")
    buildSite({ sourceRoot, outDir, mode: "standalone", scripts: [script] })
    const page = await browser.newPage()
    try {
      await page.goto(pathToFileURL(path.join(outDir, "index.html")).href)
      expect(await page.evaluate("globalThis.commentText")).toBe("<!--")
      expect(await page.locator("h1").textContent()).toBe("Home")
    } finally {
      await page.close()
    }
  })
})
