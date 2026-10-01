/**
 * Single pages that carry what they show, and the stylesheets, mounts and
 * source links a site adds: the contract table of the export guide, row by
 * row.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse } from "node-html-parser"
import { buildSite, type SiteOptions } from "../src/index.js"
import { scriptText, styleText } from "../src/stylesheets.js"

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-standalone-"))
  roots.push(root)
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  const sourceRoot = path.join(root, "docs")
  fs.mkdirSync(sourceRoot, { recursive: true })
  const outDir = path.join(root, "out")
  return {
    root,
    outDir,
    at: (name: string) => path.join(root, name),
    build: (options: Partial<SiteOptions> = {}) =>
      buildSite({ sourceRoot, outDir, title: "Demo", ...options }),
    read: (file: string) => fs.readFileSync(path.join(outDir, file), "utf8"),
    exists: (file: string) => fs.existsSync(path.join(outDir, file)),
    listing: () =>
      fs
        .readdirSync(outDir, { recursive: true })
        .map(String)
        .filter((file) => !fs.statSync(path.join(outDir, file)).isDirectory())
        .sort(),
  }
}

const doc = (title: string, body = "Text.") => `# ${title}\n\n${body}\n`

describe("a standalone page", () => {
  it("carries its styles, images and stylesheet files, and nothing lands beside it", () => {
    const p = project({
      "docs/index.md": doc(
        "Home",
        '![Pixel](pixel.png)\n\n<img srcset="pixel.png 1x, pixel.png 2x" src="pixel.png" alt="">\n\n<video poster="pixel.png"></video>\n\n<p style="background: url(pixel.png)">styled</p>\n\n<style>.mark { background: url("pixel.png") }</style>',
      ),
      "docs/pixel.png": PNG,
      "theme/brand.css":
        '.brand { background: url("pattern.png") } /* </STYLE> */',
      "theme/pattern.png": PNG,
    })
    const result = p.build({
      mode: "standalone",
      css: [p.at("theme/brand.css")],
    })
    expect(result.files).toEqual(["index.html"])
    expect(p.listing()).toEqual([".cudoc-output", "index.html"])
    const html = p.read("index.html")
    const page = parse(html)
    expect(page.querySelectorAll("link")).toHaveLength(0)
    expect(page.querySelectorAll("head style")).toHaveLength(1)
    const style = page.querySelector("head style")!.text
    expect(style).toContain("--canvas")
    expect(style).toContain('.brand { background: url("data:image/png;base64,')
    // A comment cannot close the element that carries it, whatever its case.
    expect(style).toContain("<\\/STYLE>")
    for (const img of page.querySelectorAll("main img"))
      expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/)
    expect(
      page.querySelector("main img[srcset]")!.getAttribute("srcset"),
    ).toMatch(/^data:image\/png;base64,\S+ 1x, data:image\/png;base64,\S+ 2x$/)
    expect(page.querySelector("video")!.getAttribute("poster")).toMatch(
      /^data:/,
    )
    expect(page.querySelector("p[style]")!.getAttribute("style")).toContain(
      'url("data:image/png;base64,',
    )
    expect(page.querySelector("main style")!.text).toContain(
      'url("data:image/png;base64,',
    )
    expect(result.dependencies).toEqual([])
    // A single page has no navigation, and no home to link the title to.
    expect(page.querySelector("nav.sidebar")).toBeNull()
    expect(page.querySelector("header a")).toBeNull()
    expect(html).toContain('class="layout single"')
  })

  it.each([
    [
      "@import in a stylesheet",
      { "theme/a.css": '@import "b.css";' },
      "",
      /uses @import; list each stylesheet in css instead/,
    ],
    [
      "a stylesheet loading from another host",
      { "theme/a.css": ".x { background: url(https://cdn.example/x.png) }" },
      "",
      /loads https:\/\/cdn\.example\/x\.png from another host/,
    ],
    [
      "a video it cannot carry",
      {},
      '<video src="clip.mp4"></video>',
      /loads clip\.mp4 in <video>, which a standalone page cannot carry inline/,
    ],
    ["an iframe", {}, '<iframe src="frame.html"></iframe>', /in <iframe>/],
    [
      "an SVG use of another file",
      {},
      '<svg><use href="icons.svg#a"></use></svg>',
      /in <use>/,
    ],
    [
      "a remote stylesheet in raw HTML",
      {},
      '<link rel="stylesheet" href="https://cdn.example/x.css">',
      /from another host/,
    ],
    [
      "a file type it has no inline form for",
      {},
      '<img src="clip.mp4">',
      /a \.mp4 file a standalone page cannot carry inline/,
    ],
  ])("refuses %s", (_, extra, body, message) => {
    const p = project({
      "docs/index.md": doc("Home", body),
      "docs/clip.mp4": "video",
      "docs/frame.html": "<p>frame</p>",
      "docs/icons.svg": "<svg/>",
      ...extra,
    })
    const css = Object.keys(extra).map((name) => p.at(name))
    expect(() => p.build({ mode: "standalone", css: css.slice(0, 1) })).toThrow(
      message,
    )
    expect(p.exists("index.html")).toBe(false)
  })

  it("lists what it needs from outside, and strict refuses it", () => {
    const p = project({
      "docs/a.md": doc(
        "A",
        "![Remote](https://img.example/x.png)\n\n[Spec](spec.pdf)\n\n[B](b.md)",
      ),
      "docs/b.md": doc("B"),
      "docs/spec.pdf": "%PDF",
    })
    const result = p.build({ mode: "standalone", documents: ["a"] })
    expect(result.files).toEqual(["a.html"])
    expect(p.exists("b.html")).toBe(false)
    expect(p.exists("spec.pdf")).toBe(true)
    expect(result.dependencies).toEqual([
      { kind: "file", document: "a", url: "spec.pdf" },
      { kind: "page", document: "a", url: "b.md" },
      { kind: "remote", document: "a", url: "https://img.example/x.png" },
    ])
    expect(() =>
      p.build({ mode: "standalone", documents: ["a"], strict: true }),
    ).toThrow(/strict: the pages need what is outside them/)
  })

  it("picks documents only from what the site publishes, and only for single pages", () => {
    const p = project({ "docs/a.md": doc("A"), "docs/b.md": doc("B") })
    expect(() =>
      p.build({
        mode: "standalone",
        navigation: ["a.md"],
        documents: ["b.md"],
      }),
    ).toThrow(
      /documents names b\.md, which the site does not publish \(not in the navigation\)/,
    )
    expect(() => p.build({ documents: ["a.md"] })).toThrow(
      /documents picks pages for standalone or annotate with the file target/,
    )
    expect(() => p.build({ strict: true })).toThrow(
      /strict applies to single pages/,
    )
  })

  it("keeps each resource and each page within its limit", () => {
    const p = project({
      "docs/index.md": doc("Home", "![P](pixel.png)"),
      "docs/pixel.png": PNG,
    })
    expect(() =>
      p.build({ mode: "standalone", standalone: { maxAssetBytes: 20 } }),
    ).toThrow(/over standalone\.maxAssetBytes \(20\)/)
    expect(() =>
      p.build({ mode: "standalone", standalone: { maxPageBytes: 1000 } }),
    ).toThrow(/over standalone\.maxPageBytes \(1000\)/)
    expect(() =>
      p.build({
        mode: "standalone",
        standalone: { maxPageBytes: 64 * 1024 * 1024 },
      }),
    ).toThrow(/standalone\.maxPageBytes is a whole number of bytes up to/)
  })

  it("writes print copies only when a PDF will be printed from them", () => {
    const p = project({
      "docs/a.md": doc("A", "![P](pixel.png)"),
      "docs/pixel.png": PNG,
    })
    p.build({ mode: "standalone" })
    expect(p.exists("a.print.html")).toBe(false)
    expect(p.exists("pixel.png")).toBe(false)
  })
})

