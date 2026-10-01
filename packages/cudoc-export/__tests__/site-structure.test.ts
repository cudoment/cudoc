/**
 * The site's structure: what the navigation lists and publishes, the home
 * page, the languages, and that every format reads the same plan.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse } from "node-html-parser"
import { buildSite, buildExport, type SiteOptions } from "../src/index.js"
import { VOLUME_FILE, volumeId } from "../src/print.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

/** A collection from a map of files, and a build of it. */
function project(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-structure-"))
  roots.push(root)
  const sourceRoot = path.join(root, "docs")
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  fs.mkdirSync(sourceRoot, { recursive: true })
  const outDir = path.join(root, "site")
  return {
    root,
    outDir,
    build: (options: Partial<SiteOptions> = {}) =>
      buildSite({ sourceRoot, outDir, title: "Demo", ...options }),
    read: (file: string) => fs.readFileSync(path.join(outDir, file), "utf8"),
    exists: (file: string) => fs.existsSync(path.join(outDir, file)),
    /** The sidebar as indented text: groups end with `/`, links with their href. */
    sidebar: (file: string) => {
      const html = parse(fs.readFileSync(path.join(outDir, file), "utf8"))
      const lines: string[] = []
      const walk = (
        list: ReturnType<typeof html.querySelector>,
        depth: number,
      ) => {
        for (const item of list!.childNodes) {
          if (
            !("tagName" in item) ||
            (item as { tagName: string }).tagName !== "LI"
          )
            continue
          const li = item as unknown as ReturnType<typeof html.querySelector>
          const group = li!.querySelector(":scope > details")
          const pad = "  ".repeat(depth)
          if (group) {
            const summary = group.querySelector("summary")!
            const link = summary.querySelector("a")
            lines.push(
              `${pad}${summary.text}/${link ? ` ${link.getAttribute("href")}` : ""}${group.hasAttribute("open") ? "" : " (closed)"}`,
            )
            walk(group.querySelector(":scope > ul"), depth + 1)
          } else {
            const a = li!.querySelector("a")!
            lines.push(
              `${pad}${a.text} ${a.getAttribute("href")}${a.getAttribute("aria-current") ? " *" : ""}`,
            )
          }
        }
      }
      walk(html.querySelector("nav.sidebar > ul"), 0)
      return lines
    },
  }
}

const doc = (title: string, body = "Text.") => `# ${title}\n\n${body}\n`

