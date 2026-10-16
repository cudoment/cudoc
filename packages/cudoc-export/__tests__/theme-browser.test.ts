/// <reference lib="dom" />
/**
 * The header menus in the browser the package installs for PDF: the theme
 * menu, the choice, what the stylesheet does with the attribute, and that a
 * choice survives a reload, on a site and on a standalone page; and the
 * language menu, which closes on a press elsewhere without any script.
 * Skips, naming the command, when that browser or the built script is absent.
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
  let languages: string
  let plainLanguages: string
  let review: string
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
    const translated = path.join(root, "translated")
    fs.mkdirSync(translated)
    fs.writeFileSync(
      path.join(translated, "index.md"),
      "# Home\n\nRead the [guide](guide.md).\n",
    )
    fs.writeFileSync(path.join(translated, "index.ko.md"), "# 홈\n\n첫 문단.\n")
    fs.writeFileSync(path.join(translated, "guide.md"), "# Guide\n\nText.\n")
    for (const [dir, themeSwitch] of [
      ["languages", true],
      ["plain-languages", false],
    ] as const)
      buildSite({
        sourceRoot: translated,
        outDir: path.join(root, dir),
        libraryDir: path.join(root, `${dir}-library`),
        title: "Demo",
        locales: { en: "English", ko: "한국어" },
        navigation: ["index.md", "guide.md"],
        themeSwitch,
      })
    buildSite({
      sourceRoot: translated,
      outDir: path.join(root, "review"),
      libraryDir: path.join(root, "review-library"),
      title: "Demo",
      locales: { en: "English", ko: "한국어" },
      navigation: ["index.md", "guide.md"],
      mode: "annotate",
      annotate: { target: "hosted", reviewId: "menus" },
    })
    review = pathToFileURL(path.join(root, "review", "index.html")).href
    languages = pathToFileURL(path.join(root, "languages", "index.html")).href
    plainLanguages = pathToFileURL(
      path.join(root, "plain-languages", "index.html"),
    ).href
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
      const menu = document.querySelector<HTMLDetailsElement>(".theme-switch")!
      const summary = menu.querySelector("summary")!
      const buttons = Array.from(menu.querySelectorAll("button"))
      let stored: string | null = null
      try {
        stored = localStorage.getItem("cudoc-theme")
      } catch {
        stored = "unavailable"
      }
      return {
        label: summary.textContent,
        title: summary.getAttribute("title"),
        name: summary.getAttribute("aria-label"),
        options: buttons.map((button) => button.textContent),
        pressed: buttons
          .filter((button) => button.getAttribute("aria-pressed") === "true")
          .map((button) => button.textContent),
        icons: summary.querySelectorAll("svg path").length,
        open: menu.open,
        theme: root.getAttribute("data-theme"),
        canvas: getComputedStyle(root).getPropertyValue("--canvas").trim(),
        scheme: getComputedStyle(root).colorScheme,
        stored,
      }
    })

  /** Opens the menu and presses a choice, which closes it again. */
  const choose = async (mode: string) => {
    await page.click(".theme-switch > summary")
    await page.click(`.theme-switch button[value="${mode}"]`)
  }

  const isOpen = (selector: string) =>
    page.$eval(selector, (menu) => (menu as HTMLDetailsElement).open)
  /** The menu holding focus, and the element that has it. */
  const focused = () =>
    page.evaluate(() => [
      document.activeElement?.closest("details.menu")?.className,
      document.activeElement?.tagName,
    ])

  it("chooses light or dark and remembers the choice", async () => {
    await open(home)
    await page.evaluate(() => localStorage.clear())
    await open(home)
    // Nothing chosen: the page follows the system, and the menu shows it.
    expect(await state()).toMatchObject({
      label: "Light",
      // The visible words say it; a tooltip would follow the open menu's
      // layer over the whole page.
      title: null,
      name: "Theme: Light",
      options: ["Light", "Dark"],
      pressed: ["Light"],
      icons: 9,
      open: false,
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
      pressed: ["Dark"],
      icons: 1,
      open: false,
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
    await choose("light")
    expect(await state()).toMatchObject({
      label: "Light",
      theme: "light",
      canvas: designTokens.colors.light.canvas,
      stored: "light",
    })
    await page.evaluate(() => localStorage.clear())
  }, 60_000)

  it("follows the system when nothing is chosen, and a light choice beats a dark system", async () => {
    await page.emulateMedia({ colorScheme: "dark" })
    try {
      await open(home)
      expect(await state()).toMatchObject({
        label: "Dark",
        theme: null,
        canvas: designTokens.colors.dark.canvas,
        stored: null,
      })
      // The menu follows the system as it changes, until a choice.
      await page.emulateMedia({ colorScheme: "light" })
      await expect.poll(async () => (await state()).label).toBe("Light")
      await page.emulateMedia({ colorScheme: "dark" })
      await expect.poll(async () => (await state()).label).toBe("Dark")
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

  it("labels the menu in the document's language", async () => {
    await open(korean)
    expect(await state()).toMatchObject({
      label: "라이트",
      name: "테마: 라이트",
      options: ["라이트", "다크"],
    })
  }, 60_000)

  it("returns focus to the menu after a choice, so the keyboard can go on", async () => {
    await page.evaluate(() => localStorage.clear())
    await open(home)
    await page.focus(".theme-switch > summary")
    await page.keyboard.press("Enter")
    expect(await isOpen(".theme-switch")).toBe(true)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    expect(await state()).toMatchObject({ theme: "dark", open: false })
    expect(await focused()).toEqual(["menu theme-switch", "SUMMARY"])
    await page.evaluate(() => localStorage.clear())
  }, 60_000)

  it("marks the choice in effect when the browser refuses to store it", async () => {
    const blocked = await browser.newPage({ colorScheme: "light" })
    try {
      await blocked.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new Error("storage blocked")
          },
        })
      })
      await blocked.goto(home)
      await blocked.click(".theme-switch > summary")
      await blocked.click('.theme-switch button[value="dark"]')
      expect(
        await blocked.evaluate(() => [
          document.documentElement.getAttribute("data-theme"),
          document.querySelector(".theme-switch .menu-label")!.textContent,
          document.querySelector('.theme-switch [aria-pressed="true"]')!
            .textContent,
        ]),
      ).toEqual(["dark", "Dark", "Dark"])
    } finally {
      await blocked.close()
    }
  }, 60_000)

  it("closes the language menu on a press elsewhere without a script, and the press does nothing else", async () => {
    await page.goto(plainLanguages)
    expect(await page.evaluate(() => document.scripts.length)).toBe(0)
    const menu = ".languages details.menu"
    expect(
      await page.$eval(`${menu} > summary`, (summary) => [
        summary.textContent,
        summary.getAttribute("aria-label"),
      ]),
    ).toEqual(["English", "Language: English"])
    await page.click(`${menu} > summary`)
    expect(await page.isVisible(`${menu} .menu-list`)).toBe(true)
    // A press on the link in the text reaches the layer under the list.
    const link = (await page.locator("main a").boundingBox())!
    await page.mouse.click(link.x + link.width / 2, link.y + link.height / 2)
    expect(await isOpen(menu)).toBe(false)
    expect(page.url()).toBe(plainLanguages)
    await page.click(`${menu} > summary`)
    await page.click(`${menu} .menu-list a`)
    await page.waitForURL(/index\.ko\.html$/)
    expect(
      await page.$eval(`${menu} > summary`, (summary) => summary.textContent),
    ).toBe("한국어")
  }, 60_000)

  it("closes either header menu with Escape or when focus leaves it, where the theme script runs", async () => {
    await open(languages)
    const menu = ".languages details.menu"
    // Escape on an item of the list closes the menu and returns to its summary.
    await page.click(`${menu} > summary`)
    await page.keyboard.press("Tab")
    expect(await focused()).toEqual(["menu", "A"])
    await page.keyboard.press("Escape")
    expect(await isOpen(menu)).toBe(false)
    expect(await focused()).toEqual(["menu", "SUMMARY"])
    // Tab from the open menu's last item on to the theme menu.
    await page.keyboard.press("Enter")
    expect(await isOpen(menu)).toBe(true)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    expect(await isOpen(menu)).toBe(false)
    expect(await focused()).toEqual(["menu theme-switch", "SUMMARY"])
    await page.keyboard.press("Enter")
    await page.keyboard.press("Tab")
    expect(await focused()).toEqual(["menu theme-switch", "BUTTON"])
    await page.keyboard.press("Escape")
    expect(await isOpen(".theme-switch")).toBe(false)
    expect(await focused()).toEqual(["menu theme-switch", "SUMMARY"])
  }, 60_000)

  it("lays an open menu's layer over the review runtime's controls as well", async () => {
    await page.goto(review)
    await page.waitForSelector(".cudoc-ann-toggle")
    const menu = ".languages details.menu"
    await page.click(`${menu} > summary`)
    const toggle = (await page.locator(".cudoc-ann-toggle").boundingBox())!
    await page.mouse.click(
      toggle.x + toggle.width / 2,
      toggle.y + toggle.height / 2,
    )
    expect(await isOpen(menu)).toBe(false)
    expect(
      await page.$eval(".cudoc-ann-toggle", (button) =>
        button.getAttribute("aria-expanded"),
      ),
    ).not.toBe("true")
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
    await page.evaluate(() => localStorage.clear())
  }, 60_000)

  it("logged no errors along the way", () => {
    expect(errors).toEqual([])
  })
})
