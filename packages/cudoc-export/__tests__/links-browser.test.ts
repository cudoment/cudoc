/// <reference lib="dom" />
/**
 * Which links the built-in stylesheet underlines, read from the computed
 * style in the browser the package installs for PDF. The palette's accent is
 * black or white, so a link anywhere in the text, a heading, a caption, a term
 * or a summary included, is told from its text by an underline, whether or not an author's attribute gave it a class; a host's
 * heading permalink (`header-anchor`), a link in a navigation list inside
 * `main`, as a generated landing page draws it, and an entry of a volume's
 * printed contents keep their own look. The markup mirrors what the
 * site and the volume write; the contents are checked twice, inside the
 * volume's own `nav` and as the bare list, so the component's rule holds
 * without the navigation exception. Skips, naming the command, when that
 * browser is absent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { Browser, Page } from "playwright-core"
import { buildStyles } from "../src/index.js"
import { pageRules } from "../src/design/css.js"
import {
  browserAvailable,
  browserInstallCommand,
  launchBrowser,
} from "../src/pdf.js"

const available = await browserAvailable()
if (!available)
  console.log(
    `links-browser: browser not installed; run ${browserInstallCommand().join(" ")}`,
  )
const suite = available ? describe : describe.skip

const body = `
<main>
  <p>A <a id="plain" href="#a">plain link</a> and a
  <a id="classed" class="external" href="#b">classed link</a>.</p>
  <ul><li><strong><a id="nested" href="#c">nested in a list</a></strong></li></ul>
  <table><caption><a id="caption" href="#d">in a caption</a></caption>
    <tbody><tr><td><a id="cell" href="#d">in a cell</a></td></tr></tbody></table>
  <dl><dt><a id="term" href="#d">in a term</a></dt><dd>a definition</dd></dl>
  <details><summary><a id="summary" href="#d">in a summary</a></summary>folded</details>
  <h2 id="heading">See <a id="in-heading" href="#h">an authored link</a><a id="permalink" class="header-anchor" href="#heading">#</a></h2>
</main>
<main class="landing">
  <nav><ul><li><a id="landing" data-cudoc-final href="#e">a landing entry</a></li></ul></nav>
</main>
<main id="main-content">
  <nav class="cudoc-contents" aria-label="Contents"><h2>Contents</h2>
    <ol class="cudoc-contents-list"><li data-depth="1"><a id="volume-contents" href="#f">
      <span>an entry</span><span></span><span>3</span></a></li></ol></nav>
  <ol class="cudoc-contents-list"><li data-depth="1"><a id="contents" href="#g">
    <span>a bare entry</span><span></span><span>4</span></a></li></ol>
</main>`

suite("underlined links in the browser", () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  const decoration = (id: string) =>
    page.$eval(`#${id}`, (link) => getComputedStyle(link).textDecorationLine)

  it.each(["light", "dark"])(
    "underlines prose links and leaves navigation alone in %s",
    async (scheme) => {
      await page.emulateMedia({ colorScheme: scheme as "light" | "dark" })
      await page.setContent(
        `<!doctype html><style>${buildStyles()}</style><body>${body}</body>`,
      )
      for (const id of [
        "plain",
        "classed",
        "nested",
        "cell",
        "caption",
        "term",
        "summary",
        "in-heading",
      ])
        expect(await decoration(id), id).toBe("underline")
      for (const id of ["permalink", "landing"])
        expect(await decoration(id), id).toBe("none")
    },
  )

  it("leaves the printed contents without an underline", async () => {
    await page.setContent(
      `<!doctype html><style>${buildStyles()}\n${pageRules()}</style><body>${body}</body>`,
    )
    expect(await decoration("volume-contents")).toBe("none")
    expect(await decoration("contents")).toBe("none")
    expect(await decoration("plain")).toBe("underline")
  })
})
