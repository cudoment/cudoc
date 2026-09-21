/**
 * Collection, embedding and HTML export, end to end.
 *
 * The fixtures are collected with a real host compiler into a temporary
 * library, the embeds are prepared, and the result is exported by `cudoc-export`
 * under all three link policies. Every embed shape in the showcase document is
 * asserted on the exported page, which is the only place where a wrong
 * selection or replacement actually becomes visible.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { parse } from "node-html-parser"
import { buildDocumentsAsync } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import { buildSite } from "cudoc-export"
import { HOST_CASES, FIXTURES, OPTIONS } from "./hosts.js"

/**
 * One host is enough to exercise the pipeline; the parity suite covers the
 * rest. A host that compiles through its own toolchain is preferred, so the
 * library under test is the kind a real site collects.
 */
const HOST =
  HOST_CASES.find((host) => host.compiler && host.native) ??
  HOST_CASES.find((host) => host.compiler)!
const DEPLOYMENT = "https://docs.example.com/project/"

let workspace: string
let source: string
let library: string

beforeAll(async () => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-export-"))
  source = path.join(workspace, "docs")
  library = path.join(workspace, "library")
  fs.mkdirSync(source)
  for (const name of ["showcase.md", "reference.md"])
    fs.copyFileSync(path.join(FIXTURES, name), path.join(source, name))
  const compile = await HOST.compiler!()
  const collected = await buildDocumentsAsync({
    ...OPTIONS,
    sourceRoot: source,
    outDir: library,
    host: HOST.host,
    compilerId: `${HOST.name}-export-fixture`,
    async compiler(text, context) {
      return compile(text, {
        ...context,
        options: { ...context.options, format: "md" },
      })
    },
  })
  await prepareEmbeds(collected, library)
})

afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }))

const exportSite = (links: "relative" | "host" | "none") => {
  const outDir = path.join(workspace, `site-${links}`)
  buildSite({
    sourceRoot: source,
    library,
    outDir,
    title: "Fixture export",
    navigation: ["showcase", "reference"],
    links,
    ...(links === "host" ? { hostUrl: DEPLOYMENT } : {}),
  })
  return parse(fs.readFileSync(path.join(outDir, "showcase.html"), "utf8"))
}

