/**
 * What `annotations: true` adds to a site, and that the default output is
 * untouched. The cases that need the bundled runtime skip when the package
 * has not been built, naming the command that builds it.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import { parse } from "node-html-parser"
import { buildSite, buildExport } from "../src/index.js"
import {
  ANNOTATION_SCRIPT,
  ANNOTATION_STYLESHEET,
  annotationRuntimeFiles,
  assignBlockIds,
  injectAnnotationAssets,
} from "../src/annotations/site.js"

const blockIds = (html: string): Record<string, string> => {
  const tree = fromHtml(html, { fragment: true })
  assignBlockIds(tree)
  const out: Record<string, string> = {}
  const walk = (node: {
    type: string
    tagName?: string
    properties?: Record<string, unknown>
    children?: unknown[]
  }) => {
    if (node.type === "element" && node.properties?.dataCudocBlock)
      out[
        `${node.tagName}:${(node.children as { value?: string }[])
          .map((c) => c.value ?? "")
          .join("")}`
      ] = String(node.properties.dataCudocBlock)
    ;(node.children as (typeof node)[] | undefined)?.forEach(walk)
  }
  walk(tree as unknown as Parameters<typeof walk>[0])
  return out
}

describe("assignBlockIds", () => {
  const base =
    '<h2 id="a">A</h2><p>One</p><p>Two</p><h2 id="b">B</h2><p>Three</p>'

  it("scopes ids to the heading and hashes the block text", () => {
    const ids = blockIds(base)
    expect(ids["p:One"]).toMatch(/^a:[0-9a-f]{8}$/)
    expect(ids["p:Three"]).toMatch(/^b:[0-9a-f]{8}$/)
    expect(ids["h2:A"]).toMatch(/^a:[0-9a-f]{8}$/)
  })

  it("survives a paragraph inserted anywhere else", () => {
    const before = blockIds(base)
    const after = blockIds(
      '<p>Zero</p><h2 id="a">A</h2><p>Inserted</p><p>One</p><p>Two</p><h2 id="b">B</h2><p>Three</p>',
    )
    expect(after["p:One"]).toBe(before["p:One"])
    expect(after["p:Two"]).toBe(before["p:Two"])
    expect(after["p:Three"]).toBe(before["p:Three"])
    expect(after["p:Zero"]).toMatch(/^:[0-9a-f]{8}$/)
  })

  it("changes only the id of an edited block", () => {
    const before = blockIds(base)
    const after = blockIds(base.replace("<p>Two</p>", "<p>Two, edited</p>"))
    expect(after["p:One"]).toBe(before["p:One"])
    expect(after["p:Two, edited"]).not.toBe(before["p:Two"])
  })

  it("numbers repeated text within a section", () => {
    const ids = blockIds('<h2 id="a">A</h2><p>Same</p><ul><li>Same</li></ul>')
    expect(ids["li:Same"]).toBe(`${ids["p:Same"]}~2`)
  })

  it("marks nested blocks and callouts, not containers", () => {
    const html =
      '<ul><li><p>Text</p></li></ul><aside class="cudoc-callout" data-callout="note"><p class="cudoc-callout-title">Note</p><p>Body</p></aside><blockquote><p>Q</p></blockquote><table><tbody><tr><td>c</td></tr></tbody></table>'
    const tree = fromHtml(html, { fragment: true })
    assignBlockIds(tree)
    const out = toHtml(tree)
    expect(out.match(/data-cudoc-block=/g)).toHaveLength(8)
    expect(out).toMatch(/<ul><li data-cudoc-block=/)
    expect(out).toMatch(
      /<aside class="cudoc-callout" data-callout="note" data-cudoc-block=/,
    )
    expect(out).toMatch(/<table><tbody><tr data-cudoc-block=/)
    expect(out).not.toMatch(/<td data-cudoc-block/)
  })
})

describe("injectAnnotationAssets", () => {
  it("adds the policy after the charset, the stylesheet, and a classic deferred script", () => {
    const page = fromHtml(
      '<!doctype html><html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="cudoc.css"></head><body><main></main></body></html>',
    )
    injectAnnotationAssets(page, { script: "../x.js", stylesheet: "../x.css" })
    const html = toHtml(page)
    expect(html).toMatch(
      /<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="[^"]+"><title>/,
    )
    expect(
      parse(html).querySelector("meta[http-equiv]")!.getAttribute("content"),
    ).toBe(
      "object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'",
    )
    expect(html).toContain('<link rel="stylesheet" href="../x.css"></head>')
    expect(html).toContain('<script defer src="../x.js"></script></body>')
    expect(html).not.toContain('type="module"')
  })
})

const runtimeBuilt = (() => {
  try {
    annotationRuntimeFiles()
    return true
  } catch {
    return false
  }
})()
const withRuntime = runtimeBuilt ? it : it.skip
if (!runtimeBuilt)
  console.log(
    "annotations-site: runtime not built; run npm run build --workspace packages/cudoc-export",
  )

const sha256 = (file: string) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex")

const site = (annotations?: boolean | string) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-ann-site-"))
  const sourceRoot = path.join(root, "docs")
  fs.mkdirSync(path.join(sourceRoot, "guide"), { recursive: true })
  fs.writeFileSync(
    path.join(sourceRoot, "index.md"),
    "# Home\n\nFirst paragraph.\n\n## Start (#start)\n\nRun the installer before anything else.\n\n[Guide](guide/setup.md)\n",
  )
  fs.writeFileSync(
    path.join(sourceRoot, "guide/setup.md"),
    "# Setup\n\n## Install (#install)\n\nInstall with npm.\n\n[Home](../index.md)\n",
  )
  const outDir = path.join(root, "site")
  return {
    root,
    sourceRoot,
    outDir,
    build: () =>
      buildSite({
        sourceRoot,
        outDir,
        title: "Demo",
        ...(annotations === undefined
          ? {}
          : { annotations: annotations as boolean }),
      }),
    read: (file: string) => fs.readFileSync(path.join(outDir, file), "utf8"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

describe("buildSite with annotations", () => {
  it("leaves the default output without script, policy, block ids or runtime files", () => {
    const s = site()
    try {
      s.build()
      for (const file of ["index.html", "guide/setup.html"]) {
        const html = s.read(file)
        expect(html).not.toContain("<script")
        expect(html).not.toContain("http-equiv")
        expect(html).not.toContain("data-cudoc-")
      }
      expect(fs.existsSync(path.join(s.outDir, ANNOTATION_SCRIPT))).toBe(false)
      expect(fs.existsSync(path.join(s.outDir, ANNOTATION_STYLESHEET))).toBe(
        false,
      )
    } finally {
      s.cleanup()
    }
  })

  it("rejects a value that is not a boolean before writing anything", () => {
    const s = site("yes")
    try {
      expect(() => s.build()).toThrow(
        /cudoc-export: annotations must be true or false/,
      )
      expect(fs.existsSync(s.outDir)).toBe(false)
    } finally {
      s.cleanup()
    }
  })

  it("refuses an asset named like the runtime even when the option is off", () => {
    const s = site()
    try {
      fs.writeFileSync(path.join(s.sourceRoot, ANNOTATION_SCRIPT), "alert(1)")
      fs.appendFileSync(
        path.join(s.sourceRoot, "index.md"),
        `\n<img src="${ANNOTATION_SCRIPT}">\n`,
      )
      expect(() => s.build()).toThrow(/asset collides with generated output/)
    } finally {
      s.cleanup()
    }
  })

  withRuntime(
    "ships the runtime, tags every page and pins the document version",
    () => {
      const s = site(true)
      try {
        s.build()
        const home = s.read("index.html")
        const setup = s.read("guide/setup.html")
        for (const [html, prefix] of [
          [home, ""],
          [setup, "../"],
        ] as const) {
          expect(html.match(/<script/g)).toHaveLength(1)
          expect(html).toContain(
            `<script defer src="${prefix}${ANNOTATION_SCRIPT}"></script>`,
          )
          expect(html).toContain(
            `<link rel="stylesheet" href="${prefix}${ANNOTATION_STYLESHEET}">`,
          )
          expect(html).toMatch(
            /<meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/,
          )
          expect(html.indexOf("Content-Security-Policy")).toBeLessThan(
            html.indexOf("cudoc.css"),
          )
        }
        const main = parse(home).querySelector("main")!
        expect(main.getAttribute("data-cudoc-document")).toBe("index")
        expect(main.getAttribute("data-cudoc-ast-hash")).toMatch(
          /^[0-9a-f]{64}$/,
        )
        expect(main.getAttribute("data-cudoc-generator")).toMatch(
          /^cudoc-export \d/,
        )
        expect(home).toMatch(
          /<p data-cudoc-block="start:[0-9a-f]{8}">Run the installer/,
        )
        // The print outputs are built from the shared tree and stay as they were.
        for (const file of [
          "index.print.html",
          "guide/setup.print.html",
          "volume.print.html",
        ]) {
          const print = s.read(file)
          expect(print).not.toContain("<script")
          expect(print).not.toContain("data-cudoc-block")
        }
        const shipped = annotationRuntimeFiles()
        expect(sha256(path.join(s.outDir, ANNOTATION_SCRIPT))).toBe(
          sha256(shipped.script),
        )
        expect(sha256(path.join(s.outDir, ANNOTATION_STYLESHEET))).toBe(
          sha256(shipped.stylesheet),
        )
      } finally {
        s.cleanup()
      }
    },
  )

  withRuntime(
    "stamps the same version hash the library manifest records",
    () => {
      const s = site(true)
      try {
        const result = s.build()
        const manifest = JSON.parse(
          fs.readFileSync(
            path.join(result.libraryDir, "manifest.json"),
            "utf8",
          ),
        ) as { documents: { id: string; astHash: string }[] }
        const main = parse(s.read("guide/setup.html")).querySelector("main")!
        expect(main.getAttribute("data-cudoc-ast-hash")).toBe(
          manifest.documents.find((d) => d.id === "guide/setup")!.astHash,
        )
      } finally {
        s.cleanup()
      }
    },
  )

  withRuntime(
    "accepts the option next to a reused library and lists the files it wrote",
    async () => {
      const s = site(true)
      try {
        const first = s.build()
        const second = path.join(s.root, "again")
        expect(() =>
          buildSite({
            sourceRoot: s.sourceRoot,
            outDir: second,
            library: first.libraryDir,
            annotations: true,
          }),
        ).not.toThrow()
        const result = await buildExport({
          sourceRoot: s.sourceRoot,
          outDir: path.join(s.root, "export"),
          library: first.libraryDir,
          annotations: true,
        })
        expect(result.files.html).toContain(ANNOTATION_SCRIPT)
        expect(result.files.html).toContain(ANNOTATION_STYLESHEET)
      } finally {
        s.cleanup()
      }
    },
  )

  withRuntime("ships a runtime that touches neither markup nor network", () => {
    // The W3C context identifier and the SVG namespace are URLs by
    // definition and are never fetched.
    const script = fs
      .readFileSync(annotationRuntimeFiles().script, "utf8")
      .replaceAll("http://www.w3.org/ns/anno.jsonld", "")
      .replaceAll("http://www.w3.org/2000/svg", "")
    for (const forbidden of [
      "innerHTML",
      "insertAdjacentHTML",
      "document.write",
      "eval(",
      "new Function",
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "sendBeacon",
      "import(",
      "new RegExp(",
      "http://",
      "https://",
    ])
      expect(script, forbidden).not.toContain(forbidden)
  })
})
