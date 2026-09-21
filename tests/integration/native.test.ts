/**
 * Native host syntax normalized alongside cudoc's own.
 *
 * The shared showcase fixture can only carry portable syntax: one file is
 * compiled by every host, and each host spells its native anchor and callout
 * differently. So the source here is composed per host, a native part followed
 * by the same portable part, and both are asserted to reach the same document
 * semantics and the same HTML export.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import type { Root } from "mdast"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import { collectSections } from "@cudoment/cudoc/query"
import { renderDocument } from "@cudoment/cudoc/render"
import { buildSite } from "cudoc-export"
import { HOST_CASES, type HostCase } from "./hosts.js"

/** The portable half, identical for every host. */
const PORTABLE =
  "\n\n## Portable (#portable)\n\n> [!WARNING] Portable title\n> Portable body\n\n[Link](https://example.com)"

/** The native half, in each host's own spelling. */
const NATIVE: Record<string, { source: string; format: "md" | "mdx" }> = {
  docusaurus: {
    source:
      "# Native\n\n## Host {/* #host */}\n\n:::warning[Native title]{#native-alert}\n\nNative body\n\n:::",
    format: "mdx",
  },
  nextra: {
    source:
      '# Native\n\n## Host [#host]\n\n<Callout type="warning">Native body</Callout>',
    format: "mdx",
  },
  vitepress: {
    source:
      "# Native\n\n## Host {#host}\n\n::: warning Native title\nNative body\n:::",
    format: "md",
  },
  eleventy: {
    source:
      "# Native\n\n## Host {#host}\n\n::: warning Native title\nNative body\n:::",
    format: "md",
  },
}

/** Only a host that actually has native syntax for these features. */
const cases = HOST_CASES.filter(
  (host): host is HostCase => Boolean(host.compiler) && host.name in NATIVE,
)

for (const host of HOST_CASES.filter((h) => h.name in NATIVE)) {
  const native = NATIVE[host.name]
  const suite = cases.includes(host) ? describe : describe.skip
  suite(`${host.name}: native and cudoc syntax together`, () => {
    const source = native.source + PORTABLE
    let tree: Root
    let html: string

    beforeAll(async () => {
      const compile = await host.compiler!()
      const result = await compile(source, {
        id: "native",
        filePath: `native.${native.format}`,
        options: {
          syntax: { headingAnchor: "both", callout: "both", link: "both" },
          format: native.format,
        },
      })
      tree = result.tree
      html = renderDocument(tree)
    })

    it("resolves the native anchor and the cudoc anchor alike", () => {
      expect(
        collectSections(tree, { anchors: ["host", "portable"] }),
      ).toHaveLength(2)
    })

    it("gives the native callout and the cudoc callout one meaning", () => {
      expect(html.match(/data-callout="warning"/g) ?? []).toHaveLength(2)
      expect(html).toContain("Native body")
      expect(html).toContain("Portable body")
    })

    it("keeps an external link untouched", () => {
      expect(html).toContain('href="https://example.com"')
    })

    it("carries an explicit native id when the host supports one", () => {
      if (host.name === "docusaurus")
        expect(html).toContain('id="native-alert"')
      else expect(html).toContain('id="host"')
    })

    it("survives an HTML export with deployment links", () => {
      const temporary = fs.mkdtempSync(
        path.join(os.tmpdir(), `cudoc-native-${host.name}-`),
      )
      try {
        const sourceRoot = path.join(temporary, "docs")
        const library = path.join(temporary, "library")
        fs.mkdirSync(sourceRoot)
        fs.writeFileSync(
          path.join(sourceRoot, `native.${native.format}`),
          source,
        )
        buildDocuments({
          sourceRoot,
          outDir: library,
          host: host.host,
          compilerId: `${host.name}-native-capture`,
          compiler: () => ({ tree, frontmatter: {}, diagnostics: [] }),
        })
        const outDir = path.join(temporary, "html")
        buildSite({
          sourceRoot,
          library,
          outDir,
          links: "host",
          hostUrl: "https://docs.example.com/project/",
        })
        const exported = fs.readFileSync(
          path.join(outDir, "native.html"),
          "utf8",
        )
        expect(exported.match(/data-callout="warning"/g) ?? []).toHaveLength(2)
        expect(exported).toContain(
          'href="https://docs.example.com/project/native#host"',
        )
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
      }
    })
  })
}