describe("the navigation", () => {
  it("lists the whole collection by folder when none is given, index first", () => {
    const p = project({
      "docs/index.md": doc("Home"),
      "docs/zebra.md": doc("Zebra"),
      "docs/apple.md": doc("Apple"),
      "docs/guides/setup.md": doc("Setup"),
      "docs/guides/basics.md": doc("Basics"),
      "docs/guides/advanced.md": doc("Advanced"),
      "docs/guides/advanced/tuning.md": doc("Tuning"),
      "docs/reference/index.md": doc("Reference"),
      "docs/reference/api.md": doc("API"),
    })
    p.build()
    expect(p.sidebar("apple.html")).toEqual([
      "Home index.html",
      "Apple apple.html *",
      // A folder no page stands for keeps its own name as a group.
      "guides/",
      // `advanced.md` stands for the folder beside it.
      "  Advanced/ guides/advanced.html",
      "    Tuning guides/advanced/tuning.html",
      "  Basics guides/basics.html",
      "  Setup guides/setup.html",
      // `index.md` stands for its own folder.
      "Reference/ reference/index.html",
      "  API reference/api.html",
      "Zebra zebra.html",
    ])
  })

  it("takes a folder as everything in it, a file as itself, and excludes what a folder names", () => {
    const p = project({
      "docs/index.md": doc("Home"),
      "docs/guides/intro.md": doc("Intro"),
      "docs/guides/zeta.md": doc("Zeta"),
      "docs/guides/draft.md": doc("Draft"),
      "docs/guides/old/legacy.md": doc("Legacy"),
      "docs/legal/privacy.md": doc("Privacy"),
      "nav.yml": [
        "items:",
        "  - index.md",
        "  - folder: guides",
        "    title: Guides",
        "    exclude: [draft.md, old/]",
        "    order: [zeta, ...]",
        "  - title: Elsewhere",
        "    url: https://example.com/",
        "hidden:",
        "  - legal/privacy.md",
        "",
      ].join("\n"),
    })
    const result = p.build({ navigation: path.join(p.root, "nav.yml") })
    expect(p.sidebar("index.html")).toEqual([
      "Home index.html *",
      "Guides/",
      "  Zeta guides/zeta.html",
      "  Intro guides/intro.html",
      "Elsewhere https://example.com/",
    ])
    expect(p.exists("legal/privacy.html")).toBe(true)
    expect(p.exists("guides/draft.html")).toBe(false)
    expect(p.exists("guides/old/legacy.html")).toBe(false)
    expect(result.omitted).toEqual([
      { document: "guides/draft", reason: "not-in-navigation" },
      { document: "guides/old/legacy", reason: "not-in-navigation" },
    ])
  })

  it("lets an explicit entry win over the folder that would bring it in", () => {
    const p = project({
      "docs/api/README.md": doc("API overview"),
      "docs/api/alpha.md": doc("Alpha"),
      "docs/api/beta.md": doc("Beta"),
    })
    p.build({
      navigation: [
        "api/beta.md",
        { folder: "api", title: "API", page: "README.md", collapsed: true },
      ],
    })
    expect(p.sidebar("api/alpha.html")).toEqual([
      "Beta beta.html",
      "API/ README.html",
      "  Alpha alpha.html *",
    ])
    // Collapsed, unless it holds the current page.
    expect(p.sidebar("api/beta.html")).toEqual([
      "Beta beta.html *",
      "API/ README.html (closed)",
      "  Alpha alpha.html",
    ])
  })

  it("never takes a README for a folder's page unless page names it", () => {
    const p = project({
      "docs/api/README.md": doc("API overview"),
      "docs/api/alpha.md": doc("Alpha"),
    })
    p.build({ navigation: ["api"] })
    expect(p.sidebar("api/alpha.html")).toEqual([
      "api/",
      "  Alpha alpha.html *",
      "  API overview README.html",
    ])
  })

  it("keeps a listed group's order as written", () => {
    const p = project({
      "docs/b.md": doc("B"),
      "docs/a.md": doc("A"),
    })
    p.build({ navigation: [{ title: "Group", items: ["b.md", "a.md"] }] })
    expect(p.sidebar("a.html")).toEqual([
      "Group/",
      "  B b.html",
      "  A a.html *",
    ])
  })

  it.each([
    [["a.md", "a.md"], /a is listed twice/],
    [["missing.md"], /no document missing\.md/],
    [["a"], /a names no folder; for the document, write a\.md/],
    [["nowhere"], /no folder nowhere/],
    [
      [{ folder: "f", exclude: ["*.md"] }],
      /has no document left to list after exclude/,
    ],
    [["secret.md"], /secret\.md is private/],
    [[{ title: "x" }], /a navigation entry is a path/],
    [[{ folder: "f", sort: true }], /unknown key sort/],
    [
      [{ title: "x", url: "javascript:alert(1)" }],
      /url is an absolute http\(s\) or mailto address/,
    ],
    [
      [{ title: { en: "x" }, items: ["a.md"] }],
      /a title per language needs locales/,
    ],
  ])("refuses %j", (navigation, message) => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/f/b.md": doc("B"),
      "docs/secret.md": doc("Secret"),
    })
    expect(() =>
      p.build({
        private: ["secret.md"],
        navigation: navigation as SiteOptions["navigation"],
      }),
    ).toThrow(message)
    expect(p.exists("a.html")).toBe(false)
  })

  it("names the line of a YAML file in its errors", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "nav.yml": "items:\n  - a.md\n  - title: Nothing\n    items: []\n",
    })
    const file = path.join(p.root, "nav.yml")
    expect(() => p.build({ navigation: file })).toThrow(
      `${file}:3: items lists at least one entry`,
    )
    fs.writeFileSync(file, "items:\n  - a.md\n  - a.md\n")
    expect(() => p.build({ navigation: file })).toThrow(
      `${file}:3: a is listed twice, also at ${file}:2`,
    )
  })

  it("reports order and exclude entries that match nothing", () => {
    const p = project({ "docs/f/a.md": doc("A") })
    const result = p.build({
      navigation: [
        { folder: "f", order: ["nothing", "..."], exclude: ["none.md"] },
      ],
    })
    expect(result.diagnostics.map((d) => d.code).sort()).toEqual([
      "unmatched-navigation-exclude",
      "unmatched-navigation-order",
    ])
  })

  it("refuses a link to a document the navigation leaves out, and names the way out", () => {
    const p = project({
      "docs/a.md": doc("A", "[B](b.md)"),
      "docs/b.md": doc("B"),
    })
    expect(() => p.build({ navigation: ["a.md"] })).toThrow(
      /a links to b\.md, which the site does not publish because the navigation does not list it; add it to the navigation or to hidden/,
    )
    expect(() =>
      p.build({ navigation: { items: ["a.md"], hidden: ["b.md"] } }),
    ).not.toThrow()
    // On the host, the page exists all the same.
    expect(() =>
      p.build({
        navigation: ["a.md"],
        links: "host",
        hostUrl: "https://docs.example.com/",
      }),
    ).not.toThrow()
  })

  it("is what every format publishes, the volume in navigation order", async () => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/b.md": doc("B"),
      "docs/c.md": doc("C"),
    })
    const result = await buildExport({
      sourceRoot: path.join(p.root, "docs"),
      outDir: p.outDir,
      navigation: ["c.md", "a.md"],
      formats: ["html", "docx"],
      granularity: "both",
    })
    expect(result.files.docx.sort()).toEqual([
      "a.docx",
      "c.docx",
      "volume.docx",
    ])
    expect(p.exists("b.html")).toBe(false)
    const volume = parse(p.read(VOLUME_FILE))
    expect(
      volume
        .querySelectorAll("article.cudoc-doc")
        .map((a) => a.getAttribute("id")),
    ).toEqual([volumeId("c"), volumeId("a")])
    // volume.order reorders the members and adds none.
    await buildExport({
      sourceRoot: path.join(p.root, "docs"),
      outDir: p.outDir,
      navigation: ["c.md", "a.md"],
      volume: { order: ["a.md"] },
    })
    expect(
      parse(p.read(VOLUME_FILE))
        .querySelectorAll("article.cudoc-doc")
        .map((a) => a.getAttribute("id")),
    ).toEqual([volumeId("a"), volumeId("c")])
    await expect(
      buildExport({
        sourceRoot: path.join(p.root, "docs"),
        outDir: p.outDir,
        navigation: ["c.md", "a.md"],
        volume: { order: ["b.md"] },
      }),
    ).rejects.toThrow(
      /volume.order names b\.md, which is not one of the volume's documents/,
    )
  })
})