describe(`export through ${HOST.name}`, () => {
  it("collects both documents and prepares their embeds", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(library, "manifest.json"), "utf8"),
    )
    expect(manifest.documents.map((d: { id: string }) => d.id).sort()).toEqual([
      "reference",
      "showcase",
    ])
    const embeds = JSON.parse(
      fs.readFileSync(path.join(library, "embeds.json"), "utf8"),
    )
    expect(Object.keys(embeds.sourceHashes).sort()).toEqual([
      "reference",
      "showcase",
    ])
    expect(
      Object.keys(embeds.blocks).filter((key) => key.startsWith("showcase")),
    ).toHaveLength(10)
  })

  describe("embed shapes on the exported page", () => {
    let main: ReturnType<typeof parse>

    beforeAll(() => {
      main = exportSite("relative").querySelector("main")!
    })

    /**
     * The nodes between one authored heading and the next.
     *
     * The authored ids bound the range rather than the next `<h2>`: an embedded
     * section brings its own headings, including depth-two ones.
     */
    const AUTHORED = new Set([
      "anchors",
      "callouts",
      "cells",
      "markdown",
      "whole",
      "with-children",
      "without-children",
      "by-title",
      "summary",
      "summary-columns",
      "literal-replace",
      "regex-replace",
      "root-relative",
    ])
    const section = (id: string) => {
      const nodes = main.childNodes.filter((node) => "tagName" in node)
      const from = nodes.findIndex(
        (node) => (node as { id?: string }).id === id,
      )
      expect(from, `authored heading ${id}`).toBeGreaterThan(-1)
      const rest = nodes.slice(from + 1)
      const stop = rest.findIndex((node) =>
        AUTHORED.has((node as { id?: string }).id ?? ""),
      )
      return parse(
        (stop === -1 ? rest : rest.slice(0, stop))
          .map((node) => node.toString())
          .join(""),
      )
    }

    it("includes a whole selected section with no children", () => {
      expect(section("whole").text).toContain("A term list with no child")
    })

    it("includes a section together with its children", () => {
      const body = section("with-children").text
      expect(body).toContain("original")
      expect(body).toContain("Retry after the window expires")
      expect(body).toContain("Double the delay")
    })

    it("excludes children when includeChildren is false", () => {
      const body = section("without-children").text
      expect(body).toContain("Send an access token")
      expect(body).not.toContain("write:doc")
    })

    it("selects a section by title", () => {
      expect(section("by-title").text).toContain("Double the delay")
    })

    it("renders a heading summary table with default columns", () => {
      const table = section("summary").querySelector("table")!
      expect(
        table
          .querySelectorAll("tbody tr")
          .map((r) => r.querySelector("td")!.text.trim()),
      ).toEqual(["Limits", "Authentication", "Glossary"])
      expect(table.querySelectorAll("thead th")).toHaveLength(3)
    })

    it("honours an explicit column list", () => {
      const table = section("summary-columns").querySelector("table")!
      expect(table.querySelectorAll("thead th")).toHaveLength(2)
      expect(
        table
          .querySelectorAll("tbody tr")
          .map((r) => r.querySelector("td")!.text.trim()),
      ).toEqual(["Retry", "Backoff", "Scopes"])
    })

    it("applies a literal replacement and recompiles the result", () => {
      const body = section("literal-replace")
      expect(body.querySelectorAll("em").map((n) => n.text)).toContain(
        "adapted",
      )
      expect(body.text).not.toContain("original")
    })

    it("applies a regular-expression replacement", () => {
      const body = section("regex-replace").text
      expect(body).toContain("up to the configured ceiling")
      expect(body).not.toMatch(/up to `?30s/)
    })

    it("resolves a source path relative to sourceRoot", () => {
      expect(section("root-relative").text).toContain("read:doc")
    })

    it("keeps table-cell lists inside an embedded table", () => {
      expect(section("with-children").querySelector("td ul li ul")).toBeTruthy()
    })

    it("namespaces embedded anchors and links them locally", () => {
      const ids = main.querySelectorAll("[id^=embed-]").map((n) => n.id)
      expect(ids.length).toBeGreaterThan(3)
      for (const id of new Set(ids))
        expect(ids.filter((other) => other === id)).toHaveLength(1)
      const local = main
        .querySelectorAll("a")
        .map((a) => a.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("#embed-"))
      expect(local.length).toBeGreaterThan(0)
      for (const href of local) expect(ids).toContain(href.slice(1))
    })
  })

  it("rewrites every policy consistently", () => {
    const relative = exportSite("relative").querySelector("main")!
    const hosted = exportSite("host").querySelector("main")!
    const plain = exportSite("none").querySelector("main")!

    const summaryLinks = (root: typeof relative) =>
      root
        .querySelectorAll("table a")
        .map((a) => a.getAttribute("href") ?? "")
        .filter((href) => href.includes("#limits"))

    expect(summaryLinks(relative)[0]).toBe("reference.html#limits")
    expect(summaryLinks(hosted)[0]).toBe(`${DEPLOYMENT}reference#limits`)
    expect(plain.querySelectorAll("a")).toHaveLength(0)
    // Removing hyperlinks keeps the labels and the surrounding markup.
    expect(plain.text).toContain("Limits")
    expect(plain.querySelector("td ul li ul")).toBeTruthy()

    for (const root of [relative, hosted, plain]) {
      expect(root.querySelectorAll("[data-callout]").length).toBe(6)
      expect(root.text).toContain("{value}")
    }
  })

  it("leaves the collected library untouched by an export", () => {
    const before = fs
      .readdirSync(path.join(library, "documents"))
      .map((name) => [
        name,
        fs.readFileSync(path.join(library, "documents", name), "utf8").length,
      ])
    exportSite("relative")
    expect(
      fs
        .readdirSync(path.join(library, "documents"))
        .map((name) => [
          name,
          fs.readFileSync(path.join(library, "documents", name), "utf8").length,
        ]),
    ).toEqual(before)
  })
})
