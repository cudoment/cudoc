/// <reference lib="dom" />
/**
 * The resources an exported page loads, loaded by the browser the package
 * installs for PDF: a file name the export copies is only right if a browser
 * reads the address written for it as that file. Skips, naming the command,
 * when that browser is absent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
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
    `assets-browser: browser not installed; run ${browserInstallCommand().join(" ")}`,
  )
const suite = available ? describe : describe.skip

/** A one-pixel PNG. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

suite("exported resources in the browser", () => {
  let root: string
  let browser: Browser

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-assets-browser-"))
    const sourceRoot = path.join(root, "docs")
    fs.mkdirSync(path.join(sourceRoot, "guide/media"), { recursive: true })
    for (const name of ["media/a b.png", ",d.png", "media/e#f.png"])
      fs.writeFileSync(path.join(sourceRoot, "guide", name), PIXEL)
    // Each candidate is the only one in its `srcset`, so the browser has to
    // load that very file; the page embeds the section from another
    // directory, so the paths are the ones the embed moved as well. The file
    // with the comma sits beside the page, where its own page names it
    // `,d.png`: a candidate that starts with a comma is read as a separator.
    fs.writeFileSync(
      path.join(sourceRoot, "guide/page.md"),
      [
        "# Page",
        "",
        '<img alt="space" srcset="media/a%20b.png 1x">',
        "",
        '<img alt="comma" srcset="%2Cd.png 1x">',
        "",
        '<img alt="hash" src="media/e%23f.png">',
        "",
      ].join("\n"),
    )
    fs.writeFileSync(
      path.join(sourceRoot, "index.md"),
      "# Home\n\n```cudoc-embed\nsources: [guide/page.md]\n```\n",
    )
    buildSite({
      sourceRoot,
      outDir: path.join(root, "site"),
      libraryDir: path.join(root, "library"),
    })
    browser = await launchBrowser()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  it.each(["index.html", "guide/page.html", "volume.print.html"])(
    "loads every image %s names",
    async (file) => {
      const page = await browser.newPage()
      try {
        await page.goto(pathToFileURL(path.join(root, "site", file)).href)
        await page.waitForLoadState("load")
        const images = await page.evaluate(() =>
          Array.from(document.querySelectorAll("img")).map((image) => ({
            alt: image.alt,
            loaded: image.complete && image.naturalWidth > 0,
          })),
        )
        // The volume holds both documents, so it shows each image twice.
        expect([...new Set(images.map((image) => image.alt))].sort()).toEqual([
          "comma",
          "hash",
          "space",
        ])
        expect(images.filter((image) => !image.loaded)).toEqual([])
      } finally {
        await page.close()
      }
    },
  )
})
