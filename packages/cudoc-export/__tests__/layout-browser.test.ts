/// <reference lib="dom" />
/**
 * The site's layout at a phone's width and at a desktop's, in the browser the
 * package installs for PDF: a swipe that starts on the open sidebar scrolls
 * the page, a long word in the navigation does not widen it, and beside a
 * wide page the sidebar stays in place and scrolls inside itself. Skips,
 * naming the command, when that browser is absent.
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
    `layout-browser: browser not installed; run ${browserInstallCommand().join(" ")}`,
  )
const suite = available ? describe : describe.skip

/** A group named by one word longer than a phone's column. */
const LONG_WORD = "internationalizationandlocalizationconfigurationreference"

suite("the site's layout in the browser", () => {
  let root: string
  let browser: Browser
  let url: string

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-layout-browser-"))
    const sourceRoot = path.join(root, "docs")
    // A navigation several screens long, folders four deep, every group open.
    let dir = sourceRoot
    for (const level of [1, 2, 3, 4]) {
      dir = path.join(dir, level === 2 ? LONG_WORD : `level-${level}`)
      fs.mkdirSync(dir, { recursive: true })
      for (let page = 1; page <= 12; page++)
        fs.writeFileSync(
          path.join(dir, `page-${page}.md`),
          `# Level ${level} page ${page}\n\nText.\n`,
        )
    }
    // The page under test is longer than the screen at either width.
    fs.writeFileSync(
      path.join(sourceRoot, "level-1/page-1.md"),
      `# Level 1 page 1\n\n${"A paragraph of the page, long enough to wrap over several lines on a phone.\n\n".repeat(80)}`,
    )
    buildSite({
      sourceRoot,
      outDir: path.join(root, "site"),
      libraryDir: path.join(root, "library"),
      title: "Demo",
    })
    url = pathToFileURL(path.join(root, "site/level-1/page-1.html")).href
    browser = await launchBrowser()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  it("scrolls the page on a phone when a swipe starts on the open sidebar", async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    try {
      const page = await context.newPage()
      await page.goto(url)
      expect(await page.isVisible(".sidebar")).toBe(false)
      await page.tap("label.nav-toggle")
      expect(await page.isVisible(".sidebar")).toBe(true)
      const before = await page.evaluate(() => {
        const sidebar = document.querySelector(".sidebar")!
        return {
          // The swipe below starts on a link of the sidebar.
          onSidebar: !!document.elementFromPoint(200, 600)?.closest(".sidebar"),
          sidebarTaller: sidebar.getBoundingClientRect().height > innerHeight,
          // The longest word wraps: the page is as wide as the screen.
          width: [document.documentElement.scrollWidth, innerWidth],
          scrollY,
        }
      })
      expect(before).toEqual({
        onSidebar: true,
        sidebarTaller: true,
        width: [390, 390],
        scrollY: 0,
      })
      const cdp = await context.newCDPSession(page)
      await cdp.send("Input.synthesizeScrollGesture", {
        x: 200,
        y: 600,
        yDistance: -700,
        gestureSourceType: "touch",
        speed: 2000,
      })
      // A sidebar that stays a scroll box leaves the page where it was.
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(350)
    } finally {
      await context.close()
    }
  }, 60_000)

  it("keeps the sidebar beside a wide page, scrolling inside itself", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    try {
      await page.goto(url)
      const sidebar = () =>
        page.$eval(".sidebar", (element) => ({
          position: getComputedStyle(element).position,
          top: Math.round(element.getBoundingClientRect().top),
          stickyTop: parseFloat(getComputedStyle(element).top),
          scrollTop: Math.round(element.scrollTop),
          overflows: element.scrollHeight > element.clientHeight,
          scrollY: Math.round(scrollY),
        }))
      const start = await sidebar()
      expect(start).toMatchObject({
        position: "sticky",
        overflows: true,
        scrollTop: 0,
        scrollY: 0,
      })
      // The wheel over the sidebar scrolls the sidebar, not the page.
      const box = (await page.locator(".sidebar").boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + 200)
      await page.mouse.wheel(0, 400)
      await expect
        .poll(async () => (await sidebar()).scrollTop)
        .toBeGreaterThan(0)
      expect((await sidebar()).scrollY).toBe(0)
      // The wheel over the text scrolls the page, and the sidebar stays put
      // under the header.
      await page.mouse.move(700, 500)
      await page.mouse.wheel(0, 600)
      await expect.poll(async () => (await sidebar()).scrollY).toBe(600)
      expect((await sidebar()).top).toBe(start.stickyTop)
    } finally {
      await page.close()
    }
  }, 60_000)
})
