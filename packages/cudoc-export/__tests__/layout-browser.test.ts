/// <reference lib="dom" />
/**
 * The site's layout at a phone's width, a tablet's and a desktop's, in the
 * browser the package installs for PDF. On a phone a floating button opens
 * the sidebar as a panel over a page held still, which scrolls inside itself,
 * wraps a long word, and closes from its backdrop, its close line or the
 * keyboard. Beside a wide page the sidebar and the contents stay in place and
 * scroll inside themselves; a wheel on one with nothing left to scroll, short
 * or at its end, and a swipe on a short sidebar go on to the page. Skips,
 * naming the command, when that browser is absent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { Browser, Page } from "playwright-core"
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

  /** Where the panel and its parts, the page and the checkbox stand. */
  const panelState = (page: Page) =>
    page.evaluate(() => {
      const sidebar = document.querySelector(".sidebar")!
      const box = sidebar.getBoundingClientRect()
      const shown = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!).display !== "none"
      return {
        open: (document.getElementById("cudoc-nav-toggle") as HTMLInputElement)
          .checked,
        panel: shown(".sidebar")
          ? [box.left, box.top, box.width, box.height].map(Math.round)
          : null,
        button: shown(".cudoc-nav-button"),
        backdrop: shown(".cudoc-nav-backdrop"),
        close: shown(".cudoc-nav-close"),
        scrollY: Math.round(scrollY),
        panelScroll: Math.round(sidebar.scrollTop),
        sideways: sidebar.scrollWidth - sidebar.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
      }
    })
  /** Once the panel has slid in, so its box is where it stays. */
  const settled = (page: Page) =>
    page.waitForFunction(
      () => document.querySelector(".sidebar")!.getAnimations().length === 0,
    )

  it("opens the sidebar as a panel from a floating button on a phone, and closes it from the backdrop or its close line", async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    try {
      const page = await context.newPage()
      await page.goto(url)
      // Closed: no button in the header, a round button at the bottom left
      // with the bars in its middle and its word out of sight, and nothing
      // of the panel.
      expect(await page.$$("header label")).toHaveLength(0)
      const round = (await page.locator(".cudoc-nav-button").boundingBox())!
      expect(
        [round.x, 844 - round.y - round.height, round.width, round.height].map(
          Math.round,
        ),
      ).toEqual([16, 16, 48, 48])
      const bars = (await page.locator(".cudoc-nav-button svg").boundingBox())!
      expect(
        [bars.x + bars.width / 2, bars.y + bars.height / 2].map(Math.round),
      ).toEqual(
        [round.x + round.width / 2, round.y + round.height / 2].map(Math.round),
      )
      expect(await page.locator(".cudoc-nav-button").textContent()).toBe("Menu")
      const word = (await page.locator(".cudoc-nav-button span").boundingBox())!
      expect(word.width).toBeLessThanOrEqual(1)
      await page.evaluate(() => scrollTo(0, 300))
      expect(await panelState(page)).toMatchObject({
        open: false,
        panel: null,
        button: true,
        backdrop: false,
        close: false,
        scrollY: 300,
      })
      // Open: a panel down the left edge, the screen's full height and
      // min(86vw, 22rem) wide, over a page that stays where it was. The
      // longest word wraps inside it.
      await page.tap(".cudoc-nav-button")
      await settled(page)
      expect(await panelState(page)).toMatchObject({
        open: true,
        panel: [0, 0, 335, 844],
        button: false,
        backdrop: true,
        close: true,
        scrollY: 300,
        panelScroll: 0,
        sideways: 0,
        pageWidth: 390,
      })
      // A swipe on the panel scrolls the panel; one on the backdrop scrolls
      // nothing, since the page behind is held still.
      const cdp = await context.newCDPSession(page)
      const swipe = (x: number) =>
        cdp.send("Input.synthesizeScrollGesture", {
          x,
          y: 600,
          yDistance: -500,
          gestureSourceType: "touch",
          speed: 2000,
        })
      await swipe(150)
      await expect
        .poll(async () => (await panelState(page)).panelScroll)
        .toBeGreaterThan(200)
      await swipe(370)
      await page.waitForTimeout(300)
      expect((await panelState(page)).scrollY).toBe(300)
      // A tap on the backdrop beside the panel closes it, as its close line
      // does, and the page is where the reader left it.
      await page.tap(".cudoc-nav-backdrop", { position: { x: 370, y: 400 } })
      expect(await panelState(page)).toMatchObject({
        open: false,
        panel: null,
        button: true,
        backdrop: false,
        scrollY: 300,
      })
      await page.tap(".cudoc-nav-button")
      await settled(page)
      await page.tap(".cudoc-nav-close")
      expect(await panelState(page)).toMatchObject({
        open: false,
        panel: null,
        button: true,
      })
    } finally {
      await context.close()
    }
  }, 60_000)

  it("opens and closes the panel from the keyboard, with a ring on what Space acts on", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    })
    try {
      await page.goto(url)
      const focused = () => page.evaluate(() => document.activeElement?.id)
      const ring = (selector: string) =>
        page.$eval(
          selector,
          (element) => getComputedStyle(element).outlineStyle,
        )
      // Tab reaches the checkbox after the header, and the button shows it.
      for (let i = 0; i < 10 && (await focused()) !== "cudoc-nav-toggle"; i++)
        await page.keyboard.press("Tab")
      expect(await focused()).toBe("cudoc-nav-toggle")
      expect(await ring(".cudoc-nav-button")).toBe("solid")
      await page.keyboard.press("Space")
      expect(await panelState(page)).toMatchObject({
        open: true,
        button: false,
      })
      // Open, the close line shows the focus, and the next Tab goes into the
      // panel.
      expect(await ring(".cudoc-nav-close")).toBe("solid")
      await page.keyboard.press("Tab")
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest(".sidebar"),
        ),
      ).toBe(true)
      await page.keyboard.press("Shift+Tab")
      expect(await focused()).toBe("cudoc-nav-toggle")
      await page.keyboard.press("Space")
      expect(await panelState(page)).toMatchObject({
        open: false,
        button: true,
      })
    } finally {
      await page.close()
    }
  }, 60_000)

  it("comes back closed after a link from the panel and Back", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    })
    try {
      await page.goto(url)
      await page.click(".cudoc-nav-button")
      await settled(page)
      expect((await panelState(page)).open).toBe(true)
      // A link in the panel loads its page, where the panel is shut.
      await Promise.all([
        page.waitForURL((address) => address.href !== url),
        page.click(".sidebar a:not([aria-current])"),
      ])
      expect((await panelState(page)).open).toBe(false)
      // Back does not restore the checkbox the reader left checked, which
      // would bring the page back locked.
      await page.goBack()
      expect(page.url()).toBe(url)
      expect(await panelState(page)).toMatchObject({
        open: false,
        panel: null,
        button: true,
      })
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).overflowY,
        ),
      ).toBe("visible")
    } finally {
      await page.close()
    }
  }, 60_000)

  it("slides the panel in only without a wish for less motion, and prints none of it", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    })
    try {
      await page.goto(url)
      await page.$eval("#cudoc-nav-toggle", (input) => {
        ;(input as HTMLInputElement).checked = true
      })
      const motion = () =>
        page.$eval(".sidebar", (element) => {
          const style = getComputedStyle(element)
          return [style.animationName, parseFloat(style.animationDuration)]
        })
      expect(await motion()).toEqual(["cudoc-nav-in", 0.16])
      await page.emulateMedia({ reducedMotion: "reduce" })
      expect(await motion()).toEqual(["cudoc-nav-in", 0.001])
      await page.emulateMedia({ reducedMotion: null, media: "print" })
      expect(
        await page.evaluate(() => [
          ...[".cudoc-nav-button", ".cudoc-nav-backdrop", ".sidebar"].map(
            (selector) =>
              getComputedStyle(document.querySelector(selector)!).display,
          ),
          getComputedStyle(document.documentElement).overflowY,
        ]),
      ).toEqual(["none", "none", "none", "visible"])
    } finally {
      await page.close()
    }
  }, 60_000)

  it.each([769, 1280])(
    "draws none of the panel's parts at %ipx, even left open",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.goto(url)
        // Opened on a narrow screen that was then widened.
        await page.$eval("#cudoc-nav-toggle", (input) => {
          ;(input as HTMLInputElement).checked = true
        })
        expect(
          await page.evaluate(() => ({
            drawn: [
              ".cudoc-nav-toggle",
              ".cudoc-nav-button",
              ".cudoc-nav-backdrop",
              ".cudoc-nav-close",
            ].filter(
              (selector) =>
                getComputedStyle(document.querySelector(selector)!).display !==
                "none",
            ),
            sidebar: getComputedStyle(document.querySelector(".sidebar")!)
              .position,
            page: getComputedStyle(document.documentElement).overflowY,
          })),
        ).toEqual({ drawn: [], sidebar: "sticky", page: "visible" })
      } finally {
        await page.close()
      }
    },
    60_000,
  )

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