describe("text written inside a page", () => {
  it("cannot end the element that carries it", () => {
    expect(styleText("a{} </STYLE><script>x</script> <!-- b")).toBe(
      "a{} <\\/STYLE><script>x</script> <\\!-- b",
    )
    expect(scriptText('let s = "</Script>"', "runtime")).toBe(
      'let s = "<\\/Script>"',
    )
    // `<!--` has no spelling that reads the same in every script context,
    // so a script holding one is refused rather than altered.
    expect(() => scriptText("let s = '<!--'", "runtime")).toThrow(
      "cudoc-export: runtime contains <!--, which a page cannot carry inline",
    )
  })
})

describe("a site's stylesheets", () => {
  it("links each file after the built-in one and copies what it loads by content", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "one/theme.css": '.a { background: url("pattern.png") }',
      "one/pattern.png": PNG,
      "two/theme.css":
        '.b { background: url("../one/pattern.png") } .c { background: url(https://cdn.example/x.png) }',
    })
    const result = p.build({
      css: [p.at("one/theme.css"), p.at("two/theme.css")],
    })
    const head = parse(p.read("a.html"))
      .querySelectorAll("link[rel=stylesheet]")
      .map((link) => link.getAttribute("href"))
    expect(head).toEqual([
      "cudoc.css",
      "cudoc-css/1-theme.css",
      "cudoc-css/2-theme.css",
    ])
    const copies = p
      .listing()
      .filter((file) => file.startsWith("cudoc-css/files/"))
    expect(copies).toHaveLength(1)
    expect(p.read("cudoc-css/1-theme.css")).toBe(
      `.a { background: url("${copies[0]!.replace("cudoc-css/", "")}") }`,
    )
    // A site may load from another host; only a single page has to carry it.
    expect(p.read("cudoc-css/2-theme.css")).toContain(
      "url(https://cdn.example/x.png)",
    )
    expect(result.files).toContain("cudoc-css/2-theme.css")
  })

  it("refuses a file outside the roots, the asset folders and the stylesheet's folder, and a private document", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/secret.md": doc("Secret"),
      "theme/brand.css": '.a { background: url("../elsewhere/x.png") }',
      "theme/leak.css": '.a { background: url("../docs/secret.md") }',
      "elsewhere/x.png": PNG,
    })
    expect(() => p.build({ css: [p.at("theme/brand.css")] })).toThrow(
      /outside the collection roots, the asset directories and the stylesheet's own folder/,
    )
    expect(() =>
      p.build({ css: [p.at("theme/leak.css")], private: ["secret.md"] }),
    ).toThrow(/loads the private document secret\.md as a resource/)
  })

  it("refuses the same files on a single page, from a stylesheet and from a document's own styles", () => {
    // A single page writes these files into itself, so a path that leaves
    // the roots would carry a file from anywhere on the disk.
    const p = project({
      "docs/a.md": doc("A"),
      "docs/styled.md": doc(
        "Styled",
        '<p style="background: url(../elsewhere/x.png)">styled</p>',
      ),
      "docs/sheet.md": doc(
        "Sheet",
        "<style>.x { background: url(../elsewhere/x.png) }</style>",
      ),
      "theme/brand.css": '.a { background: url("../elsewhere/x.png") }',
      "elsewhere/x.png": PNG,
    })
    expect(() =>
      p.build({
        mode: "standalone",
        documents: ["a"],
        css: [p.at("theme/brand.css")],
      }),
    ).toThrow(
      /outside the collection roots, the asset directories and the stylesheet's own folder/,
    )
    for (const id of ["styled", "sheet"])
      expect(() => p.build({ mode: "standalone", documents: [id] })).toThrow(
        new RegExp(
          `${id} styles with \\.\\./elsewhere/x\\.png, which is outside the collection roots and asset directories`,
        ),
      )
  })
})

