/**
 * The site's structure: what the navigation lists and publishes, the home
 * page, the languages, and that every format reads the same plan.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse } from "node-html-parser"
import {
  buildSite,
  buildExport,
  siteStyles,
  type SiteOptions,
} from "../src/index.js"
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

/** One block of the stylesheet, from its start to its closing brace. */
function block(start: string) {
  const from = siteStyles.indexOf(start)
  expect(from, start).toBeGreaterThan(-1)
  let depth = 0
  for (let i = siteStyles.indexOf("{", from); i < siteStyles.length; i++)
    if (siteStyles[i] === "{") depth++
    else if (siteStyles[i] === "}" && --depth === 0)
      return { from, text: siteStyles.slice(from, i + 1) }
  throw new Error(`${start} is not closed`)
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

  it("draws groups down to depth and lists what lies deeper among them, by title", () => {
    const p = project({
      "docs/guides/setup.md": doc("Setup"),
      "docs/guides/advanced.md": doc("Advanced"),
      "docs/guides/advanced/tuning.md": doc("Tuning"),
      "docs/guides/advanced/deep/limits.md": doc("Limits"),
    })
    p.build({ navigation: [{ folder: "guides", depth: 1 }] })
    expect(p.sidebar("guides/setup.html")).toEqual([
      "guides/",
      // No `advanced/` group: its page and everything below it join the
      // folder's list, sorted with the rest.
      "  Advanced advanced.html",
      "  Limits advanced/deep/limits.html",
      "  Setup setup.html *",
      "  Tuning advanced/tuning.html",
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

  it("counts an exclude as matching a document an entry already took", () => {
    const p = project({ "docs/f/a.md": doc("A"), "docs/f/b.md": doc("B") })
    const result = p.build({
      navigation: ["f/a.md", { folder: "f", exclude: ["a.md"] }],
    })
    expect(result.diagnostics).toEqual([])
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
      "docs/README.md": doc("Project", "[Guide](guide.md)\n\n## Start\n\nx"),
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
    // The home document lists its contents like any other page.
    const home = parse(p.read("index.html"))
    expect(home.querySelector(".layout")!.getAttribute("class")).toBe(
      "layout home",
    )
    expect(home.querySelectorAll(".toc li").map((li) => li.text)).toEqual([
      "Start",
    ])
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

  it("gives each language's landing page a menu of the other languages' homes", () => {
    const p = project({ "docs/a.md": doc("A"), "docs/a.ko.md": doc("가") })
    p.build({ locales: { en: "English", ko: "한국어" } })
    const menu = (file: string) =>
      parse(p.read(file))
        .querySelectorAll("nav.languages li > *")
        .map((item) => [item.text, item.getAttribute("href") ?? "current"])
    expect(menu("index.html")).toEqual([
      ["English", "current"],
      ["한국어", "index.ko.html"],
    ])
    expect(menu("index.ko.html")).toEqual([
      ["English", "index.html"],
      ["한국어", "current"],
    ])
  })

  it("generates a landing page when no document is the home", () => {
    const p = project({ "docs/a.md": doc("A") })
    p.build()
    expect(p.read("index.html")).toContain(
      '<main id="main-content" class="landing">',
    )
    // Its list is the body, which takes the whole width without a sidebar.
    expect(p.read("index.html")).toContain('class="layout home no-toc no-nav"')
    expect(p.read("a.html")).toContain('class="layout no-toc"')
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
    // A menu whose summary names the page's language and opens the others.
    expect(
      korean.querySelector(".languages details.menu > summary")!.text,
    ).toBe("한국어")
    expect(
      korean.querySelector(".languages summary")!.getAttribute("aria-label"),
    ).toBe("언어: 한국어")
    expect(
      korean
        .querySelectorAll(".languages .menu-list li > *")
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
    const p = project({
      "docs/a.md": doc("A"),
      "docs/a.ja.md": doc("エー", "## 一\n\nx"),
    })
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
  it.each([
    [{ home: "nothing.md" }, /home names no document: nothing\.md/],
    [
      { home: "secret.md", private: ["secret.md"] },
      /home secret\.md is private/,
    ],
    [
      { volume: { order: ["a.md", "a.md"] } },
      /volume\.order names a\.md twice/,
    ],
    [
      { mode: "annotate" as const, annotate: { reviewId: "has space" } },
      /annotate\.reviewId is up to 64 letters/,
    ],
    [
      { mode: "annotate" as const, annotate: { target: "hosted" as const } },
      /annotate\.target "hosted" needs annotate\.reviewId/,
    ],
    [
      {
        mode: "annotate" as const,
        annotate: { inbox: { github: { repo: "o/r", template: "t.yml" } } },
      },
      /annotate\.inbox applies to target "hosted"/,
    ],
    [
      { header: { links: [{ title: "X", url: "/relative" }] } },
      /header\.links is a list/,
    ],
    [
      { header: { links: [{ title: "", url: "https://x/" }] } },
      /header\.links is a list/,
    ],
    [
      { header: { links: [{ title: { en: "X" }, url: "https://x/" }] } },
      /header\.links\[0\]: a title per language needs locales/,
    ],
    [
      {
        locales: { en: "English" },
        header: {
          links: [{ title: { en: "X", ko: "엑스" }, url: "https://x/" }],
        },
      },
      /header\.links\[0\]: title names ko, which locales does not/,
    ],
    [
      { sourceLinks: { root: ".", url: "ftp://x/" } },
      /sourceLinks\.url is an absolute http\(s\) URL/,
    ],
    [{ mounts: [{ from: "nowhere" }] }, /each mount is \{ from, to \}/],
  ])("refuses %j", (options, message) => {
    const p = project({ "docs/a.md": doc("A"), "docs/secret.md": doc("S") })
    expect(() => p.build(options as Partial<SiteOptions>)).toThrow(message)
  })

  it("draws header links, honours toc settings and refuses an unknown or retired option", () => {
    const p = project({
      "docs/a.md": doc("A", "## One\n\nx\n\n### Two\n\ny\n\n#### Three\n\nz"),
      "docs/b.md": "---\ntoc: false\n---\n# B\n\n## Hidden\n\nx\n",
      "docs/c.md": doc("C", "No headings below the title."),
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
    // A page with no heading to list draws no empty contents column.
    expect(p.read("c.html")).not.toContain('class="toc"')
    expect(p.read("c.html")).toContain('class="layout no-toc"')
    expect(() => p.build({ navgation: ["a.md"] } as never)).toThrow(
      /unknown option navgation/,
    )
    // What only buildExport hands the builder is no option of buildSite.
    for (const key of ["afterStaging", "printOutputs"])
      expect(() => p.build({ [key]: true } as never)).toThrow(
        new RegExp(`unknown option ${key}`),
      )
  })

  it("opens the sidebar on a narrow screen from a checkbox and its label, without a script", () => {
    const p = project({
      "docs/a.md": doc("A"),
      "docs/b.md": doc("B"),
      "docs/a.ko.md": doc("가"),
    })
    p.build({ locales: { en: "English", ko: "한국어" } })
    const html = p.read("a.html")
    // The checkbox before the header, so the stylesheet reaches the sidebar
    // from it; the label, named like the sidebar, first in the header.
    expect(html).toContain(
      '</a><input type="checkbox" id="cudoc-nav-toggle" class="cudoc-nav-toggle" hidden><header><label for="cudoc-nav-toggle" class="nav-toggle"><svg',
    )
    expect(parse(html).querySelector("header label.nav-toggle")!.text).toBe(
      "Documents",
    )
    expect(
      parse(p.read("a.ko.html")).querySelector("label.nav-toggle")!.text,
    ).toBe("문서")
    expect(html).not.toContain("<script")
    expect(siteStyles).toContain(
      ".cudoc-nav-toggle:checked ~ .layout > .sidebar {\n    display: block;\n  }",
    )
    // A sidebar left open does not print: the print block, later in the
    // stylesheet, hides it at the same specificity.
    expect(siteStyles.slice(siteStyles.indexOf("@media print"))).toContain(
      "  header,\n  .sidebar,\n  .cudoc-nav-toggle:checked ~ .layout > .sidebar,\n  .toc,\n  .skip {\n    display: none;\n  }",
    )
    // A generated landing page lists the navigation in its body, a single
    // page has none, and the print HTML draws no header: nothing to open.
    expect(p.read("index.html")).not.toContain('id="cudoc-nav-toggle"')
    expect(p.read("a.print.html")).not.toContain('id="cudoc-nav-toggle"')
    p.build({ mode: "standalone" })
    expect(p.read("a.html")).not.toContain('id="cudoc-nav-toggle"')
  })

  it("makes the sidebar part of the page on a narrow screen, so a swipe on it scrolls the page", () => {
    // Beside a wide page the sidebar and the contents stay put and scroll
    // inside themselves.
    const wide = block(".sidebar,\n.toc {")
    expect(wide.text).toContain("  position: sticky;\n")
    expect(wide.text).toContain("  overflow-y: auto;\n")
    // The contents leave at 1024px, so at a phone's width the sidebar is the
    // one such box left.
    expect(block("@media (max-width: 1024px) {").text).toContain(
      "  .toc {\n    display: none;\n  }",
    )
    // There, later in the stylesheet at the same specificity, the sidebar is
    // no box of its own: nothing clips it, so a long word has to wrap.
    const narrow = block("@media (max-width: 768px) {")
    expect(narrow.from).toBeGreaterThan(wide.from)
    const sidebar = narrow.text.match(/\n {2}\.sidebar \{[^{}]*\}/)?.[0] ?? ""
    expect(sidebar).toContain("\n    overflow: visible;\n")
    expect(sidebar).toContain("\n    overflow-wrap: anywhere;\n")
    // No other rule there, the one that opens it included, makes it a
    // scroll box again.
    const rules = [...narrow.text.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({ selector: selector!.trim(), body }))
      .filter(({ selector }) => selector.includes(".sidebar"))
    expect(rules.map(({ selector }) => selector)).toContain(
      ".cudoc-nav-toggle:checked ~ .layout > .sidebar",
    )
    for (const { selector, body } of rules)
      expect(body, selector).not.toMatch(/overflow(-[xy])?:(?!\s*visible)/)
  })

  it("lets a gesture on the sidebar or the contents go on to the page once they have nothing to scroll", () => {
    // Neither contains its overscroll at any width: one with nothing left to
    // scroll, short or at its end, would take a wheel or a swipe and move
    // nothing. A table's sideways containment is the only one left.
    const declarations = siteStyles.match(
      /^\s*overscroll-behavior[\w-]*:[^;]+;/gm,
    )
    expect(declarations?.map((line) => line.trim())).toEqual([
      "overscroll-behavior-x: contain;",
    ])
    expect(block("\ntable {").text).toContain(
      "  overscroll-behavior-x: contain;\n",
    )
  })

  it("keeps the contents on the page under every policy that keeps links", () => {
    const p = project({ "docs/a.md": doc("A", "## One\n\n[Up](#one)") })
    p.build({ links: "host", hostUrl: "https://docs.example.com/" })
    const hosted = parse(p.read("a.html"))
    expect(hosted.querySelector(".toc a")!.getAttribute("href")).toBe("#one")
    // An authored fragment link still names the deployed page.
    expect(hosted.querySelector("main a")!.getAttribute("href")).toBe(
      "https://docs.example.com/a#one",
    )
    expect(p.read("a.html")).not.toContain("data-cudoc-final")
    p.build({ links: "none" })
    expect(parse(p.read("a.html")).querySelector(".toc a")).toBeNull()
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

describe("page metadata", () => {
  const files = {
    "docs/README.md": doc("Project", "The project in one line."),
    "docs/README.ko.md": doc("프로젝트", "한 줄 소개입니다."),
    "docs/guide.md":
      "---\ndescription: Set the SDK up & running.\n---\n\n# Guide\n\nBody.\n",
    "docs/extra.md": doc("Extra"),
  }
  const locales = { en: "English", ko: "한국어" }
  const head = (html: string) => parse(html).querySelector("head")!

  it("describes each page and, with siteUrl, names its address, its translations and a sitemap", () => {
    const p = project(files)
    p.build({
      home: "README.md",
      locales,
      siteUrl: "https://docs.example.com/project",
    })
    const guide = head(p.read("guide.html"))
    expect(
      guide.querySelector('meta[name="description"]')!.getAttribute("content"),
    ).toBe("Set the SDK up & running.")
    expect(
      guide.querySelector('link[rel="canonical"]')!.getAttribute("href"),
    ).toBe("https://docs.example.com/project/guide.html")
    // A page without a translation names no alternates.
    expect(guide.querySelectorAll('link[rel="alternate"]')).toHaveLength(0)
    const home = head(p.read("index.ko.html"))
    expect(
      home
        .querySelectorAll('link[rel="alternate"]')
        .map((link) => [
          link.getAttribute("hreflang"),
          link.getAttribute("href"),
        ]),
    ).toEqual([
      ["en", "https://docs.example.com/project/index.html"],
      ["ko", "https://docs.example.com/project/index.ko.html"],
    ])
    expect(
      home.querySelector('meta[name="description"]')!.getAttribute("content"),
    ).toBe("한 줄 소개입니다.")
    expect(p.read("sitemap.xml")).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        // In the order the pages were written.
        ...["extra.html", "guide.html", "index.ko.html", "index.html"].map(
          (file) =>
            `<url><loc>https://docs.example.com/project/${file}</loc></url>`,
        ),
        "</urlset>",
        "",
      ].join("\n"),
    )
  })

  it("keeps a linked file from taking the sitemap's name", () => {
    const p = project({
      "docs/a.md": doc("A", "[map](./sitemap.xml)"),
      "docs/sitemap.xml": "<urlset/>",
    })
    for (const options of [{ siteUrl: "https://docs.example.com/" }, {}])
      expect(() => p.build(options)).toThrow(
        /asset collides with generated output: sitemap\.xml/,
      )
  })

  it("writes a page's address percent-encoded", () => {
    // A URL keeps a `%` as it is, which would read as the start of an escape.
    const p = project({ "docs/100%.md": doc("Fully") })
    p.build({ siteUrl: "https://docs.example.com/" })
    expect(
      head(p.read("100%.html"))
        .querySelector('link[rel="canonical"]')!
        .getAttribute("href"),
    ).toBe("https://docs.example.com/100%25.html")
  })

  it("names no address without siteUrl or outside a site", () => {
    const p = project(files)
    p.build({ home: "README.md", locales })
    expect(
      head(p.read("guide.html")).querySelector('link[rel="canonical"]'),
    ).toBeNull()
    expect(p.exists("sitemap.xml")).toBe(false)
    // A single page or a review page has no address of its own to name.
    expect(() =>
      p.build({ mode: "standalone", siteUrl: "https://docs.example.com/" }),
    ).toThrow('siteUrl applies to mode: "site"')
  })

  it("rejects a siteUrl that is not an HTTP(S) address", () => {
    const p = project(files)
    expect(() => p.build({ siteUrl: "docs.example.com" })).toThrow("siteUrl")
    expect(() => p.build({ siteUrl: "https://docs.example.com/?a=1" })).toThrow(
      "siteUrl",
    )
  })
})
