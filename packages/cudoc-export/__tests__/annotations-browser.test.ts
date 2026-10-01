/// <reference lib="dom" />
/**
 * The review-note runtime in the browser the package installs for PDF. Skips
 * with the install command when that browser is absent, and with the build
 * command when the runtime bundle is not built.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "node-html-parser"
import type { Browser, Page } from "playwright-core"
import { buildSite } from "../src/index.js"
import { annotationRuntimeFiles } from "../src/annotations/site.js"
import { parseCollection, type Annotation } from "../src/annotations/model.js"
import {
  browserAvailable,
  browserInstallCommand,
  launchBrowser,
} from "../src/pdf.js"

type Api = {
  create: (exact: string, body: string) => Annotation | undefined
  createOnBlock: (blockId: string, body: string) => Annotation | undefined
  reply: (id: string, body: string) => Annotation | undefined
  list: () => Annotation[]
  anchors: () => Record<string, string>
  load: (text: string) => number
  embeddedCopy: () => string
  token: () => Promise<string>
}
declare const window: Window & { cudocAnnotations: Api; violations: string[] }

const runtimeBuilt = (() => {
  try {
    annotationRuntimeFiles()
    return true
  } catch {
    return false
  }
})()
const available = await browserAvailable()
if (!runtimeBuilt)
  console.log(
    "annotations-browser: runtime not built; run npm run build --workspace packages/cudoc-export",
  )
else if (!available)
  console.log(
    `annotations-browser: browser not installed; run ${browserInstallCommand().join(" ")}`,
  )
const suite = runtimeBuilt && available ? describe : describe.skip

suite("review notes in the browser", () => {
  let root: string
  let browser: Browser
  let page: Page
  let url: string
  const errors: string[] = []

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-ann-browser-"))
    const sourceRoot = path.join(root, "docs")
    fs.mkdirSync(sourceRoot)
    fs.writeFileSync(
      path.join(sourceRoot, "index.md"),
      '---\nlang: ko\n---\n\n# Home (#home)\n\nFirst paragraph of the page.\n\n## Start (#start)\n\nRun the installer before anything else.\n\n- First item\n- Second item\n\n<button type="button" id="probe">Probe</button>\n',
    )
    buildSite({
      sourceRoot,
      outDir: path.join(root, "site"),
      title: "Demo",
      mode: "annotate",
    })
    url = pathToFileURL(path.join(root, "site", "index.html")).href
    browser = await launchBrowser()
    page = await browser.newPage()
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
    await page.addInitScript(() => {
      window.violations = []
      window.addEventListener("securitypolicyviolation", (event) =>
        window.violations.push(
          `${event.violatedDirective} ${event.blockedURI}`,
        ),
      )
    })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const open = async (hash = "") => {
    await page.goto("about:blank")
    await page.goto(`${url}${hash}`)
    await page.waitForFunction(
      () => typeof window.cudocAnnotations === "object",
    )
  }
  /** A page with nothing remembered from the previous case. */
  const openFresh = async (hash = "") => {
    await open()
    await page.evaluate(() => localStorage.clear())
    await open(hash)
  }

  it("loads over file:// with the stylesheet applied and no policy violation", async () => {
    await open()
    const probe = await page.evaluate(() => ({
      font: getComputedStyle(document.querySelector("main")!).fontFamily,
      panel: getComputedStyle(document.getElementById("cudoc-annotations")!)
        .fontSize,
      violations: window.violations,
      highlights: "highlights" in CSS,
    }))
    expect(probe.font).toContain("IBM Plex Sans")
    expect(probe.panel).not.toBe("")
    expect(probe.violations).toEqual([])
    expect(probe.highlights).toBe(true)
  }, 60_000)

  it("creates notes on a selection and on a block, paints them without touching the DOM", async () => {
    await open()
    const before = await page.evaluate(
      () => document.querySelector("main")!.outerHTML,
    )
    const result = await page.evaluate(() => {
      const api = window.cudocAnnotations
      const text = api.create("installer before anything", "Reorder this.")!
      const blockId = document
        .querySelector("li[data-cudoc-block]")!
        .getAttribute("data-cudoc-block")!
      const block = api.createOnBlock(blockId, "<img src=x onerror=alert(1)>")!
      api.reply(text.id, "A reply")
      return {
        text: {
          block: text.cudoc.block,
          heading: text.cudoc.heading,
          kinds: text.target.selector.map((s) => s.type),
        },
        block: { id: block.cudoc.block, blockId, scope: block.cudoc.scope },
        anchors: api.anchors(),
        painted: ["cudoc-note", "cudoc-note-active"].reduce(
          (sum, name) =>
            sum +
            ((CSS.highlights as unknown as Map<string, Set<Range>>).get(name)
              ?.size ?? 0),
          0,
        ),
        marked: document.querySelectorAll(".cudoc-ann-marked").length,
        listed: document.querySelectorAll(".cudoc-ann-item").length,
        bodies: Array.from(document.querySelectorAll(".cudoc-ann-body")).map(
          (el) => el.textContent,
        ),
        excerpts: Array.from(
          document.querySelectorAll(".cudoc-ann-excerpt"),
        ).map((el) => el.textContent),
        images: document.querySelectorAll("#cudoc-annotations img").length,
        after: document.querySelector("main")!.outerHTML,
      }
    })
    expect(result.text.kinds).toEqual([
      "TextQuoteSelector",
      "TextPositionSelector",
      "CssSelector",
    ])
    expect(result.text.heading).toBe("start")
    expect(result.text.block).toMatch(/^start:[0-9a-f]{8}$/)
    expect(result.block.id).toBe(result.block.blockId)
    expect(result.block.scope).toBe("block")
    expect(Object.values(result.anchors).sort()).toEqual(["block", "text"])
    expect(result.painted).toBe(2)
    expect(result.marked).toBe(0)
    expect(result.listed).toBe(2)
    expect(result.bodies).toContain("<img src=x onerror=alert(1)>")
    // A block quote is one line: the boundaries inside it collapse to spaces.
    // Two notes made in the same millisecond list in id order, which is random.
    expect([...result.excerpts].sort()).toEqual([
      "First item",
      "installer before anything",
    ])
    expect(result.images).toBe(0)
    expect(result.after).toBe(before)
  }, 60_000)

  it("hands the notes over as a file and as a copy of the page", async () => {
    await openFresh()
    await page.evaluate(() => {
      window.cudocAnnotations.create("Second item", "Check this.")
      window.cudocAnnotations.create(
        "First paragraph",
        "</script><script>alert(1)</script><!--",
      )
    })
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(() => {
        ;(document.querySelector(".cudoc-ann-toggle") as HTMLElement).click()
        ;(document.querySelector(".cudoc-ann-download") as HTMLElement).click()
      }),
    ])
    expect(download.suggestedFilename()).toBe("index.annotations.json")
    const saved = parseCollection(
      JSON.parse(fs.readFileSync((await download.path())!, "utf8")),
    )
    expect(saved.items.map((i) => i.body[0]?.value)).toContain("Check this.")
    expect(saved.generator).toMatch(/^cudoc-export /)

    const copy = await page.evaluate(() =>
      window.cudocAnnotations.embeddedCopy(),
    )
    const tree = parse(copy)
    expect(tree.querySelector("#cudoc-annotations")).toBeNull()
    // The page carries the runtime itself, so the copy does too.
    expect(
      tree
        .querySelectorAll("script")
        .map((s) => s.getAttribute("src") ?? s.getAttribute("type")),
    ).toEqual([undefined, "application/json"])
    expect(copy).not.toContain("<link")
    const embedded = parseCollection(
      JSON.parse(tree.querySelector("#cudoc-annotations-data")!.textContent),
    )
    expect(embedded.items).toHaveLength(saved.items.length)
    const block = tree.querySelector("#cudoc-annotations-data")!.textContent
    expect(block).not.toContain("</script")
    expect(block).toContain("\\u003c/script")
    expect(embedded.items.map((i) => i.body[0]?.value)).toContain(
      "</script><script>alert(1)</script><!--",
    )

    // The copy opens on its own in a folder holding nothing else, with its
    // styles and its notes, and asks for nothing outside itself.
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-ann-copy-"))
    fs.writeFileSync(path.join(elsewhere, "index.annotated.html"), copy)
    const requests: string[] = []
    const record = (request: { url: () => string }) =>
      requests.push(request.url())
    page.on("request", record)
    await page.goto("about:blank")
    await page.goto(
      pathToFileURL(path.join(elsewhere, "index.annotated.html")).href,
    )
    await page.waitForFunction(
      () => typeof window.cudocAnnotations === "object",
    )
    page.off("request", record)
    await page.evaluate(() => localStorage.clear())
    const restored = await page.evaluate(() => ({
      notes: window.cudocAnnotations.list().length,
      anchors: Object.values(window.cudocAnnotations.anchors()),
      font: getComputedStyle(document.querySelector("main")!).fontFamily,
    }))
    fs.rmSync(elsewhere, { recursive: true, force: true })
    expect(requests.filter((url) => !url.startsWith("data:"))).toEqual([
      pathToFileURL(path.join(elsewhere, "index.annotated.html")).href,
    ])
    expect(restored.font).toContain("IBM Plex Sans")
    expect(restored.notes).toBe(saved.items.length)
    expect(restored.anchors.every((a) => a === "text" || a === "block")).toBe(
      true,
    )
  }, 60_000)

  it("offers a share token without applying it, and keeps a hostile note as text", async () => {
    await openFresh()
    const token = await page.evaluate(async () => {
      window.cudocAnnotations.create(
        "First paragraph",
        "<script>alert(1)</script>",
      )
      return window.cudocAnnotations.token()
    })
    expect(token).toMatch(/^z\./)
    await openFresh(`#cudoc-notes=${token}`)
    await page.waitForFunction(
      () =>
        !document.querySelector(".cudoc-ann-tokenbar")!.hasAttribute("hidden"),
    )
    const offered = await page.evaluate(() => ({
      prompt: document.querySelector(".cudoc-ann-tokenbar p")!.textContent,
      notes: window.cudocAnnotations.list().length,
      stored: Object.keys(localStorage).filter(
        (k) => k.startsWith("cudoc-annotations:") && !k.endsWith(":author"),
      ),
    }))
    expect(offered.prompt).toContain("1")
    expect(offered.notes).toBe(0)
    expect(offered.stored).toEqual([])
    await page.evaluate(() =>
      (
        document.querySelector(
          ".cudoc-ann-tokenbar .cudoc-ann-primary",
        ) as HTMLElement
      ).click(),
    )
    const accepted = await page.evaluate(() => ({
      notes: window.cudocAnnotations.list().length,
      hash: location.hash,
      body: document.querySelector(".cudoc-ann-body")!.textContent,
      scripts: document.querySelectorAll("#cudoc-annotations script").length,
    }))
    expect(accepted).toEqual({
      notes: 1,
      hash: "",
      body: "<script>alert(1)</script>",
      scripts: 0,
    })
  }, 60_000)

  it("speaks English on a Korean document until the reader switches, and remembers it", async () => {
    await openFresh()
    const before = await page.evaluate(() => {
      window.cudocAnnotations.create("Second item", "Count me.")
      const toggle = document.querySelector(".cudoc-ann-toggle")!
      return {
        lang: document.documentElement.lang,
        label: toggle.getAttribute("aria-label"),
        icon: toggle.querySelectorAll("svg").length,
        count: toggle.querySelector(".cudoc-ann-count")!.textContent,
        text: toggle.textContent,
        title: document.querySelector(".cudoc-ann-panel h2")!.textContent,
        primary: Array.from(
          document.querySelectorAll(
            ".cudoc-ann-panel > .cudoc-ann-actions > .cudoc-ann-button",
          ),
        ).map((el) => el.textContent),
        more: Array.from(
          document.querySelectorAll(".cudoc-ann-more .cudoc-ann-button"),
        ).map((el) => el.className.split(" ")[1]),
        name: document.querySelector(".cudoc-ann-field label")!.textContent,
      }
    })
    expect(before.lang).toBe("ko")
    expect(before.label).toBe("Notes (1)")
    expect(before.icon).toBe(1)
    expect(before.count).toBe("1")
    expect(before.text).toBe("1")
    expect(before.title).toBe("Notes")
    expect(before.primary).toEqual([
      "Copy share token",
      "Clear all stored notes",
    ])
    expect(before.more).toEqual([
      "cudoc-ann-download",
      "cudoc-ann-copy",
      "cudoc-ann-import",
    ])
    expect(before.name).toBe("Your name")
    await page.click(".cudoc-ann-toggle")
    await page.selectOption(".cudoc-ann-lang", "ko")
    const after = await page.evaluate(() => ({
      title: document.querySelector(".cudoc-ann-panel h2")!.textContent,
      listed: document.querySelectorAll(".cudoc-ann-item").length,
      stored: localStorage.getItem("cudoc-annotations:lang"),
    }))
    expect(after).toEqual({ title: "메모", listed: 1, stored: "ko" })
    await open()
    expect(
      await page.evaluate(
        () => document.querySelector(".cudoc-ann-panel h2")!.textContent,
      ),
    ).toBe("메모")
  }, 60_000)

  it("takes the name as it is typed and keeps it while a note is added", async () => {
    await openFresh()
    await page.click(".cudoc-ann-toggle")
    await page.fill(".cudoc-ann-author", "Reviewer One")
    const note = await page.evaluate(() =>
      window.cudocAnnotations.create("Second item", "Signed.")!,
    )
    expect(note.creator).toEqual({ type: "Person", name: "Reviewer One" })
    expect(
      await page.evaluate(
        () =>
          (document.querySelector(".cudoc-ann-author") as HTMLInputElement)
            .value,
      ),
    ).toBe("Reviewer One")
  }, 60_000)

  it("narrows the page for the panel by default and covers it on request", async () => {
    await openFresh()
    const closed = await page.evaluate(() => ({
      push: document.documentElement.classList.contains("cudoc-ann-push"),
      padding: getComputedStyle(document.body).paddingRight,
    }))
    expect(closed).toEqual({ push: false, padding: "0px" })
    // The header's own padding and its right edge, before the panel opens.
    const headerBefore = await page.evaluate(() => {
      const header = document.querySelector("header")!
      return {
        padding: getComputedStyle(header).paddingRight,
        right: header.getBoundingClientRect().right,
      }
    })
    await page.click(".cudoc-ann-toggle")
    const pushed = await page.evaluate(() => {
      const header = document.querySelector("header")!
      return {
        push: document.documentElement.classList.contains("cudoc-ann-push"),
        padding: getComputedStyle(document.body).paddingRight,
        header: getComputedStyle(header).paddingRight,
        headerRight: header.getBoundingClientRect().right,
        button: document
          .querySelector(".cudoc-ann-layout")!
          .getAttribute("aria-label"),
      }
    })
    expect(pushed.push).toBe(true)
    expect(pushed.padding).toBe("352px")
    // The header narrows with the body and by the panel's width alone, so a
    // control at its right edge moves exactly that far and no further.
    expect(pushed.header).toBe(headerBefore.padding)
    expect(headerBefore.right - pushed.headerRight).toBe(352)
    expect(pushed.button).toBe("Panel placement: Narrow the page")
    await page.click(".cudoc-ann-layout")
    const covered = await page.evaluate(() => ({
      push: document.documentElement.classList.contains("cudoc-ann-push"),
      padding: getComputedStyle(document.body).paddingRight,
      stored: localStorage.getItem("cudoc-annotations:layout"),
      button: document
        .querySelector(".cudoc-ann-layout")!
        .getAttribute("aria-label"),
    }))
    expect(covered).toEqual({
      push: false,
      padding: "0px",
      stored: "overlay",
      button: "Panel placement: Cover the page",
    })
    await page.click(".cudoc-ann-close")
    expect(
      await page.evaluate(() =>
        document.querySelector(".cudoc-ann-panel")!.hasAttribute("hidden"),
      ),
    ).toBe(true)
  }, 60_000)

  it("keeps the gutter + while the pointer travels to it and opens the composer", async () => {
    await openFresh()
    const block = page.locator("main p[data-cudoc-block]").first()
    await block.hover()
    const button = page.locator(".cudoc-ann-gutter")
    await expect.poll(() => button.isVisible()).toBe(true)
    const box = (await button.boundingBox())!
    const target = (await block.boundingBox())!
    // Walk from the block's left edge into the margin and onto the button.
    for (let x = target.x + 2; x >= box.x + box.width / 2; x -= 6)
      await page.mouse.move(x, box.y + box.height / 2)
    expect(await button.isVisible()).toBe(true)
    await button.click()
    expect(
      await page.evaluate(() => ({
        composer: !document
          .querySelector(".cudoc-ann-composer")!
          .hasAttribute("hidden"),
        quote: document.querySelector(".cudoc-ann-quote")!.textContent,
      })),
    ).toEqual({ composer: true, quote: "First paragraph of the page." })
  }, 60_000)

  it("keeps the panel head inside the panel and its type below the document's", async () => {
    await openFresh()
    await page.click(".cudoc-ann-toggle")
    const metrics = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect()
      const size = (selector: string) =>
        parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize)
      const panel = box(".cudoc-ann-panel")
      const head = box(".cudoc-ann-head")
      const tools = box(".cudoc-ann-tools")
      return {
        headInside: head.right <= panel.right && head.width < panel.width,
        headPosition: getComputedStyle(
          document.querySelector(".cudoc-ann-head")!,
        ).position,
        toolsRight: Math.round(panel.right - tools.right),
        headHeight: head.height,
        bodyText: size("main"),
        panelText: size(".cudoc-ann-panel"),
        langText: size(".cudoc-ann-lang"),
        controls: new Set(
          Array.from(
            document.querySelectorAll(
              ".cudoc-ann-panel .cudoc-ann-button, .cudoc-ann-lang",
            ),
          ).map((el) => Math.round(el.getBoundingClientRect().height)),
        ).size,
      }
    })
    expect(metrics.headInside).toBe(true)
    expect(metrics.headPosition).toBe("static")
    // Panel padding is 16px: the tools end where the content does.
    expect(metrics.toolsRight).toBe(16)
    expect(metrics.headHeight).toBeLessThan(40)
    expect(metrics.panelText).toBeLessThan(metrics.bodyText)
    expect(metrics.langText).toBeLessThan(metrics.panelText)
    expect(metrics.controls).toBe(1)
  }, 60_000)

  it("drops the note button once the composer it opened is dismissed", async () => {
    await openFresh()
    const select = () =>
      page.evaluate(() => {
        const p = document.querySelector("main p[data-cudoc-block]")!
        const text = document
          .createTreeWalker(p, NodeFilter.SHOW_TEXT)
          .nextNode()!
        const range = document.createRange()
        range.setStart(text, 0)
        range.setEnd(text, 5)
        p.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerType: "mouse",
          }),
        )
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      })
    const visible = (selector: string) =>
      page.evaluate(
        (s) => !document.querySelector(s)!.hasAttribute("hidden"),
        selector,
      )
    await select()
    await expect.poll(() => visible(".cudoc-ann-float")).toBe(true)
    await page.click(".cudoc-ann-float")
    expect(await visible(".cudoc-ann-composer")).toBe(true)
    expect(await visible(".cudoc-ann-float")).toBe(false)
    await page.click(".cudoc-ann-composer .cudoc-ann-cancel")
    // A tick for the mouseup handler that used to bring the button back.
    await page.waitForTimeout(50)
    expect(
      await page.evaluate(() => ({
        composer: !document
          .querySelector(".cudoc-ann-composer")!
          .hasAttribute("hidden"),
        float: !document
          .querySelector(".cudoc-ann-float")!
          .hasAttribute("hidden"),
        collapsed: getSelection()!.isCollapsed,
      })),
    ).toEqual({ composer: false, float: false, collapsed: true })
    // Saving from the composer clears up the same way.
    await select()
    await expect.poll(() => visible(".cudoc-ann-float")).toBe(true)
    await page.click(".cudoc-ann-float")
    await page.fill(".cudoc-ann-composer .cudoc-ann-text", "Kept.")
    await page.click(".cudoc-ann-composer .cudoc-ann-primary")
    await page.waitForTimeout(50)
    expect(await visible(".cudoc-ann-float")).toBe(false)
    expect(
      await page.evaluate(() => window.cudocAnnotations.list().length),
    ).toBe(1)
  }, 60_000)

  it("dismisses the note button however the reader moves on, and lets the keyboard reach it", async () => {
    await openFresh()
    const select = (pointerType = "mouse", release = true) =>
      page.evaluate(
        ({ pointerType, release }) => {
          const p = document.querySelector("main p[data-cudoc-block]")!
          const text = document
            .createTreeWalker(p, NodeFilter.SHOW_TEXT)
            .nextNode()!
          p.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, pointerType }),
          )
          const range = document.createRange()
          range.setStart(text, 0)
          range.setEnd(text, 5)
          getSelection()!.removeAllRanges()
          getSelection()!.addRange(range)
          if (release)
            p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
        },
        { pointerType, release },
      )
    const float = () =>
      page.evaluate(
        () =>
          !document.querySelector(".cudoc-ann-float")!.hasAttribute("hidden"),
      )
    const shown = () => expect.poll(float).toBe(true)

    // A control that keeps the selection: the button goes on the press and
    // does not come back on the release.
    await select()
    await shown()
    await page.click("#probe")
    await page.waitForTimeout(50)
    expect(await float()).toBe(false)
    expect(await page.evaluate(() => getSelection()!.isCollapsed)).toBe(false)

    // Escape, keeping the selection.
    await select()
    await shown()
    await page.keyboard.press("Escape")
    expect(await float()).toBe(false)

    // The selection going away without any pointer, as a script or a
    // touch handle does it.
    await select()
    await shown()
    await page.evaluate(() => getSelection()!.removeAllRanges())
    await expect.poll(float).toBe(false)

    // A press elsewhere hides it before the release.
    await select()
    await shown()
    const box = (await page.locator("main li").first().boundingBox())!
    await page.mouse.move(box.x + 4, box.y + 4)
    await page.mouse.down()
    expect(await float()).toBe(false)
    await page.mouse.up()

    // Keyboard: Tab reaches the button, Enter opens the composer, Escape
    // closes it, and the button stays gone.
    await select()
    await shown()
    await page.keyboard.press("Tab")
    expect(
      await page.evaluate(() =>
        document.activeElement?.classList.contains("cudoc-ann-float"),
      ),
    ).toBe(true)
    expect(await float()).toBe(true)
    await page.keyboard.press("Enter")
    expect(
      await page.evaluate(
        () =>
          !document
            .querySelector(".cudoc-ann-composer")!
            .hasAttribute("hidden"),
      ),
    ).toBe(true)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(50)
    expect(
      await page.evaluate(() => ({
        composer: !document
          .querySelector(".cudoc-ann-composer")!
          .hasAttribute("hidden"),
        float: !document
          .querySelector(".cudoc-ann-float")!
          .hasAttribute("hidden"),
      })),
    ).toEqual({ composer: false, float: false })

    // Touch: no release in the text, so the button follows the settled
    // selection, and leaves when it collapses.
    await page.evaluate(() => getSelection()!.removeAllRanges())
    await select("touch", false)
    await shown()
    await page.evaluate(() => getSelection()!.collapseToStart())
    await expect.poll(float).toBe(false)
  }, 60_000)

  it("keeps a note whose quote is gone, marked as not found", async () => {
    await openFresh()
    const orphan = JSON.stringify({
      "@context": "http://www.w3.org/ns/anno.jsonld",
      type: "AnnotationCollection",
      generator: "test",
      total: 1,
      items: [
        {
          "@context": "http://www.w3.org/ns/anno.jsonld",
          type: "Annotation",
          id: "urn:uuid:orphan",
          created: "2026-09-16T00:00:00.000Z",
          modified: "2026-09-16T00:00:00.000Z",
          motivation: "commenting",
          body: [
            {
              type: "TextualBody",
              value: "gone",
              format: "text/plain",
              purpose: "commenting",
            },
          ],
          target: {
            source: "index",
            selector: [
              { type: "TextQuoteSelector", exact: "text that was removed" },
            ],
          },
          cudoc: {
            document: "index",
            astHash: "other",
            sourceHash: "",
            block: "",
            heading: "start",
            scope: "text",
            state: "open",
          },
        },
      ],
    })
    const shown = await page.evaluate((json) => {
      window.cudocAnnotations.load(json)
      return {
        anchors: window.cudocAnnotations.anchors(),
        badges: document.querySelector(".cudoc-ann-badges")!.textContent,
        stale: document.querySelectorAll(".cudoc-ann-stale").length,
      }
    }, orphan)
    expect(shown.anchors).toEqual({ "urn:uuid:orphan": "orphan" })
    expect(shown.badges).toMatch(/Not found|위치를 찾지 못함/)
    expect(shown.stale).toBe(1)
  }, 60_000)

  it("reports a malformed address, embedded block or oversized file instead of failing", async () => {
    const message = async () => {
      await page.waitForFunction(
        () =>
          !document.querySelector(".cudoc-ann-message")!.hasAttribute("hidden"),
      )
      return page.evaluate(
        () => document.querySelector(".cudoc-ann-message")!.textContent,
      )
    }
    // A `%` that is not an escape used to throw from the hash handler.
    await openFresh("#cudoc-notes=%zz")
    expect(await message()).toMatch(
      /^(Could not read|주소의 메모를 읽지 못했습니다)/,
    )

    // A saved copy whose block was cut short still opens, with no notes.
    const html = fs.readFileSync(path.join(root, "site", "index.html"), "utf8")
    fs.writeFileSync(
      path.join(root, "site", "index.broken.html"),
      html.replace(
        "</body>",
        '<script type="application/json" id="cudoc-annotations-data">{"items": [</script></body>',
      ),
    )
    await page.goto("about:blank")
    await page.goto(
      pathToFileURL(path.join(root, "site", "index.broken.html")).href,
    )
    await page.waitForFunction(
      () => typeof window.cudocAnnotations === "object",
    )
    expect(await message()).toMatch(/^(Could not load|불러오지 못했습니다)/)
    expect(await page.evaluate(() => window.cudocAnnotations.list())).toEqual(
      [],
    )

    // Under the limit in characters, over it in bytes: refused unread.
    await openFresh()
    const note = await page.evaluate(() =>
      window.cudocAnnotations.create("First paragraph", "kept out"),
    )
    await page.evaluate(() => localStorage.clear())
    await openFresh()
    const padded = JSON.stringify({
      "@context": "http://www.w3.org/ns/anno.jsonld",
      type: "AnnotationCollection",
      generator: "test",
      total: 1,
      padding: "가".repeat(800_000),
      items: [note],
    })
    expect(padded.length).toBeLessThan(2 * 1024 * 1024)
    await page.setInputFiles(".cudoc-ann-file", {
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from(padded),
    })
    expect(await message()).toMatch(/at most 2097152 bytes/)
    expect(await page.evaluate(() => window.cudocAnnotations.list())).toEqual(
      [],
    )
  }, 60_000)

  it("loads a saved page larger than a notes file may be", async () => {
    await openFresh()
    await page.evaluate(() =>
      window.cudocAnnotations.create("Second item", "Carried in a big copy."),
    )
    const copy = await page.evaluate(() =>
      window.cudocAnnotations.embeddedCopy(),
    )
    // A standalone page carries its pictures: well over 2 MiB around the notes.
    const big = copy.replace(
      "<main",
      `<img alt="" src="data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}"><main`,
    )
    await openFresh()
    expect(await page.evaluate(() => window.cudocAnnotations.list())).toEqual(
      [],
    )
    await page.evaluate(() =>
      (document.querySelector(".cudoc-ann-toggle") as HTMLElement).click(),
    )
    await page.setInputFiles(".cudoc-ann-file", {
      name: "index.annotated.html",
      mimeType: "text/html",
      buffer: Buffer.from(big),
    })
    await expect
      .poll(() => page.evaluate(() => window.cudocAnnotations.list().length))
      .toBe(1)
  }, 60_000)

  it("composes an issue on GitHub from a hosted review, after saying what leaves", async () => {
    const hosted = path.join(root, "hosted")
    buildSite({
      sourceRoot: path.join(root, "docs"),
      outDir: hosted,
      libraryDir: path.join(root, "hosted-library"),
      title: "Demo",
      mode: "annotate",
      annotate: {
        target: "hosted",
        reviewId: "demo-review",
        inbox: {
          github: {
            repo: "owner/name",
            template: "review.yml",
            field: "notes",
          },
        },
      },
    })
    await page.goto("about:blank")
    await page.goto(pathToFileURL(path.join(hosted, "index.html")).href)
    await page.waitForFunction(
      () => typeof window.cudocAnnotations === "object",
    )
    await page.evaluate(() => {
      localStorage.clear()
      ;(window as unknown as { opened: string[] }).opened = []
      window.open = ((url: string) => {
        ;(window as unknown as { opened: string[] }).opened.push(url)
        return null
      }) as typeof window.open
      ;(document.querySelector(".cudoc-ann-toggle") as HTMLElement).click()
    })
    // Nothing to send yet.
    await page.click(".cudoc-ann-github")
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector(".cudoc-ann-message")!.textContent,
        ),
      )
      .toMatch(/no notes to send|보낼 메모가 없습니다/)
    await page.evaluate(() =>
      window.cudocAnnotations.create(
        "installer before anything",
        "Reorder this.",
      ),
    )
    await page.click(".cudoc-ann-github")
    // The notice comes first, in the panel; nothing opens until the reader agrees.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector(".cudoc-ann-token")!.textContent,
        ),
      )
      .toMatch(/GitHub/)
    expect(
      await page.evaluate(
        () => (window as unknown as { opened: string[] }).opened,
      ),
    ).toEqual([])
    await page.click(".cudoc-ann-github-continue")
    const [opened] = await page.evaluate(
      () => (window as unknown as { opened: string[] }).opened,
    )
    const url = new URL(opened!)
    expect(url.origin + url.pathname).toBe(
      "https://github.com/owner/name/issues/new",
    )
    expect(url.searchParams.get("template")).toBe("review.yml")
    expect(url.searchParams.get("notes")).toMatch(/^#cudoc-notes=[jz]\./)
    // Opening the page is not submitting it: the note stays.
    expect(
      await page.evaluate(() => window.cudocAnnotations.list().length),
    ).toBe(1)

    // Too much for an address: the notes leave as a file instead.
    await page.evaluate(() => {
      let seed = 7
      const noise = () =>
        Array.from({ length: 900 }, () => {
          seed = (seed * 48271) % 2147483647
          return String.fromCharCode(33 + (seed % 90))
        }).join("")
      for (let i = 0; i < 12; i++)
        window.cudocAnnotations.create("installer before anything", noise())
    })
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click(".cudoc-ann-github"),
    ])
    expect(download.suggestedFilename()).toBe("index.annotations.json")
    await page.evaluate(() => localStorage.clear())
  }, 60_000)

  it("logged no errors along the way", () => {
    expect(errors).toEqual([])
  })
})