describe("links to files outside the output", () => {
  it("points a file the collection leaves out at the repository, and a mounted one at its copy", () => {
    const p = project({
      "docs/guide.md": doc(
        "Guide",
        "[Source](../src/main.ts#L3) [Folder](../src/) [Sample](../samples/out/index.html) [Missing](../src/none.ts)",
      ),
      "src/main.ts": "export {}",
      "samples/out/index.html": "<p>sample</p>",
      "samples/out/deep/page.html": "<p>deep</p>",
    })
    const options = {
      sourceLinks: {
        root: p.root,
        url: "https://github.com/owner/repo/blob/abc123",
      },
      mounts: [{ from: p.at("samples/out"), to: "samples" }],
    }
    // The docs root is `docs`, so its library starts there; sourceLinks
    // names the directory the library's paths are spelled from.
    const q = {
      ...p,
      build: (extra: Partial<SiteOptions> = {}) =>
        buildSite({
          roots: [{ dir: p.at("docs"), base: "docs" }],
          outDir: p.outDir,
          title: "Demo",
          ...extra,
        }),
    }
    expect(() => q.build(options)).toThrow(
      /missing local target \.\.\/src\/none\.ts/,
    )
    fs.writeFileSync(p.at("src/none.ts"), "")
    q.build(options)
    const links = parse(p.read("docs/guide.html"))
      .querySelectorAll("main a")
      .map((a) => a.getAttribute("href"))
    expect(links).toEqual([
      "https://github.com/owner/repo/blob/abc123/src/main.ts#L3",
      "https://github.com/owner/repo/blob/abc123/src/",
      "../samples/index.html",
      "https://github.com/owner/repo/blob/abc123/src/none.ts",
    ])
    expect(p.read("samples/deep/page.html")).toBe("<p>deep</p>")
  })

  it.each([
    [
      "a mount reaching into the output",
      (root: string) => ({ from: path.join(root, "out"), to: "x" }),
      /overlaps source, library, asset or mounted directory/,
    ],
    [
      "a mount leaving the output",
      (root: string) => ({ from: path.join(root, "samples"), to: "../x" }),
      /must be a folder path inside the output/,
    ],
    // Over a root it would publish what the navigation leaves out.
    [
      "a mount of a collection root",
      (root: string) => ({ from: path.join(root, "docs"), to: "src" }),
      /overlaps a source, library or asset directory/,
    ],
    [
      "a mount of a folder inside a root",
      (root: string) => ({ from: path.join(root, "docs/media"), to: "media" }),
      /overlaps a source, library or asset directory/,
    ],
    [
      "a mount around a root",
      (root: string) => ({ from: root, to: "everything" }),
      /overlaps/,
    ],
  ])("refuses %s", (_, mount, message) => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/media/pic.png": PNG,
      "samples/x.txt": "x",
    })
    fs.mkdirSync(p.outDir, { recursive: true })
    expect(() =>
      p.build({ navigation: ["a.md"], mounts: [mount(p.root)] }),
    ).toThrow(message)
  })

  it("refuses two mounts that share files or a destination", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "samples/x.txt": "x",
      "samples/deep/y.txt": "y",
      "other/z.txt": "z",
    })
    expect(() =>
      p.build({
        mounts: [
          { from: p.at("samples"), to: "s" },
          { from: p.at("samples/deep"), to: "d" },
        ],
      }),
    ).toThrow(/overlap/)
    expect(() =>
      p.build({
        mounts: [
          { from: p.at("samples"), to: "s" },
          { from: p.at("other"), to: "s/other" },
        ],
      }),
    ).toThrow(/overlap/)
  })

  it("refuses a symbolic link or a private document inside a mount", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/secret.md": doc("S"),
      "samples/x.txt": "x",
    })
    fs.symlinkSync(p.at("samples/x.txt"), p.at("samples/link.txt"))
    expect(() =>
      p.build({ mounts: [{ from: p.at("samples"), to: "samples" }] }),
    ).toThrow(/symlink in mounted directory/)
    fs.rmSync(p.at("samples/link.txt"))
    fs.linkSync(p.at("docs/secret.md"), p.at("samples/copy.md"))
    expect(() =>
      p.build({
        private: ["secret.md"],
        mounts: [{ from: p.at("samples"), to: "samples" }],
      }),
    ).toThrow(/loads the private document secret\.md/)
  })
})
