import { it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildSite } from "../src/index.js"

it("builds and relocates a complete site with relative links and assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-export-"))
  try {
    const sourceRoot = path.join(root, "docs"),
      outDir = path.join(root, "site")
    fs.mkdirSync(path.join(sourceRoot, "guide"), { recursive: true })
    fs.writeFileSync(
      path.join(sourceRoot, "index.md"),
      "# Home\n\n[Guide](guide/setup.md)\n\n```cudoc-embed\nsources: [guide/setup.md#install]\n```",
    )
    fs.writeFileSync(
      path.join(sourceRoot, "guide/setup.md"),
      "# Setup\n\n## Install (#install)\n\n> [!WARNING] Read first\n> Body\n\n![Image](<../local image.svg>)\n\n[Home](../index.md)\n\n```js\nconst value = 1\n```",
    )
    fs.writeFileSync(
      path.join(sourceRoot, "local image.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>',
    )
    expect(
      buildSite({ sourceRoot, outDir, title: "Example" }).documentCount,
    ).toBe(2)
    const moved = path.join(root, "shared")
    fs.renameSync(outDir, moved)
    const html = fs.readFileSync(path.join(moved, "guide/setup.html"), "utf8")
    expect(html).toContain('href="../index.html"')
    expect(html).toContain('src="../local image.svg"')
    expect(html).toContain('data-callout="warning"')
    expect(html).toContain('class="hljs-keyword"')
    expect(fs.existsSync(path.join(moved, "local image.svg"))).toBe(true)
    expect(html).not.toContain("<script")
    expect(fs.readFileSync(path.join(moved, "index.html"), "utf8")).toContain(
      'id="embed-1-1-install"',
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

import { afterEach } from "vitest"
import { parse } from "node-html-parser"
import {
  buildDocuments,
  buildDocumentsAsync,
} from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import { compileDocument } from "@cudoment/cudoc/markdown"

const temporary: string[] = []
afterEach(() =>
  temporary
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
)
const project = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-export-links-"))
  temporary.push(root)
  const sourceRoot = path.join(root, "docs"),
    library = path.join(root, "library")
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(sourceRoot, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
  }
  return { root, sourceRoot, library, outDir: path.join(root, "site") }
}

it("links to deployed host routes, preserves queries/fragments and copies public images", () => {
  const p = project({
    "index.md":
      "# Home\n\n## Overview (#overview)\n\n[Markdown](guide/reference.md?view=full#limits) [Native](/docs/custom?lang=en#limits) [Base](/project/docs/custom#limits) [Local](#overview) [External](https://external.test/page) [Mail](mailto:docs@example.com)\n\n![Public](/project/img/icon.svg)",
    "guide/reference.md":
      "# Reference\n\n## Limits (#limits)\n\n[Parent](../index.md#overview)",
  })
  const assetDir = path.join(p.root, "public")
  fs.mkdirSync(path.join(assetDir, "img"), { recursive: true })
  fs.writeFileSync(
    path.join(assetDir, "img/icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  )
  buildDocuments({
    sourceRoot: p.sourceRoot,
    outDir: p.library,
    routes: { index: "/docs/start", "guide/reference": "/docs/custom" },
  })
  const manifest = fs.readFileSync(
    path.join(p.library, "manifest.json"),
    "utf8",
  )
  buildSite({
    sourceRoot: p.sourceRoot,
    library: p.library,
    outDir: p.outDir,
    assetDirs: [assetDir],
    links: "host",
    hostUrl: "https://docs.example.com/project/",
  })
  const html = parse(fs.readFileSync(path.join(p.outDir, "index.html"), "utf8"))
  const hrefs = html.querySelectorAll("a").map((a) => a.getAttribute("href"))
  expect(hrefs).toContain(
    "https://docs.example.com/project/docs/custom?view=full#limits",
  )
  expect(hrefs).toContain(
    "https://docs.example.com/project/docs/custom?lang=en#limits",
  )
  expect(hrefs).toContain("https://docs.example.com/project/docs/custom#limits")
  expect(hrefs).toContain(
    "https://docs.example.com/project/docs/start#overview",
  )
  expect(hrefs).toContain("https://external.test/page")
  expect(hrefs).toContain("mailto:docs@example.com")
  expect(hrefs.some((href) => href?.includes("/project/project/"))).toBe(false)
  expect(html.querySelector("nav.sidebar a")?.getAttribute("href")).toBe(
    "https://docs.example.com/project/docs/custom",
  )
  expect(html.querySelector("img")?.getAttribute("src")).toBe("img/icon.svg")
  expect(fs.existsSync(path.join(p.outDir, "img/icon.svg"))).toBe(true)
  expect(fs.readFileSync(path.join(p.library, "manifest.json"), "utf8")).toBe(
    manifest,
  )
})

it("reuses native async compilation and prepared replacements without changing host output", async () => {
  const p = project({
    "index.mdx":
      "# Home\n\n```cudoc-embed\nsources: [reference.mdx#limits]\nreplace:\n  - find: original\n    replace: adapted\n```\n\n```cudoc-embed\nsources: [reference.mdx]\nselect:\n  depth: 2\nrender:\n  type: table\n```",
    "reference.mdx":
      '# Reference\n\n## Limits [#limits]\n\n<Callout type="warning">The original body.</Callout>\n\n[Home](/docs/home)',
  })
  let compiles = 0
  const library = await buildDocumentsAsync({
    sourceRoot: p.sourceRoot,
    outDir: p.library,
    host: "nextra",
    compilerId: "native-mdx-test",
    routes: { index: "/docs/home", reference: "/docs/reference" },
    syntax: { headingAnchor: "both", callout: "both" },
    async compiler(source, { options }) {
      compiles++
      return compileDocument(source, options)
    },
  })
  await prepareEmbeds(library, p.library)
  const count = compiles,
    manifest = fs.readFileSync(path.join(p.library, "manifest.json"), "utf8")
  buildSite({ sourceRoot: p.sourceRoot, library: p.library, outDir: p.outDir })
  const html = fs.readFileSync(path.join(p.outDir, "index.html"), "utf8")
  expect(html).toContain('data-callout="warning"')
  expect(html).toContain("The adapted body.")
  expect(html).toContain('href="reference.html#limits"')
  expect(html).toContain('href="index.html"')
  expect(html).not.toContain("cudoc-embed<")
  expect(compiles).toBe(count)
  expect(fs.readFileSync(path.join(p.library, "manifest.json"), "utf8")).toBe(
    manifest,
  )
  const hosted = path.join(p.root, "hosted")
  buildSite({
    sourceRoot: p.sourceRoot,
    library: p.library,
    outDir: hosted,
    links: "host",
    hostUrl: "https://docs.example.com/",
  })
  expect(fs.readFileSync(path.join(hosted, "index.html"), "utf8")).toContain(
    'href="https://docs.example.com/docs/reference#limits"',
  )
})

it("removes all hyperlinks including navigation, raw HTML, external links and footnotes while preserving content", () => {
  const p = project({
    "guide.md":
      '# Guide\n\n## Details (#details)\n\n[Missing](missing.md) [External](https://example.com) [Mail](mailto:a@example.com)\n\n<a href="/uncollected" target="_blank"><strong>Raw label</strong></a>\n\n[![Image](image.svg)](/missing)\n\nA footnote[^1].\n\n[^1]: Footnote text.',
    "image.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
  })
  buildSite({ sourceRoot: p.sourceRoot, outDir: p.outDir, links: "none" })
  for (const file of ["guide.html", "index.html"]) {
    const html = parse(fs.readFileSync(path.join(p.outDir, file), "utf8"))
    expect(html.querySelectorAll("a, area[href], [xlink\\:href]")).toHaveLength(
      0,
    )
    expect(
      html.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
    ).toBe("cudoc.css")
    if (file === "guide.html") {
      expect(html.textContent).toContain("Raw label")
      expect(html.textContent).toContain("Footnote text")
      expect(html.querySelector("h2")?.getAttribute("id")).toBe("details")
      expect(html.querySelector("img")?.getAttribute("src")).toBe("image.svg")
    }
  }
})

it("uses custom HTML component renderers and applies the same link policy to their output", () => {
  const p = project({
    "index.mdx": "# Home\n\n<Widget value={dynamicValue} />",
  })
  buildSite({
    sourceRoot: p.sourceRoot,
    outDir: p.outDir,
    links: "none",
    renderOptions: {
      components: {
        Widget: () =>
          '<a href="https://example.com"><strong>Custom value</strong></a>',
      },
    },
  })
  const html = fs.readFileSync(path.join(p.outDir, "index.html"), "utf8")
  expect(html).toContain("<strong>Custom value</strong>")
  expect(parse(html).querySelectorAll("a")).toHaveLength(0)
})

it("preserves trailing-slash routes and already-deployed route prefixes", () => {
  const p = project({
    "index.md": "# Home\n\n[Guide](guide.md?q=1#part)",
    "guide.md": "# Guide\n\n## Part (#part)",
  })
  buildDocuments({
    sourceRoot: p.sourceRoot,
    outDir: p.library,
    routes: { index: "/project/", guide: "/project/custom/" },
  })
  buildSite({
    sourceRoot: p.sourceRoot,
    library: p.library,
    outDir: p.outDir,
    links: "host",
    hostUrl: "https://example.com/project",
  })
  expect(fs.readFileSync(path.join(p.outDir, "index.html"), "utf8")).toContain(
    'href="https://example.com/project/custom/?q=1#part"',
  )
})

it.each(["relative", "host"] as const)(
  "keeps generated navigation independent of overlapping native URLs in %s mode",
  (links) => {
    const p = project({
      "alpha.md": "# Alpha\n\n[Native beta](/alpha.html)",
      "beta.md": "# Beta",
    })
    buildDocuments({
      sourceRoot: p.sourceRoot,
      outDir: p.library,
      routes: { alpha: "/docs/alpha", beta: "/alpha.html" },
    })
    buildSite({
      sourceRoot: p.sourceRoot,
      library: p.library,
      outDir: p.outDir,
      links,
      hostUrl: "https://example.com/project/",
    })
    for (const file of ["alpha.html", "index.html"]) {
      const html = parse(fs.readFileSync(path.join(p.outDir, file), "utf8"))
      expect(html.querySelector("nav a")?.getAttribute("href")).toBe(
        links === "host"
          ? "https://example.com/project/docs/alpha"
          : "alpha.html",
      )
      if (file === "alpha.html")
        expect(html.querySelector("main a")?.getAttribute("href")).toBe(
          links === "host"
            ? "https://example.com/project/alpha.html"
            : "beta.html",
        )
    }
  },
)

it.each([
  { links: "wrong" },
  { links: "host" },
  { links: "host", hostUrl: "javascript:alert(1)" },
  { links: "host", hostUrl: "https://user:password@example.com/" },
  { links: "host", hostUrl: "https://example.com/?query=1" },
])("rejects invalid link settings before publishing: %j", (options) => {
  const p = project({ "index.md": "# Home" })
  expect(() =>
    buildSite({
      sourceRoot: p.sourceRoot,
      outDir: p.outDir,
      ...options,
    } as Parameters<typeof buildSite>[0]),
  ).toThrow(/cudoc-export:/)
  expect(fs.existsSync(p.outDir)).toBe(false)
})

it("protects the shared library and requires prepared data for stored embeds", () => {
  const p = project({
    "index.md": "# Home\n\n```cudoc-embed\nsources: [reference.md]\n```",
    "reference.md": "# Reference",
  })
  buildDocuments({ sourceRoot: p.sourceRoot, outDir: p.library })
  const manifest = fs.readFileSync(
    path.join(p.library, "manifest.json"),
    "utf8",
  )
  expect(() =>
    buildSite({
      sourceRoot: p.sourceRoot,
      library: p.library,
      outDir: p.library,
    }),
  ).toThrow(/overlaps/)
  expect(() =>
    buildSite({
      sourceRoot: p.sourceRoot,
      library: p.library,
      outDir: p.outDir,
    }),
  ).toThrow(/prepared embeds not found/)
  expect(() =>
    buildSite({
      sourceRoot: p.sourceRoot,
      library: p.library,
      outDir: p.outDir,
      syntax: {},
    }),
  ).toThrow(/belong to collection/)
  expect(fs.readFileSync(path.join(p.library, "manifest.json"), "utf8")).toBe(
    manifest,
  )
})

it("exports several roots under their bases, skips private documents and leaves external prefixes alone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-export-roots-"))
  temporary.push(root)
  const write = (name: string, value: string) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
  }
  write(
    "content/ko/guide.md",
    "# Guide (#guide)\n\n[term](/terms/ko/token.md#token) [sdk](/sdk/js/start) [rel](../../terms/ko/token.md)\n\n```cudoc-embed\nsources: [/terms/ko/token.md#token]\n```\n",
  )
  write("content/in/secret.md", "# Secret (#secret)\n\nIn-house.\n")
  write("content/AGENTS.md", "# Not a document\n")
  write("glossary/ko/token.md", "# Token (#token)\n\nA token.\n")
  const roots = [
    { dir: path.join(root, "content"), base: "docs" },
    { dir: path.join(root, "glossary"), base: "terms" },
  ]
  const outDir = path.join(root, "site")
  const result = buildSite({
    roots,
    outDir,
    exclude: ["**/AGENTS.md"],
    private: ["docs/in/**"],
    externalPaths: ["/sdk"],
  })
  expect(result.documentCount).toBe(2)
  expect(fs.existsSync(path.join(outDir, "docs/ko/guide.html"))).toBe(true)
  expect(fs.existsSync(path.join(outDir, "terms/ko/token.html"))).toBe(true)
  expect(fs.existsSync(path.join(outDir, "docs/in/secret.html"))).toBe(false)
  expect(fs.existsSync(path.join(outDir, "docs/AGENTS.html"))).toBe(false)
  const html = fs.readFileSync(path.join(outDir, "docs/ko/guide.html"), "utf8")
  expect(html).toContain('href="../../terms/ko/token.html#token"')
  expect(html).toContain('href="../../terms/ko/token.html"')
  expect(html).toContain('href="/sdk/js/start"')
  expect(html).toContain("A token.")
  expect(html).not.toContain("secret")

  // The same library reused: the roots have to be the ones it was collected with.
  const reused = path.join(root, "reused")
  expect(() =>
    buildSite({
      sourceRoot: path.join(root, "content"),
      library: result.libraryDir,
      outDir: reused,
    }),
  ).toThrow(/collected with bases/)
  expect(() =>
    buildSite({
      roots,
      sourceRoot: path.join(root, "content"),
      library: result.libraryDir,
      outDir: reused,
    }),
  ).toThrow(/either sourceRoot or roots/)
  expect(() =>
    buildSite({ outDir: reused, library: result.libraryDir }),
  ).toThrow(/required/)
})

it("refuses a public link into a private document unless the host serves it", () => {
  const p = project({
    "index.md": "# Home (#home)\n\n[internal](internal/notes.md#notes)\n",
    "internal/notes.md": "# Notes (#notes)\n\nKeep.\n",
  })
  expect(() =>
    buildSite({
      sourceRoot: p.sourceRoot,
      outDir: p.outDir,
      private: ["internal/**"],
    }),
  ).toThrow(/index links to private document internal\/notes/)
  expect(fs.existsSync(p.outDir)).toBe(false)
  buildSite({
    sourceRoot: p.sourceRoot,
    outDir: p.outDir,
    private: ["internal/**"],
    links: "host",
    hostUrl: "https://docs.example.com/",
  })
  expect(fs.readFileSync(path.join(p.outDir, "index.html"), "utf8")).toContain(
    'href="https://docs.example.com/internal/notes#notes"',
  )
  expect(fs.existsSync(path.join(p.outDir, "internal/notes.html"))).toBe(false)
})
