/**
 * Every embed shape, resolved through every host's own compiler.
 *
 * `export.test.ts` takes one host all the way to exported HTML; this takes all
 * of them through collection and embed resolution, which is the half that
 * differs per host. Embedding reads source offsets out of whatever the host
 * compiler recorded, and those are computed differently by each one: the
 * markdown-it compilers shift every offset past front matter the host strips
 * before markdown-it ever sees it. An off-by-one there replaces the wrong span
 * of a reader's page instead of failing, so each shape is asserted per host.
 *
 * Adding a shape means adding one row to `SHAPES`. It then runs on every
 * installed host, including any host added to `hosts.ts` afterwards.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { Root } from "mdast"
import { nodeText } from "@cudoment/cudoc/document"
import type { DocumentNode } from "@cudoment/cudoc/document"
import { buildDocumentsAsync } from "@cudoment/cudoc/node/library"
import type { Library } from "@cudoment/cudoc/node/library"
import {
  resolveEmbedAsync,
  parseEmbedSpec,
} from "@cudoment/cudoc/node/resolve-embed"
import { HOST_CASES, FIXTURES, OPTIONS } from "./hosts.js"

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]

/** The text of every node of a type, in document order. */
const textsOf = (nodes: DocumentNode[], type: string) =>
  nodes.filter((n) => n.type === type).map((n) => nodeText(n).trim())

type Shape = {
  name: string
  spec: string
  /** What the resolved nodes must contain, whichever host produced them. */
  expect: (nodes: DocumentNode[], text: string) => void
}

/**
 * The nine shapes the showcase document uses, stated independently of it so a
 * failure names the shape rather than a line of fixture.
 */
