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
import { nodeText, type DocumentNode } from "@cudoment/cudoc/document"
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
        // The navigation names the deployed page, and the contents beside
        // the page keep linking within it.
        expect(exported).toContain(
          'href="https://docs.example.com/project/native"',
        )
        expect(exported).toContain('id="host"')
        expect(exported).toContain('<a href="#host">')
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
      }
    })
  })
}

/**
 * Each host's own tab group, read under `tabs: "both"`, which the shared
 * options give every host. Eleventy has none of its own.
 */
const NATIVE_TABS: Record<string, { source: string; format: "md" | "mdx" }> = {
  docusaurus: {
    source:
      '# Tabs\n\n<Tabs groupId="os">\n  <TabItem value="win" label="Windows">\n\nWin body\n\n  </TabItem>\n  <TabItem value="mac" label="macOS" default>\n\nMac body\n\n  </TabItem>\n</Tabs>\n',
    format: "mdx",
  },
  nextra: {
    source:
      "# Tabs\n\n<Tabs items={['Windows', 'macOS']} defaultIndex={1}>\n  <Tabs.Tab>\n\nWin body\n\n  </Tabs.Tab>\n  <Tabs.Tab>\n\nMac body\n\n  </Tabs.Tab>\n</Tabs>\n",
    format: "mdx",
  },
  vitepress: {
    source:
      "# Tabs\n\n::: code-group\n\n```sh [Windows]\nWin body\n```\n\n```sh [macOS]\nMac body\n```\n\n:::\n",
    format: "md",
  },
}

for (const host of HOST_CASES.filter((h) => h.name in NATIVE_TABS)) {
  const native = NATIVE_TABS[host.name]
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: the host's own tabs`, () => {
    it("become one group of tabs, labelled and with its default", async () => {
      const compile = await host.compiler!()
      const { tree } = await compile(native.source, {
        id: "tabs",
        filePath: `tabs.${native.format}`,
        options: { format: native.format },
      })
      const groups: DocumentNode[] = []
      const find = (node: DocumentNode) => {
        if (node.data?.cudoc?.kind === "tabs") groups.push(node)
        node.children?.forEach(find)
      }
      find(tree as unknown as DocumentNode)
      expect(groups).toHaveLength(1)
      expect(
        groups[0]!.children!.map((member) => [
          member.data?.cudoc?.title,
          member.data?.cudoc?.default ?? false,
          nodeText(member).trim(),
        ]),
      ).toEqual([
        ["Windows", false, "Win body"],
        ["macOS", host.name !== "vitepress", "Mac body"],
      ])
      if (host.name === "docusaurus")
        expect(groups[0]!.data!.cudoc!.group).toBe("os")
      // The host's own rendering of the group is not kept beside it.
      expect(JSON.stringify(tree)).not.toMatch(
        /vp-code-group|"name":"(Tabs|TabItem|Tabs\.Tab)"/,
      )
    })
  })
}
