/**
 * The features of the HTML export used together, as a reader combines them,
 * and the output a failed build leaves: the previous output whole, and no
 * file from an earlier mode.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse } from "node-html-parser"
import { buildSite, type SiteOptions } from "../src/index.js"
import {
  ANNOTATION_CONTEXT,
  EMBEDDED_DATA_ID,
} from "../src/annotations/model.js"
import { collection } from "../src/annotations/model.js"
import { jsonForScript } from "../src/annotations/core.js"
import { runAnnotationsCommand } from "../src/annotations/cli.js"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

function project(files: Record<string, string | Buffer>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-scenario-"))
  roots.push(root)
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  const sourceRoot = path.join(root, "docs")
  const outDir = path.join(root, "out")
  const libraryDir = path.join(root, ".cudoc", "documents")
  const listing = () =>
    fs
      .readdirSync(outDir, { recursive: true })
      .map(String)
      .filter((file) => !fs.statSync(path.join(outDir, file)).isDirectory())
      .sort()
  return {
    root,
    outDir,
    libraryDir,
    at: (name: string) => path.join(root, name),
    build: (options: Partial<SiteOptions> = {}) =>
      buildSite({ sourceRoot, outDir, libraryDir, title: "Demo", ...options }),
    read: (file: string) => fs.readFileSync(path.join(outDir, file), "utf8"),
    listing,
    /** Every output file with its bytes, to compare a build with the one before. */
    snapshot: () =>
      Object.fromEntries(
        listing().map((file) => [
          file,
          fs.readFileSync(path.join(outDir, file)).toString("base64"),
        ]),
      ),
  }
}

const doc = (title: string, body = "Text.") => `# ${title}\n\n${body}\n`

describe("a build that fails", () => {
  const files = {
    "docs/index.md": doc("Home", "![P](pixel.png) [Guide](guide.md)"),
    "docs/guide.md": doc("Guide"),
    "docs/pixel.png": PNG,
    "theme/brand.css": ".brand { color: teal }",
  }

  it.each([
    [
      "while reading a stylesheet",
      (p: ReturnType<typeof project>) => {
        fs.writeFileSync(p.at("theme/brand.css"), '@import "other.css";')
        return { css: [p.at("theme/brand.css")] }
      },
      /@import/,
    ],
    [
      "while carrying an image into a single page",
      () => ({
        mode: "standalone" as const,
        standalone: { maxAssetBytes: 20 },
      }),
      /over standalone\.maxAssetBytes/,
    ],
    [
      "while checking a strict single page",
      (p: ReturnType<typeof project>) => {
        fs.writeFileSync(
          p.at("docs/guide.md"),
          doc("Guide", "![Remote](https://img.example/x.png)"),
        )
        return { mode: "standalone" as const, strict: true }
      },
      /strict: the pages need what is outside them/,
    ],
  ])("%s leaves the previous output as it was", (_, breakIt, message) => {
    const p = project(files)
    p.build({ css: [p.at("theme/brand.css")] })
    const before = p.snapshot()
    expect(Object.keys(before)).toContain("cudoc-css/1-brand.css")
    expect(() => p.build(breakIt(p))).toThrow(message)
    expect(p.snapshot()).toEqual(before)
  })

  it("leaves no file of an earlier mode behind", () => {
    const p = project(files)
    p.build({ css: [p.at("theme/brand.css")], themeSwitch: true })
    expect(p.listing()).toEqual(
      expect.arrayContaining([
        "cudoc-css/1-brand.css",
        "cudoc-theme.js",
        "cudoc.css",
        "guide.html",
        "index.print.html",
        "pixel.png",
      ]),
    )
    p.build({
      mode: "standalone",
      documents: ["index"],
      css: [p.at("theme/brand.css")],
      themeSwitch: true,
    })
    // Only the picked page; the guide it links to is named as a dependency,
    // not left over from the site.
    expect(p.listing()).toEqual([".cudoc-output", "index.html"])
    p.build({ mode: "annotate" })
    expect(p.listing()).toEqual([".cudoc-output", "guide.html", "index.html"])
  })
})