const SHAPES: Shape[] = [
  {
    name: "a whole document",
    spec: "sources: [reference.md]\nrender: section\n",
    expect: (nodes, text) => {
      expect(text).toContain("Deep reference")
      // Everything the source has, not just its first section.
      expect(text).toContain("Retry")
      expect(text).toContain("Glossary")
    },
  },
  {
    name: "one section with its children",
    spec: "sources: [reference.md#limits]\n",
    expect: (_nodes, text) => {
      expect(text).toContain("Retry")
      expect(text).toContain("Backoff")
      expect(text).not.toContain("Glossary")
    },
  },
  {
    name: "one section without its children",
    spec: "sources: [reference.md]\nselect:\n  anchors: [limits]\n  includeChildren: false\nrender: section\n",
    expect: (_nodes, text) => {
      expect(text).not.toContain("Retry")
      expect(text).not.toContain("Backoff")
    },
  },
  {
    name: "a section chosen by title",
    spec: "sources: [reference.md]\nselect:\n  titles: [Authentication]\nrender: section\n",
    expect: (_nodes, text) => {
      expect(text).toContain("Authentication")
      expect(text).not.toContain("Glossary")
    },
  },
  {
    name: "a heading summary table",
    spec: "sources: [reference.md]\nselect:\n  depth: 2\nrender:\n  type: table\n",
    expect: (nodes) => {
      const rows = nodes.filter((n) => n.type === "tableRow")
      // A header row plus one per second-level heading in the source.
      expect(rows.length).toBeGreaterThan(1)
      const body = rows.slice(1).map((row) => nodeText(row))
      expect(body.join(" ")).toContain("Limits")
      expect(body.join(" ")).toContain("Authentication")
    },
  },
  {
    name: "a summary table with named columns",
    spec: "sources: [reference.md]\nselect:\n  depth: 2\nrender:\n  type: table\n  columns: [title, summary]\n",
    expect: (nodes) => {
      const header = nodes.find((n) => n.type === "tableRow")!
      expect(
        textsOf(header.children ?? [], "tableCell").map((t) => t.toLowerCase()),
      ).toEqual(["title", "summary"])
    },
  },
  {
    name: "an extracted table with column definitions",
    spec: "sources: [reference.md]\nselect:\n  titles: [Limits, Scopes]\nrender:\n  type: table\n  columns:\n    - { header: Section, value: title, link: section, minWidth: 10rem }\n    - { header: Part of, value: parent, link: parent }\n    - { header: First field, value: { row: 1, column: 0 } }\n",
    expect: (nodes) => {
      const rows = nodes.filter((n) => n.type === "tableRow")
      const cells = (row: DocumentNode) => row.children ?? []
      expect(textsOf(cells(rows[0]!), "tableCell")).toEqual([
        "Section",
        "Part of",
        "First field",
      ])
      // The width travels on the header cell, where every renderer reads it.
      expect(cells(rows[0]!)[0]!.data?.hProperties?.style).toBe(
        "min-width: 10rem",
      )
      const body = rows.slice(1).map((row) => textsOf(cells(row), "tableCell"))
      expect(body.map((row) => [row[0], row[2]])).toEqual([
        ["Limits", "window"],
        ["Scopes", "read:doc"],
      ])
      // The heading above Limits is the document title, which Docusaurus
      // lifts out of the tree; every host keeps the one above Scopes.
      expect(["Deep reference", ""]).toContain(body[0]![1])
      expect(body[1]![1]).toBe("Authentication")
      // The section link points into the source document, not at a copy.
      const link = walk(cells(rows[1]!)[0]!).find((n) => n.type === "link")
      expect(String(link?.url)).toMatch(/#limits$/)
      const parent = walk(cells(rows[2]!)[1]!).find((n) => n.type === "link")
      expect(String(parent?.url)).toMatch(/#authentication$/)
    },
  },
  {
    name: "a literal replacement",
    spec: 'sources: [reference.md#limits]\nreplace:\n  - find: "**original**"\n    replace: "_adapted_"\n',
    expect: (nodes, text) => {
      expect(text).toContain("adapted")
      expect(text).not.toContain("original")
      // Replacement recompiles the source, so the emphasis is a real node.
      expect(nodes.some((n) => n.type === "emphasis")).toBe(true)
    },
  },
  {
    name: "a regular-expression replacement",
    spec: 'sources: [reference.md#backoff]\nreplace:\n  - find: "up to `\\\\d+s`"\n    replace: "up to the configured ceiling"\n    regex: true\n',
    expect: (_nodes, text) => {
      expect(text).toContain("up to the configured ceiling")
      expect(text).not.toMatch(/\d+s/)
    },
  },
  {
    name: "a source path relative to the root",
    spec: "sources: [/reference.md#scopes]\nrender: section\n",
    expect: (_nodes, text) => {
      expect(text).toContain("Scopes")
    },
  },
]

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: embed shapes`, () => {
    let workspace: string
    let library: Library

    beforeAll(async () => {
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-embed-"))
      const source = path.join(workspace, "docs")
      fs.mkdirSync(source)
      for (const name of ["showcase.md", "reference.md"])
        fs.copyFileSync(path.join(FIXTURES, name), path.join(source, name))
      const compile = await host.compiler!()
      library = await buildDocumentsAsync({
        ...OPTIONS,
        sourceRoot: source,
        outDir: path.join(workspace, "library"),
        host: host.host,
        compilerId: `${host.name}-embedding`,
        async compiler(text, context) {
          return compile(text, {
            ...context,
            options: { ...context.options, format: "md" },
          })
        },
      })
    }, 60_000)

    afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }))

    for (const shape of SHAPES)
      it(`resolves ${shape.name}`, async () => {
        // Replacement recompiles a slice of Markdown through the host's own
        // compiler, which may be async, so this is the same entry point
        // `prepareEmbeds` uses rather than the synchronous one.
        const resolved = await resolveEmbedAsync(
          library,
          parseEmbedSpec(shape.spec),
          { documentId: "showcase", prefix: "case-" },
        )
        const nodes = walk(resolved as unknown as DocumentNode)
        shape.expect(nodes, nodes.map((n) => nodeText(n)).join(" "))
      })

    it("leaves the source document untouched", async () => {
      const before = JSON.stringify(
        library.documents.find((d) => d.id === "reference")!.tree,
      )
      await resolveEmbedAsync(
        library,
        parseEmbedSpec(
          'sources: [reference.md#limits]\nreplace:\n  - find: "**original**"\n    replace: "_adapted_"\n',
        ),
        { documentId: "showcase", prefix: "case-" },
      )
      const after = JSON.stringify(
        library.documents.find((d) => d.id === "reference")!.tree,
      )

      expect(after).toBe(before)
    })

    it("reports a source range for every anchor an embed can target", () => {
      // Replacement recompiles a slice of the original Markdown, so a host
      // whose compiler loses offsets fails here rather than silently embedding
      // the wrong span.
      const reference = library.documents.find((d) => d.id === "reference")!
      const anchors = walk(reference.tree as unknown as DocumentNode)
        .filter((n) => n.type === "heading")
        .map((n) => n.data?.hProperties?.id)
        .filter((id): id is string => typeof id === "string")

      expect(anchors.length).toBeGreaterThan(0)
      for (const anchor of anchors) {
        const range = reference.source.sections[anchor]
        expect(range, `no source range for #${anchor}`).toBeDefined()
        expect(range!.end).toBeGreaterThan(range!.start)
        expect(reference.source.text.slice(range!.start, range!.end)).not.toBe(
          "",
        )
      }
    })
  })
}

describe("embed shape coverage", () => {
  it("exercises every shape the showcase document uses", () => {
    // The fixture is what the built-site tier asserts on, so the two must not
    // drift: a shape added there without a row here would go unchecked per host.
    const fixture = fs.readFileSync(path.join(FIXTURES, "showcase.md"), "utf8")
    const blocks = fixture.match(/```cudoc-embed\n[\s\S]*?```/g) ?? []

    expect(blocks).toHaveLength(SHAPES.length)
  })
})
