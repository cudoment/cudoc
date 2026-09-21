/**
 * Exporting a real host's collected library, under all three link policies.
 *
 * Every export reads the host's library and writes somewhere else. The library,
 * the host's source files and the host's own build output are hashed before and
 * after, because "reuse without modifying" is the whole contract of exporting
 * alongside an existing site.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { parse } from "node-html-parser"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { buildSite } from "cudoc-export"
import { BUILT_HOSTS, example, snapshot } from "./outputs.js"

const DEPLOYMENT = "https://docs.example.com/project/"
const POLICIES = ["relative", "host", "none"] as const

let temporary: string
beforeAll(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-export-hosts-"))
})
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }))

// The standalone example has no host library to reuse; it collects its own.
for (const host of BUILT_HOSTS.filter((h) => h.name !== "export")) {
  const site = example(host.name)
  const libraryDir = path.join(site, ".cudoc/documents")
  const collected = fs.existsSync(path.join(libraryDir, "embeds.json"))
  const suite = collected ? describe : describe.skip

  suite(`${host.name}: export a collected host library`, () => {
    let before: [string, string][]
    let sourceBefore: [string, string][]
    let outputBefore: [string, string][]
    let referenceRoute: string

    beforeAll(() => {
      before = snapshot(libraryDir)
      sourceBefore = snapshot(path.join(site, host.sourceDir))
      outputBefore = snapshot(path.join(site, host.outputDir))
      referenceRoute = loadLibrary(libraryDir).documents.find(
        (doc) => doc.id === "reference",
      )!.route
    })

    if (!collected)
      it.skip(`needs a collected library (npm run build in examples/${host.name})`, () => {})

    for (const links of POLICIES) {
      describe(`links: ${links}`, () => {
        let main: ReturnType<typeof parse>

        beforeAll(() => {
          const outDir = path.join(temporary, `${host.name}-${links}`)
          const result = buildSite({
            sourceRoot: path.join(site, host.sourceDir),
            library: libraryDir,
            outDir,
            links,
            ...(links === "host" ? { hostUrl: DEPLOYMENT } : {}),
          })
          expect(result.documentCount).toBe(
            loadLibrary(libraryDir).documents.length,
          )
          main = parse(
            fs.readFileSync(path.join(outDir, "portable.html"), "utf8"),
          )
        })

        it("keeps the normalized callout and nested cell list", () => {
          expect(
            main.querySelector("[data-callout]")?.getAttribute("data-callout"),
          ).toBe("warning")
          expect(
            main.querySelector("td ul li ul"),
            `${host.name}: nested table list`,
          ).toBeTruthy()
          expect(main.querySelectorAll("table")).toHaveLength(2)
        })

        it("reuses the replacement the host compiler produced", () => {
          expect(
            main.querySelectorAll("em").some((node) => node.text === "adapted"),
            `${host.name}: original native replacement is reused`,
          ).toBe(true)
        })

        it("links its own stylesheet relatively", () => {
          expect(
            main.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
          ).toBe("cudoc.css")
        })

        it("rewrites hyperlinks according to the policy", () => {
          if (links === "none") {
            expect(main.querySelectorAll("a")).toHaveLength(0)
            return
          }
          const prefix =
            links === "host"
              ? `https://docs.example.com/project${referenceRoute}`
              : "reference.html"
          expect(
            main
              .querySelectorAll("table a")
              .some((a) => a.getAttribute("href") === `${prefix}#limits`),
            `${host.name}: ${links} summary target`,
          ).toBe(true)
          if (links === "host")
            expect(
              main
                .querySelectorAll("nav a")
                .every((a) => a.getAttribute("href")!.startsWith(DEPLOYMENT)),
            ).toBe(true)
        })
      })
    }

    it("left the library, the sources and the host build unchanged", () => {
      expect(snapshot(libraryDir), `${host.name}: shared library`).toEqual(
        before,
      )
      expect(
        snapshot(path.join(site, host.sourceDir)),
        `${host.name}: source files`,
      ).toEqual(sourceBefore)
      expect(
        snapshot(path.join(site, host.outputDir)),
        `${host.name}: primary site output`,
      ).toEqual(outputBefore)
    })
  })
}
