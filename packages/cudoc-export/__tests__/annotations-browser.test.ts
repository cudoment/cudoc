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
const available =
  !process.env.CUDOC_SKIP_BROWSER_DOWNLOAD && (await browserAvailable())
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
      "---\nlang: ko\n---\n\n# Home (#home)\n\nFirst paragraph of the page.\n\n## Start (#start)\n\nRun the installer before anything else.\n\n- First item\n- Second item\n",
    )
    buildSite({
      sourceRoot,
      outDir: path.join(root, "site"),
      title: "Demo",
      annotations: true,
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
    expect(result.excerpts).toEqual(["installer before anything", "First item"])
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
    expect(
      tree
        .querySelectorAll("script")
        .map((s) => s.getAttribute("src") ?? s.getAttribute("type")),
    ).toEqual(["cudoc-annotations.js", "application/json"])
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

    fs.writeFileSync(path.join(root, "site", "index.annotated.html"), copy)
    await page.goto("about:blank")
    await page.goto(
      pathToFileURL(path.join(root, "site", "index.annotated.html")).href,
    )
    await page.waitForFunction(
      () => typeof window.cudocAnnotations === "object",
    )
    await page.evaluate(() => localStorage.clear())
    const restored = await page.evaluate(() => ({
      notes: window.cudocAnnotations.list().length,
      anchors: Object.values(window.cudocAnnotations.anchors()),
    }))
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
    await page.click(".cudoc-ann-toggle")
    const pushed = await page.evaluate(() => ({
      push: document.documentElement.classList.contains("cudoc-ann-push"),
      padding: getComputedStyle(document.body).paddingRight,
      header: getComputedStyle(document.querySelector("header")!).paddingRight,
      button: document
        .querySelector(".cudoc-ann-layout")!
        .getAttribute("aria-label"),
    }))
    expect(pushed.push).toBe(true)
    expect(pushed.padding).toBe("352px")
    expect(parseFloat(pushed.header)).toBeGreaterThan(352)
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
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
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

  it("logged no errors along the way", () => {
    expect(errors).toEqual([])
  })
})