describe("features used together", () => {
  it("annotates a Korean page with the theme switch and a large image, and maps its notes back", () => {
    // Over the 256 KiB a browser keeps comfortably in an attribute, under
    // the default per-resource limit.
    const large = Buffer.concat([PNG, Buffer.alloc(600 * 1024)])
    const p = project({
      "docs/index.md": doc("Home", "Hello."),
      "docs/index.ko.md": doc("홈", "안녕하세요.\n\n![큰 그림](large.png)"),
      "docs/large.png": large,
    })
    const result = p.build({
      mode: "annotate",
      locales: { en: "English", ko: "한국어" },
      themeSwitch: true,
      documents: ["index.ko.md"],
    })
    expect(result.files).toEqual(["index.ko.html"])
    expect(p.listing()).toEqual([".cudoc-output", "index.ko.html"])
    const html = p.read("index.ko.html")
    const page = parse(html)
    expect(page.querySelector("html")!.getAttribute("lang")).toBe("ko")
    // Everything is inside: no stylesheet, script or image is fetched.
    expect(page.querySelectorAll("link[rel=stylesheet]")).toHaveLength(0)
    expect(page.querySelectorAll("script[src]")).toHaveLength(0)
    const image = page.querySelector("main img")!.getAttribute("src")!
    expect(image.startsWith("data:image/png;base64,")).toBe(true)
    expect(Buffer.from(image.split(",")[1]!, "base64")).toEqual(large)
    // The theme menu speaks the page's language.
    const ui = JSON.parse(
      page.querySelector("html")!.getAttribute("data-cudoc-ui")!,
    )
    expect(ui).toEqual({ theme: "테마", light: "라이트", dark: "다크" })
    // The theme script itself, inline: the stylesheet only mentions it.
    expect(
      page
        .querySelectorAll("script")
        .some(
          (script) =>
            !script.getAttribute("src") &&
            script.text.includes('"cudoc-theme"'),
        ),
    ).toBe(true)

    // The reader saves the page with a note embedded, as the runtime does,
    // and the author maps it back to the Korean source line.
    const heading = page.querySelector("main h1")!.getAttribute("id")!
    const notes = collection(
      [
        {
          "@context": ANNOTATION_CONTEXT,
          type: "Annotation",
          id: "urn:uuid:00000000-0000-4000-8000-000000000001",
          created: "2026-10-01T09:00:00.000Z",
          modified: "2026-10-01T09:00:00.000Z",
          motivation: "commenting",
          body: [
            {
              type: "TextualBody",
              value: "인사말을 바꿔 주세요.",
              format: "text/plain",
              purpose: "commenting",
            },
          ],
          target: {
            source: "index.ko",
            selector: [{ type: "TextQuoteSelector", exact: "안녕하세요." }],
          },
          cudoc: {
            document: "index.ko",
            astHash: "",
            sourceHash: "",
            block: "",
            heading,
            scope: "text",
            state: "open",
          },
        },
      ],
      "test",
    )
    const saved = p.at("index.ko.annotated.html")
    fs.writeFileSync(
      saved,
      html.replace(
        "</body>",
        `<script type="application/json" id="${EMBEDDED_DATA_ID}">${jsonForScript(notes)}</script></body>`,
      ),
    )
    const report = runAnnotationsCommand([
      saved,
      "--library",
      p.libraryDir,
      "--json",
    ])
    expect(report.exitCode).toBe(0)
    const [mapped] = JSON.parse(report.output).documents
    expect(mapped).toMatchObject({ id: "index.ko", sourcePath: "index.ko.md" })
    expect(mapped.notes[0]).toMatchObject({ match: "exact", startLine: 3 })
  })

  it("serves a hosted review from any base path, with mounts and source links", () => {
    const p = project({
      "docs/index.md": doc(
        "Home",
        "[Guide](guide/setup.md) [Sample](../samples/out/index.html) [Code](../src/main.ts#L1)",
      ),
      "docs/guide/setup.md": doc("Setup", "[Home](../index.md#home)"),
      "samples/out/index.html": "<p>sample</p>",
      "src/main.ts": "export {}",
    })
    const review = {
      // The library spells paths from the repository, as the docs site's
      // does, so sourceLinks reaches files beside the documents.
      sourceRoot: undefined,
      roots: [{ dir: p.at("docs"), base: "docs" }],
      home: "docs/index.md",
      mode: "annotate" as const,
      annotate: {
        target: "hosted" as const,
        reviewId: "demo-review",
        inbox: {
          github: {
            repo: "owner/repo",
            template: "review.yml",
            field: "notes",
          },
        },
      },
      sourceLinks: {
        root: p.root,
        url: "https://github.com/owner/repo/blob/abc123",
      },
    }
    const result = p.build({
      ...review,
      mounts: [{ from: p.at("samples/out"), to: "samples" }],
    })
    // A hosted review is a site: the runtime and styles are files beside it.
    expect(result.files).toEqual(
      expect.arrayContaining([
        "cudoc-annotations.js",
        "cudoc-annotations.css",
        "cudoc.css",
        "docs/guide/setup.html",
        "index.html",
      ]),
    )
    // The review id names the notes in every reviewer's browser, so a
    // rebuilt site keeps them.
    const home = parse(p.read("index.html"))
    const main = home.querySelector("main")!
    expect(main.getAttribute("data-cudoc-site")).toBe("demo-review")
    expect(JSON.parse(main.getAttribute("data-cudoc-inbox")!)).toEqual({
      github: { repo: "owner/repo", template: "review.yml", field: "notes" },
    })
    // Every link the site writes is relative or names the repository, so it
    // works under /repo/ on GitHub Pages as at a domain's root.
    expect(
      home.querySelectorAll("script[src]").map((s) => s.getAttribute("src")),
    ).toEqual(["cudoc-annotations.js"])
    expect(
      home.querySelectorAll("main a").map((a) => a.getAttribute("href")),
    ).toEqual([
      "docs/guide/setup.html",
      "samples/index.html",
      "https://github.com/owner/repo/blob/abc123/src/main.ts#L1",
    ])
    const setup = parse(p.read("docs/guide/setup.html"))
    expect(
      setup.querySelectorAll("script[src]").map((s) => s.getAttribute("src")),
    ).toEqual(["../../cudoc-annotations.js"])
    expect(setup.querySelector("main a")!.getAttribute("href")).toBe(
      "../../index.html#home",
    )
    expect(p.read("samples/index.html")).toBe("<p>sample</p>")
    for (const page of [home, setup])
      for (const element of page.querySelectorAll("[href], [src]"))
        expect(
          element.getAttribute("href") ?? element.getAttribute("src"),
        ).not.toMatch(/^\//)

    // Pointed at a deployed host instead, the pages link to it, and a file
    // the collection leaves out names the repository, the sample included
    // now that no mount publishes it; a mount, which only a relative link
    // reaches, is refused.
    const hosted = p.build({
      ...review,
      links: "host",
      hostUrl: "https://owner.github.io/repo/",
    })
    expect(hosted.files).toContain("index.html")
    expect(
      parse(p.read("index.html"))
        .querySelectorAll("main a")
        .map((a) => a.getAttribute("href")),
    ).toEqual([
      "https://owner.github.io/repo/docs/guide/setup",
      "https://github.com/owner/repo/blob/abc123/samples/out/index.html",
      "https://github.com/owner/repo/blob/abc123/src/main.ts#L1",
    ])
    expect(() =>
      p.build({
        ...review,
        links: "host",
        hostUrl: "https://owner.github.io/repo/",
        mounts: [{ from: p.at("samples/out"), to: "samples" }],
      }),
    ).toThrow(/mounts are reached by relative links/)
    expect(() =>
      p.build({
        mode: "standalone",
        mounts: [{ from: p.at("samples/out"), to: "samples" }],
      }),
    ).toThrow(/a single page carries what it shows, so mounts need/)
  })

  it("writes picked standalone pages that link to the deployed site", () => {
    const p = project({
      "docs/a.md": doc("A", "[B](b.md#b) ![P](pixel.png)"),
      "docs/b.md": doc("B"),
      "docs/pixel.png": PNG,
    })
    const result = p.build({
      mode: "standalone",
      documents: ["a.md"],
      links: "host",
      hostUrl: "https://example.com/docs/",
      strict: true,
    })
    // The page it links to is on the site, so nothing is needed beside it.
    expect(result.files).toEqual(["a.html"])
    expect(result.dependencies).toEqual([])
    expect(p.listing()).toEqual([".cudoc-output", "a.html"])
    const page = parse(p.read("a.html"))
    expect(page.querySelector("main a")!.getAttribute("href")).toBe(
      "https://example.com/docs/b#b",
    )
    expect(
      page.querySelector("main img")!.getAttribute("src")!.startsWith("data:"),
    ).toBe(true)
  })
})