describe("the home page", () => {
  it("writes the home document as index.html and points every link at it", () => {
    const p = project({
      "docs/README.md": doc("Project", "[Guide](guide.md)"),
      "docs/guide.md": doc("Guide", "[Back](README.md)"),
    })
    p.build({ home: "README.md" })
    expect(p.exists("index.html")).toBe(true)
    expect(p.exists("README.html")).toBe(false)
    const guide = parse(p.read("guide.html"))
    expect(guide.querySelector("main a")!.getAttribute("href")).toBe(
      "index.html",
    )
    expect(guide.querySelector("header a")!.getAttribute("href")).toBe(
      "index.html",
    )
    // The home page has no contents column.
    expect(p.read("index.html")).toContain('class="layout home no-toc"')
  })

  it("refuses a home beside an index.md, which would take the same file", () => {
    const p = project({
      "docs/README.md": doc("Project"),
      "docs/index.md": doc("Index"),
    })
    expect(() => p.build({ home: "README.md" })).toThrow(
      /index\.md would be written to index\.html, which is the site home's file/,
    )
  })

  it("generates a landing page when no document is the home", () => {
    const p = project({ "docs/a.md": doc("A") })
    p.build()
    expect(p.read("index.html")).toContain(
      '<main id="main-content" class="landing">',
    )
  })
})

