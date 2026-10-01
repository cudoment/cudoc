/// <reference lib="dom" />
/**
 * The theme switch in the browser the package installs for PDF: the select,
 * the choice, what the stylesheet does with the attribute, and that a choice
 * survives a reload, on a site and on a standalone page. Skips, naming the command, when that browser or the
 * built script is absent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { Browser, Page } from "playwright-core"
import { buildSite, designTokens } from "../src/index.js"
import { themeRuntimeFile } from "../src/annotations/site.js"
import {
  browserAvailable,
  browserInstallCommand,
  launchBrowser,
} from "../src/pdf.js"

const scriptBuilt = (() => {
  try {
    themeRuntimeFile()
    return true
  } catch {
    return false
  }
})()
const available = await browserAvailable()
if (!scriptBuilt)
  console.log(
    "theme-browser: script not built; run npm run build --workspace packages/cudoc-export",
  )
else if (!available)
  console.log(
    `theme-browser: browser not installed; run ${browserInstallCommand().join(" ")}`,
  )
const suite = scriptBuilt && available ? describe : describe.skip

suite("theme switch in the browser", () => {
  let root: string
  let browser: Browser
  let page: Page
  let home: string
  let korean: string
  let single: string
  const errors: string[] = []

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-theme-browser-"))
    const sourceRoot = path.join(root, "docs")
    fs.mkdirSync(sourceRoot)
    fs.writeFileSync(
      path.join(sourceRoot, "index.md"),
      "# Home\n\nFirst paragraph.\n\n[Korean](ko.md)\n",
    )
    fs.writeFileSync(
      path.join(sourceRoot, "ko.md"),
      "---\nlang: ko\n---\n\n# 한국어\n\n첫 문단.\n",
    )
    buildSite({
      sourceRoot,
      outDir: path.join(root, "site"),
      title: "Demo",
      themeSwitch: true,
    })
    buildSite({
      sourceRoot,
      outDir: path.join(root, "standalone"),
      libraryDir: path.join(root, "standalone-library"),
      title: "Demo",
      mode: "standalone",
      themeSwitch: true,
    })
    home = pathToFileURL(path.join(root, "site", "index.html")).href
    korean = pathToFileURL(path.join(root, "site", "ko.html")).href
    single = pathToFileURL(path.join(root, "standalone", "index.html")).href
    browser = await launchBrowser()
    page = await browser.newPage({ colorScheme: "light" })
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const open = async (url: string) => {
    await page.goto("about:blank")
    await page.goto(url)
    await page.waitForSelector("body > header .theme-switch")
  }
  const state = () =>
    page.evaluate(() => {
      const root = document.documentElement
      const control = document.querySelector(".theme-switch")!
      const select = control.querySelector("select")!
      let stored: string | null = null
      try {
        stored = localStorage.getItem("cudoc-theme")
      } catch {
        stored = "unavailable"
      }
      return {
        label: select.selectedOptions[0]?.textContent,
        title: control.getAttribute("title"),
        name: select.getAttribute("aria-label"),
        options: Array.from(select.options, (option) => option.textContent),
        icons: control.querySelectorAll("svg path").length,
        theme: root.getAttribute("data-theme"),
        canvas: getComputedStyle(root).getPropertyValue("--canvas").trim(),
        scheme: getComputedStyle(root).colorScheme,
        stored,
      }
    })

  const choose = (mode: string) =>
    page.selectOption(".theme-switch select", mode)

  it("chooses system, light or dark and remembers the choice", async () => {
    await open(home)
    await page.evaluate(() => localStorage.clear())
    await open(home)
    expect(await state()).toMatchObject({
      label: "System",
      title: "Theme: System",
      name: "Theme",
      options: ["System", "Light", "Dark"],
      icons: 3,
      theme: null,
      canvas: designTokens.colors.light.canvas,
      stored: null,
    })
    await choose("light")
    expect(await state()).toMatchObject({
      label: "Light",
      theme: "light",
      canvas: designTokens.colors.light.canvas,
      scheme: "light",
      stored: "light",
    })
    await choose("dark")
    expect(await state()).toMatchObject({
      label: "Dark",
      icons: 1,
      theme: "dark",
      canvas: designTokens.colors.dark.canvas,
      scheme: "dark",
      stored: "dark",
    })
    // The choice is applied from the head on the next load, before any click.
    await open(home)
    expect(await state()).toMatchObject({
      label: "Dark",
      theme: "dark",
      canvas: designTokens.colors.dark.canvas,
    })
    await choose("system")
    expect(await state()).toMatchObject({
      label: "System",
      theme: null,
      canvas: designTokens.colors.light.canvas,
      stored: null,
    })
  }, 60_000)

  it("follows the system when nothing is chosen, and a light choice beats a dark system", async () => {
    await page.emulateMedia({ colorScheme: "dark" })
    try {
      await open(home)
      expect(await state()).toMatchObject({
        label: "System",
        canvas: designTokens.colors.dark.canvas,
      })
      await choose("light")
      expect(await state()).toMatchObject({
        label: "Light",
        canvas: designTokens.colors.light.canvas,
        scheme: "light",
      })
      await page.evaluate(() => localStorage.clear())
    } finally {
      await page.emulateMedia({ colorScheme: "light" })
    }
  }, 60_000)

  it("labels the select in the document's language", async () => {
    await open(korean)
    expect(await state()).toMatchObject({
      label: "시스템",
      title: "테마: 시스템",
      name: "테마",
      options: ["시스템", "라이트", "다크"],
    })
  }, 60_000)

  it("works the same on a standalone page, which carries the script itself", async () => {
    await page.evaluate(() => localStorage.clear())
    await open(single)
    expect(
      await page.evaluate(() => !!document.querySelector("script[src]")),
    ).toBe(false)
    await choose("dark")
    expect(await state()).toMatchObject({
      theme: "dark",
      canvas: designTokens.colors.dark.canvas,
    })
    await choose("system")
  }, 60_000)

  it("logged no errors along the way", () => {
    expect(errors).toEqual([])
  })
})
