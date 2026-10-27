/**
 * The metadata files collection writes beside the library, from each host's
 * own compiler: `pages.json`, each page's title and description, and
 * `images.json`, the size of each local image a page shows.
 *
 * A host changes both on the way: Docusaurus wraps the page's `#` heading in
 * a header and turns a local image into a required module, Nextra imports a
 * local image, and a markdown-it host resolves a reference-style image and
 * link itself, so the language line written with one is a link there and a
 * reference elsewhere. Each is asserted per host for that reason.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { buildDocumentsAsync } from "@cudoment/cudoc/node/library"
import { HOST_CASES, OPTIONS } from "./hosts.js"

/** A PNG header, which is all a size reader needs. */
const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(33)
  bytes.write("\x89PNG\r\n\x1a\n", 0, "latin1")
  bytes.writeUInt32BE(13, 8)
  bytes.write("IHDR", 12, "latin1")
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}
/** A GIF header. */
const gif = (width: number, height: number) => {
  const bytes = Buffer.alloc(32)
  bytes.write("GIF89a", 0, "latin1")
  bytes.writeUInt16LE(width, 6)
  bytes.writeUInt16LE(height, 8)
  return bytes
}

const GUIDE = [
  "# Guide (#guide)",
  "",
  "**English** | [한국어][ko]",
  "",
  "Install the SDK<br>before you start.",
  "",
  "![Shot](./img/shot.png)",
  "",
  "![Logo](/img/logo.png)",
  "",
  "![Chart][chart]",
  "",
  "[chart]: ./img/chart.gif",
  "[ko]: ./guide.ko.md",
  "",
].join("\n")

/**
 * A page whose front matter names and describes it otherwise than its text
 * does, so the library shows which one it kept.
 */
const FRONT = [
  "---",
  "title: Front matter title",
  "description: Front matter description.",
  "---",
  "",
  "# Heading title",
  "",
  "First paragraph.",
  "",
].join("\n")

/** An image written as a component, where the host compiles MDX. */
const COMPONENT = '# Component\n\n<img src="/img/logo.png" alt="Logo" />\n'

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: collection metadata`, () => {
    let workspace: string
    let pages: { id: string; title: string; description?: string }[]
    let manifest: {
      documents: { id: string; frontmatter: Record<string, unknown> }[]
    }
    let images: Record<
      string,
      Record<string, { type: string; width: number; height: number }>
    >

    beforeAll(async () => {
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-metadata-"))
      const docs = path.join(workspace, "docs")
      const write = (file: string, content: string | Buffer) => {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content)
      }
      write(path.join(docs, "guide.md"), GUIDE)
      write(path.join(docs, "guide.ko.md"), "# 가이드\n\n본문.\n")
      write(path.join(docs, "front.md"), FRONT)
      write(path.join(docs, "img/shot.png"), png(640, 480))
      write(path.join(docs, "img/chart.gif"), gif(30, 20))
      write(path.join(workspace, "static/img/logo.png"), png(120, 40))
      if (host.format === "mdx")
        write(path.join(docs, "component.mdx"), COMPONENT)
      const compile = await host.compiler!({
        staticDirs: [path.join(workspace, "static")],
      })
      const outDir = path.join(workspace, "library")
      await buildDocumentsAsync({
        ...OPTIONS,
        sourceRoot: docs,
        outDir,
        host: host.host,
        compilerId: `${host.name}-metadata`,
        imageSizes: true,
        assetDirs: [path.join(workspace, "static")],
        async compiler(text, context) {
          return compile(text, context)
        },
      })
      pages = JSON.parse(
        fs.readFileSync(path.join(outDir, "pages.json"), "utf8"),
      ).pages
      manifest = JSON.parse(
        fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
      )
      images = JSON.parse(
        fs.readFileSync(path.join(outDir, "images.json"), "utf8"),
      ).documents
    }, 120_000)

    afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }))

    it("names each page by its # heading and describes it in words", () => {
      const guide = pages.find((page) => page.id === "guide")!
      expect([guide.title, guide.description]).toEqual([
        "Guide",
        "Install the SDK before you start.",
      ])
      expect(pages.find((page) => page.id === "guide.ko")!.title).toBe("가이드")
    })

    it("keeps the front matter, which names and describes the page", () => {
      const front = {
        title: "Front matter title",
        description: "Front matter description.",
      }
      expect(
        manifest.documents.find((doc) => doc.id === "front")!.frontmatter,
      ).toEqual(front)
      const page = pages.find((page) => page.id === "front")!
      expect([page.title, page.description]).toEqual([
        front.title,
        front.description,
      ])
    })

    it("sizes every local image the page shows, by the address it writes", () => {
      expect(images.guide).toEqual({
        "./img/shot.png": { type: "png", width: 640, height: 480 },
        "/img/logo.png": { type: "png", width: 120, height: 40 },
        "./img/chart.gif": { type: "gif", width: 30, height: 20 },
      })
      if (host.format === "mdx")
        expect(images.component).toEqual({
          "/img/logo.png": { type: "png", width: 120, height: 40 },
        })
    })
  })
}
