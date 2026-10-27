/**
 * What collection writes beside the documents for a site's own metadata:
 * each page's title and description in `pages.json`, and the size of each
 * local image a page shows in `images.json`.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Root } from "mdast"
import { compileDocument } from "../src/markdown.js"
import { documentDescription, documentTitle } from "../src/metadata.js"
import { buildDocuments } from "../src/node/library.js"

const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(33)
  bytes.write("\x89PNG\r\n\x1a\n", 0, "latin1")
  bytes.writeUInt32BE(13, 8)
  bytes.write("IHDR", 12, "latin1")
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

describe("documentTitle and documentDescription", () => {
  const tree = (source: string) =>
    compileDocument(source, { format: "md" }).tree

  it("take the front matter first", () => {
    const { tree: own, frontmatter } = compileDocument(
      "---\ntitle: Own title\ndescription: |\n  Own\n  words.\n---\n\n# Heading\n\nFirst paragraph.\n",
      { format: "md" },
    )
    expect(documentTitle(own, frontmatter)).toBe("Own title")
    expect(documentDescription(own, frontmatter)).toBe("Own words.")
  })

  it("read the first heading without its badge, and the first paragraph", () => {
    const page = tree(
      "> [!NOTE]\n> Not this.\n\n# Login (@beta)\n\nLog in with a **Northlight** account,\nthen consent.\n\nSecond.\n",
    )
    expect(documentTitle(page)).toBe("Login")
    expect(documentDescription(page)).toBe(
      "Log in with a Northlight account, then consent.",
    )
  })

  it("find the page's # heading where a host wrapped it, under an earlier ##", () => {
    // Docusaurus moves the page's # heading into a header element.
    const page = {
      type: "root",
      children: [
        {
          type: "heading",
          depth: 2,
          children: [{ type: "text", value: "Aside" }],
        },
        {
          type: "mdxJsxFlowElement",
          name: "header",
          attributes: [],
          children: [
            {
              type: "heading",
              depth: 1,
              children: [{ type: "text", value: "Page" }],
            },
          ],
        },
      ],
    } as unknown as Root
    expect(documentTitle(page)).toBe("Page")
    expect(documentTitle(tree("## Only a section\n"))).toBe("Only a section")
    expect(documentTitle(tree("---\ntitle: 2026\n---\n\n# Year\n"))).toBe(
      "Year",
    )
    const { tree: numbered, frontmatter } = compileDocument(
      "---\ntitle: 2026\n---\n\n# Year\n",
      { format: "md" },
    )
    expect(documentTitle(numbered, frontmatter)).toBe("2026")
  })

  it("pass over a line of links and an image, and read a <br> as a space", () => {
    const page = tree(
      "**English** | [한국어](./index.ko.md) · [All guides](./guides.md)\n\n![Logo](./logo.png)\n\nFirst line<br>second line.\n",
    )
    expect(documentDescription(page)).toBe("First line second line.")
  })

  it("pass over a line of reference-style links the document defines", () => {
    const page = tree(
      "**English** | [한국어][ko]\n\nA description for the page.\n\n[ko]: ./guide.ko.md\n",
    )
    expect(documentDescription(page)).toBe("A description for the page.")
    // Undefined, the label is text the reader sees.
    expect(documentDescription(tree("**English** | [한국어][ko]\n"))).toBe(
      "English | [한국어][ko]",
    )
  })

  it("cut a long paragraph at a word before the limit", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ")
    const description = documentDescription(tree(`${words}.\n`))
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).toMatch(/word\d+…$/)
    expect(documentDescription(tree(`${words}.\n`), {}, 20)).toBe(
      "word0 word1 word2…",
    )
    // Counted in characters, so a pair of UTF-16 units is never split.
    const faces = documentDescription(tree(`${"😀".repeat(30)}\n`), {}, 10)
    expect(Array.from(faces)).toHaveLength(10)
    expect(faces).toBe(`${"😀".repeat(9)}…`)
  })

  it("fall back when there is nothing to read", () => {
    expect(documentTitle(tree("Text only.\n"), {}, "guide/start")).toBe(
      "guide/start",
    )
    expect(documentDescription(tree("# Only a heading\n"))).toBe("")
  })
})

describe("collection metadata files", () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
  })

  const workspace = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-metadata-"))
    roots.push(root)
    const write = (file: string, content: string | Buffer) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), content)
    }
    write(
      "docs/guide/start.md",
      "# Start\n\nInstall the SDK first.\n\n![Shot](./shot.png)\n\n![Logo](/img/logo.png)\n\n![Missing](./none.png)\n\n![Remote](https://example.com/a.png)\n\n![Chart][chart]\n\n[chart]: ./first.png\n[chart]: ./second.png\n",
    )
    write(
      "docs/notes.md",
      "---\ntitle: Notes\ndescription: Kept for the team.\n---\n\nNo heading.\n",
    )
    write("docs/guide/shot.png", png(640, 480))
    write("docs/guide/first.png", png(10, 10))
    write("docs/guide/second.png", png(20, 20))
    write("static/img/logo.png", png(120, 40))
    return root
  }

  it("lists every page with its title and description", () => {
    const root = workspace()
    buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      private: ["notes.md"],
    })
    expect(
      JSON.parse(fs.readFileSync(path.join(root, ".cudoc/pages.json"), "utf8")),
    ).toEqual({
      schemaVersion: 1,
      pages: [
        {
          id: "guide/start",
          route: "/guide/start",
          sourcePath: "guide/start.md",
          title: "Start",
          description: "Install the SDK first.",
        },
        {
          id: "notes",
          route: "/notes",
          sourcePath: "notes.md",
          title: "Notes",
          description: "Kept for the team.",
          private: true,
        },
      ],
    })
    expect(fs.existsSync(path.join(root, ".cudoc/images.json"))).toBe(false)
  })

  it("sizes the local images each page shows, when asked", () => {
    const root = workspace()
    buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      imageSizes: true,
      assetDirs: [path.join(root, "static")],
    })
    expect(
      JSON.parse(
        fs.readFileSync(path.join(root, ".cudoc/images.json"), "utf8"),
      ),
    ).toEqual({
      schemaVersion: 1,
      documents: {
        "guide/start": {
          "./shot.png": { type: "png", width: 640, height: 480 },
          "/img/logo.png": { type: "png", width: 120, height: 40 },
          // The first definition of a label is the one the page shows.
          "./first.png": { type: "png", width: 10, height: 10 },
        },
      },
    })
  })

  it("leaves the configuration, and so a reused library, as it was", () => {
    const root = workspace()
    const first = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
    })
    const second = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      imageSizes: true,
      assetDirs: [path.join(root, "static")],
      previous: first,
    })
    expect(second.configuration).toBe(first.configuration)
    expect(second.incremental?.reused).toEqual(["guide/start", "notes"])
  })
})