describe("languages", () => {
  const files = {
    "docs/README.md": doc("Project", "[Guide](guide.md)"),
    "docs/README.ko.md": doc("프로젝트"),
    "docs/guide.md": doc("Guide", "## Setup\n\nSet up."),
    "docs/guide.ko.md": doc("가이드", "## 설정\n\n설정합니다."),
    "docs/extra.md": doc("Extra"),
  }
  const locales = { en: "English", ko: "한국어" }

  it("finds each language by its suffix and draws its own navigation from one list", () => {
    const p = project(files)
    const result = p.build({
      home: "README.md",
      locales,
      navigation: [
        "README.md",
        {
          title: { en: "Guides", ko: "가이드 모음" },
          items: ["guide.md", "extra.md"],
        },
      ],
    })
    expect(p.sidebar("guide.ko.html")).toEqual([
      "프로젝트 index.ko.html",
      "가이드 모음/",
      "  가이드 guide.ko.html *",
    ])
    expect(p.sidebar("guide.html")).toEqual([
      "Project index.html",
      "Guides/",
      "  Guide guide.html *",
      "  Extra extra.html",
    ])
    const korean = parse(p.read("guide.ko.html"))
    expect(korean.querySelector("html")!.getAttribute("lang")).toBe("ko")
    expect(
      korean.querySelector("nav.sidebar")!.getAttribute("aria-label"),
    ).toBe("문서")
    expect(korean.querySelector(".toc .nav-title")!.text).toBe("이 페이지 목차")
    expect(
      korean
        .querySelectorAll(".languages a, .languages span")
        .map((el) => [el.text, el.getAttribute("href") ?? "current"]),
    ).toEqual([
      ["English", "guide.html"],
      ["한국어", "current"],
    ])
    // A page with no translation switches to the other language's home.
    expect(
      parse(p.read("extra.html"))
        .querySelectorAll(".languages a")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["index.ko.html"])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "missing-translation",
        document: "extra",
      }),
    ])
    // The volume is the default language's.
    expect(
      parse(p.read(VOLUME_FILE))
        .querySelectorAll("article.cudoc-doc")
        .map((a) => a.getAttribute("id")),
    ).toEqual([volumeId("README"), volumeId("guide"), volumeId("extra")])
  })

  it("takes the words of a language cudoc does not know from the locale", () => {
    const p = project({ "docs/a.md": doc("A"), "docs/a.ja.md": doc("エー") })
    p.build({
      locales: {
        en: "English",
        ja: { label: "日本語", ui: { documents: "ドキュメント" } },
      },
    })
    const page = parse(p.read("a.ja.html"))
    expect(page.querySelector(".sidebar .nav-title")!.text).toBe("ドキュメント")
    expect(page.querySelector(".toc .nav-title")!.text).toBe("On this page")
  })

  it.each([
    [
      { "en-US": "English", ko: "한국어" },
      { "docs/a.ko.md": "---\nlang: en\n---\n# A\n" },
      /declares lang "en", but its file name makes it ko/,
    ],
    [{ en: "English", "ko!": "x" }, {}, /ko! is not a language code/],
    [
      {
        en: "English",
        ko: { label: "한국어", suffix: ".x" },
        ja: { label: "日本語", suffix: ".x" },
      },
      {},
      /share the suffix \.x/,
    ],
    [
      { en: { label: "English", suffix: ".en" } },
      {},
      /the default language, whose files carry no suffix/,
    ],
  ])("refuses locales %j", (given, extra, message) => {
    const p = project({ "docs/a.md": doc("A"), ...extra })
    expect(() => p.build({ locales: given as SiteOptions["locales"] })).toThrow(
      message,
    )
  })

  it("lets front matter lang refine the language and needs every language's home", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/a.ko.md": "---\nlang: ko-KR\n---\n# 에이\n",
    })
    p.build({ locales })
    expect(
      parse(p.read("a.ko.html")).querySelector("html")!.getAttribute("lang"),
    ).toBe("ko-KR")
    expect(() => p.build({ locales, home: "a.md" })).not.toThrow()
    const q = project({ "docs/a.md": doc("A"), "docs/b.ko.md": doc("비") })
    expect(() => q.build({ locales, home: "a.md" })).toThrow(
      /home a\.md has no ko translation, and every language needs its home/,
    )
  })
})

describe("the rest of the shell", () => {
  it("draws header links, honours toc settings and refuses an unknown or retired option", () => {
    const p = project({
      "docs/a.md": doc("A", "## One\n\nx\n\n### Two\n\ny\n\n#### Three\n\nz"),
      "docs/b.md": "---\ntoc: false\n---\n# B\n\n## Hidden\n\nx\n",
    })
    p.build({
      header: { links: [{ title: "GitHub", url: "https://github.com/" }] },
      toc: { depth: 3 },
    })
    const a = parse(p.read("a.html"))
    expect(a.querySelector(".header-links a")!.getAttribute("href")).toBe(
      "https://github.com/",
    )
    expect(a.querySelectorAll(".toc li").map((li) => li.text)).toEqual([
      "One",
      "Two",
    ])
    expect(p.read("b.html")).not.toContain('class="toc"')
    expect(() => p.build({ navgation: ["a.md"] } as never)).toThrow(
      /unknown option navgation/,
    )
  })

  it("lets no authored link pass as one the shell resolved", () => {
    const p = project({
      "docs/a.md": doc("A", '<a data-cudoc-final href="secret.md">secret</a>'),
      "docs/secret.md": doc("Secret"),
    })
    expect(() => p.build({ private: ["secret.md"] })).toThrow(
      /a links to private document secret/,
    )
  })
})
