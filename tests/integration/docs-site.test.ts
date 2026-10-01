/**
 * The documentation site, built as the release workflow builds it: every
 * guide and its translation is a page, nothing else in the repository is,
 * every link inside the site resolves to a page and an id that exist, and a
 * link to a source file opens it on GitHub at the commit the site was built
 * from.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { parse } from "node-html-parser"
import {
  buildDocsSite,
  sourceFiles,
  ROOT,
  VERSION,
} from "../../docs-site/build.mjs"
import { verifySite } from "../../docs-site/verify.mjs"

let temporary: string
let outDir: string
let result: {
  documentCount: number
  diagnostics: unknown[]
  omitted: unknown[]
}
const pages = () =>
  fs
    .readdirSync(outDir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".html") && !file.includes(".print."))
    .filter((file) => !/^(?:showcase|samples)\//.test(file))
    .map((file) => file.split(path.sep).join("/"))
    .sort()

beforeAll(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-docs-site-"))
  outDir = path.join(temporary, "site")
  result = buildDocsSite({
    sourceRoot: path.join(temporary, "source"),
    outDir,
    libraryDir: path.join(temporary, "library"),
  })
}, 120_000)
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }))

describe("the documentation site", () => {
  it("publishes every guide and translation, with nothing left out or untranslated", () => {
    const expected = (sourceFiles() as string[])
      .map((file) =>
        file === "README.md"
          ? "index.html"
          : file === "README.ko.md"
            ? "index.ko.html"
            : file.replace(/\.md$/, ".html"),
      )
      .sort()
    expect(pages()).toEqual(expected)
    // Nothing collected is left out, and no listed guide lacks its Korean
    // translation, which the navigation would report as missing-translation.
    expect(result.omitted).toEqual([])
    expect(result.diagnostics).toEqual([])
    for (const page of pages().filter((file) => !file.endsWith(".ko.html")))
      expect(pages(), page).toContain(page.replace(/\.html$/, ".ko.html"))
  })

  it("carries nothing from the local, ignored files beside the docs", () => {
    const everything = fs
      .readdirSync(outDir, { recursive: true })
      .map(String)
      .join("\n")
    expect(everything).not.toMatch(/sandbox|AGENTS|CLAUDE/i)
    for (const page of pages())
      expect(fs.readFileSync(path.join(outDir, page), "utf8")).not.toMatch(
        /sandbox\//,
      )
  })

  it("passes the check the deploy runs: every link resolves, nothing from the domain root, the version stated", () => {
    const { problems, links } = verifySite(outDir, { version: VERSION }) as {
      problems: string[]
      links: number
    }
    expect(problems).toEqual([])
    expect(links).toBeGreaterThan(1000)
  })

  it("opens a source file on GitHub at the commit, and only files that exist", () => {
    const prefix = "https://github.com/cudoment/cudoc/blob/"
    const source = new Set<string>()
    for (const page of pages())
      for (const anchor of parse(
        fs.readFileSync(path.join(outDir, page), "utf8"),
      ).querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href")!
        if (href.startsWith(prefix)) source.add(href)
      }
    expect(source.size).toBeGreaterThan(50)
    // The commit checked out, which is the one the release builds.
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()
    for (const href of source) {
      const [commit, ...rest] = href.slice(prefix.length).split("/")
      expect(commit).toBe(head)
      const file = decodeURIComponent(rest.join("/").split("#")[0]!)
      expect(fs.existsSync(path.join(ROOT, file)), href).toBe(true)
    }
  })

  it("marks each page with its language and pairs it with its translation", () => {
    const korean = parse(
      fs.readFileSync(path.join(outDir, "docs/export.ko.html"), "utf8"),
    )
    expect(korean.querySelector("html")!.getAttribute("lang")).toBe("ko")
    expect(
      korean
        .querySelectorAll(".languages a")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["export.html"])
    expect(
      parse(fs.readFileSync(path.join(outDir, "index.html"), "utf8"))
        .querySelector("html")!
        .getAttribute("lang"),
    ).toBe("en")
  })
})
