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
import { DEMOS, demoMounts } from "../../docs-site/demos.mjs"

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

  it("names each page's address and its translation, and lists every page in the sitemap", () => {
    const SITE = "https://cudoment.github.io/cudoc/"
    const head = parse(
      fs.readFileSync(path.join(outDir, "docs/export.ko.html"), "utf8"),
    ).querySelector("head")!
    expect(
      head.querySelector('link[rel="canonical"]')!.getAttribute("href"),
    ).toBe(`${SITE}docs/export.ko.html`)
    expect(
      head
        .querySelectorAll('link[rel="alternate"]')
        .map((link) => [
          link.getAttribute("hreflang"),
          link.getAttribute("href"),
        ]),
    ).toEqual([
      ["en", `${SITE}docs/export.html`],
      ["ko", `${SITE}docs/export.ko.html`],
    ])
    // The language switcher above the first paragraph is passed over, and
    // the lead under it is short enough to be the description whole, which
    // docs-style.test.ts holds every page to.
    const description = head
      .querySelector('meta[name="description"]')!
      .getAttribute("content")!
    expect(description).toMatch(/^`?cudoc-export`?[은는] /)
    expect(description).not.toMatch(/…$/)
    expect(Array.from(description).length).toBeLessThanOrEqual(160)
    const listed = [
      ...fs
        .readFileSync(path.join(outDir, "sitemap.xml"), "utf8")
        .matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((match) => match[1]!.slice(SITE.length))
    expect(listed.sort()).toEqual(pages())
  })
})

/**
 * The host demos the site publishes under demos/ when the deploy has built
 * them. Building them takes every example's own build, which CI runs after
 * the examples; what is checked here is how the site receives them and that
 * every address the guides give for one names a page the build writes.
 */
describe("the host demos", () => {
  const write = (dir: string, file: string, html: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), html)
  }

  it("follows a demo's links from the path the site is served under", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-demo-links-"))
    try {
      write(
        dir,
        "demos/next/portable/index.html",
        [
          '<a href="/cudoc/demos/next/reference/#limits">Limits</a>',
          '<a href="/cudoc/demos/next/guide">Guide</a>',
          '<a href="reference.md#limits">kept</a>',
          '<a href="/reference/">outside the site</a>',
          '<a href="/cudoc/demos/next/gone/">missing</a>',
        ].join(""),
      )
      write(dir, "demos/next/reference/index.html", '<h2 id="limits">L</h2>')
      write(dir, "demos/next/guide.html", "<p>guide</p>")
      // A page cudoc-export wrote spells nothing from the root, the site's
      // own path included.
      write(dir, "index.html", '<a href="/cudoc/demos/next/guide">demo</a>')
      const { problems, kept } = verifySite(dir) as {
        problems: string[]
        kept: string[]
      }
      expect([...problems].sort()).toEqual([
        "demos/next/portable/index.html: /cudoc/demos/next/gone/ names a missing file",
        "demos/next/portable/index.html: /reference/ is spelled from the domain root",
        "index.html: /cudoc/demos/next/guide is spelled from the domain root",
      ])
      expect(kept).toEqual([
        "demos/next/portable/index.html: reference.md#limits",
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("mounts every demo under demos/, and refuses a directory missing one", () => {
    expect(demoMounts(undefined)).toEqual([])
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-demo-mounts-"))
    try {
      for (const demo of DEMOS.slice(1))
        write(path.join(dir, demo.name), demo.page, "<p>demo</p>")
      expect(() => demoMounts(dir)).toThrow(
        `holds no built ${DEMOS[0]!.name} demo; run npm run docs:demos`,
      )
      write(path.join(dir, DEMOS[0]!.name), DEMOS[0]!.page, "<p>demo</p>")
      expect(demoMounts(dir)).toEqual(
        DEMOS.map((demo) => ({
          from: path.join(dir, demo.name),
          to: `demos/${demo.name}`,
        })),
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("is linked from the guides at the page each demo build writes", () => {
    const PREFIX = "https://cudoment.github.io/cudoc/demos/"
    const files = [
      "README.md",
      "README.ko.md",
      "examples/README.md",
      ...(sourceFiles() as string[]).filter((file) => file.startsWith("docs/")),
      ...fs
        .readdirSync(path.join(ROOT, "packages"))
        .map((dir) => `packages/${dir}/README.md`)
        .filter((file) => fs.existsSync(path.join(ROOT, file))),
    ]
    const linked = new Map<string, string[]>()
    for (const file of files)
      for (const [url] of fs
        .readFileSync(path.join(ROOT, file), "utf8")
        .matchAll(/https:\/\/cudoment\.github\.io\/cudoc\/demos\/[^\s)"'>]+/g))
        linked.set(url, [...(linked.get(url) ?? []), file])
    // Each demo is linked from the demo table, its guide and its package.
    expect(linked.size).toBe(DEMOS.length)
    for (const [url, from] of linked) {
      const [name, ...rest] = url.slice(PREFIX.length).split("/")
      const demo = DEMOS.find((entry) => entry.name === name)
      expect(demo, `${url} in ${from.join(", ")}`).toBeDefined()
      // As GitHub Pages serves it: a folder's index.html, or page.html.
      const requested = rest.join("/")
      const served = requested.endsWith("/")
        ? `${requested}index.html`
        : requested.endsWith(".html")
          ? requested
          : `${requested}.html`
      expect(served, `${url} in ${from.join(", ")}`).toBe(demo!.page)
      expect(from.length, url).toBeGreaterThanOrEqual(5)
    }
  })

  it("links each demo's navigation to a guide and a section the site has", async () => {
    const { demo } = await import("../../examples/fixtures/demo.mjs")
    const SITE = "https://cudoment.github.io/cudoc/"
    // The guide each example names, read from its configuration.
    const configs = [
      "next-mdx/next.config.mjs",
      "docusaurus/docusaurus.config.mjs",
      "nextra/next.config.mjs",
      "vitepress/docs/.vitepress/config.mjs",
      "eleventy/eleventy.config.mjs",
    ]
    const guides = configs.map(
      (file) =>
        fs
          .readFileSync(path.join(ROOT, "examples", file), "utf8")
          .match(/\bguide: "([^"]+)"/)?.[1],
    )
    expect(guides).toEqual([
      "next",
      "docusaurus",
      "nextra",
      "vitepress",
      "eleventy",
    ])
    for (const guide of guides) {
      const links = demo({
        host: "Host",
        version: "1.0.0",
        example: "example",
        guide: guide!,
      }).links.filter((link: { url: string }) => link.url.startsWith(SITE))
      expect(links.length).toBeGreaterThan(1)
      for (const { url } of links) {
        const [file, id] = url.slice(SITE.length).split("#")
        expect(fs.existsSync(path.join(outDir, file!)), url).toBe(true)
        if (id)
          expect(
            parse(
              fs.readFileSync(path.join(outDir, file!), "utf8"),
            ).getElementById(id),
            url,
          ).toBeTruthy()
      }
    }
  })
})
