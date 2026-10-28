/// <reference lib="dom" />
/**
 * The site's layout at a phone's width, a tablet's and a desktop's, in the
 * browser the package installs for PDF. A swipe that starts on the open
 * sidebar scrolls the page, and a long word in the navigation wraps rather
 * than hiding behind a sideways scroll or widening the page. Beside a wide
 * page the sidebar and the contents stay in place and scroll inside
 * themselves; a wheel on one with nothing left to scroll, short or at its
 * end, and a swipe on a short sidebar go on to the page. Skips, naming the
 * command, when that browser is absent.
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
const PARAGRAPH =
  "A paragraph of the page, long enough to wrap over several lines on a phone.\n\n"

suite("the site's layout in the browser", () => {
  let root: string
  let browser: Browser
  /** A page beside a long navigation, with a long list of contents. */
  let url: string
  /** A page beside a navigation of three, with three headings. */
  let shortUrl: string

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
    // The page under test is longer than the screen at every width, and its
    // sixty headings make contents longer than the screen too.
    fs.writeFileSync(
      path.join(sourceRoot, "level-1/page-1.md"),
      `# Level 1 page 1\n\n${Array.from(
        { length: 60 },
        (_, i) => `## Section ${i + 1}\n\n${PARAGRAPH.repeat(3)}`,
      ).join("")}`,
    )
    buildSite({
      sourceRoot,
      outDir: path.join(root, "site"),
      libraryDir: path.join(root, "library"),
      title: "Demo",
    })
    url = pathToFileURL(path.join(root, "site/level-1/page-1.html")).href
    const shortRoot = path.join(root, "short-docs")
    fs.mkdirSync(shortRoot)
    for (const name of ["a", "b", "c"])
      fs.writeFileSync(
        path.join(shortRoot, `${name}.md`),
        `# Page ${name}\n\n${[1, 2, 3].map((part) => `## Part ${part}\n\n${PARAGRAPH.repeat(30)}`).join("")}`,
      )
    buildSite({
      sourceRoot: shortRoot,
      outDir: path.join(root, "short"),
      libraryDir: path.join(root, "short-library"),
      title: "Demo",
    })
    shortUrl = pathToFileURL(path.join(root, "short/a.html")).href
    browser = await launchBrowser()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  /**
   * One wheel turn over the top of `selector` at a desktop's width, on a page
   * just opened: with `atEnd`, the box is scrolled to its end first. Says
   * where the box and the page stood before and after, and the box's room.
   */
  const wheelOver = async (
    pageUrl: string,
    selector: string,
    atEnd = false,
  ) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    try {
      await page.goto(pageUrl)
      const read = () =>
        page.$eval(selector, (element) => ({
          box: Math.round(element.scrollTop),
          page: Math.round(scrollY),
          room: element.scrollHeight - element.clientHeight,
        }))
      if (atEnd)
        await page.$eval(selector, (element) => {
          element.scrollTop = element.scrollHeight
        })
      const before = await read()
      const { x, y, width } = (await page.locator(selector).boundingBox())!
      const point = { x: Math.round(x + width / 2), y: Math.round(y + 40) }
      // The wheel turns over the box itself, not over what lies beside it.
      expect(
        await page.evaluate(
          ([selector, { x, y }]) =>
            !!document.elementFromPoint(x, y)?.closest(selector),
          [selector, point] as const,
        ),
      ).toBe(true)
      await page.mouse.move(point.x, point.y)
      await page.mouse.wheel(0, 400)
      // Wait for the turn to land, if it moves anything at all.
      for (let i = 0; i < 20; i++) {
        const now = await read()
        if (now.box !== before.box || now.page !== before.page) break
        await page.waitForTimeout(100)
      }
      await page.waitForTimeout(100)
      return { before, after: await read() }
    } finally {
      await page.close()
    }
  }

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
          // The longest word wraps: the sidebar scrolls nothing sideways, and
          // the page is as wide as the screen.
          sideways: sidebar.scrollWidth - sidebar.clientWidth,
          width: [document.documentElement.scrollWidth, innerWidth],
          scrollY,
        }
      })
      expect(before).toEqual({
        onSidebar: true,
        sidebarTaller: true,
        sideways: 0,
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
      // The page scrolls, though the swipe started on the sidebar.
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

  it.each([".sidebar", ".toc"])(
    "hands a wheel on a short %s on to the page",
    async (selector) => {
      const { before, after } = await wheelOver(shortUrl, selector)
      // Nothing to scroll in the box, so the turn moves the page.
      expect(before).toEqual({ box: 0, page: 0, room: 0 })
      expect(after.page).toBeGreaterThan(300)
    },
    60_000,
  )

  it.each([".sidebar", ".toc"])(
    "scrolls a long %s first and hands the wheel on to the page at its end",
    async (selector) => {
      const top = await wheelOver(url, selector)
      expect(top.before).toMatchObject({ box: 0, page: 0 })
      expect(top.before.room).toBeGreaterThan(400)
      expect(top.after.box).toBeGreaterThan(0)
      expect(top.after.page).toBe(0)
      const end = await wheelOver(url, selector, true)
      expect(end.before.box).toBe(end.before.room)
      expect(end.after.box).toBe(end.before.box)
      expect(end.after.page).toBeGreaterThan(300)
    },
    60_000,
  )

  it("hands a swipe on a short sidebar on to the page at a tablet's width", async () => {
    const context = await browser.newContext({
      viewport: { width: 900, height: 600 },
      isMobile: true,
      hasTouch: true,
    })
    try {
      const page = await context.newPage()
      await page.goto(shortUrl)
      const { x, y, width } = (await page.locator(".sidebar").boundingBox())!
      const start = { x: Math.round(x + width / 2), y: Math.round(y + 40) }
      // The sidebar stands beside the text, sticky, and the contents have
      // left: the layout of a tablet, not a phone's.
      expect(
        await page.evaluate(({ x, y }) => {
          const sidebar = document.querySelector(".sidebar")!
          return {
            position: getComputedStyle(sidebar).position,
            room: sidebar.scrollHeight - sidebar.clientHeight,
            toc: getComputedStyle(document.querySelector(".toc")!).display,
            onSidebar: !!document.elementFromPoint(x, y)?.closest(".sidebar"),
          }
        }, start),
      ).toEqual({ position: "sticky", room: 0, toc: "none", onSidebar: true })
      const cdp = await context.newCDPSession(page)
      await cdp.send("Input.synthesizeScrollGesture", {
        ...start,
        yDistance: -400,
        gestureSourceType: "touch",
        speed: 2000,
      })
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200)
    } finally {
      await context.close()
    }
  }, 60_000)
})
