/**
 * Reference checking across a collected library.
 *
 * These build a real library from temporary files rather than hand-assembling
 * `StoredDocument`s, because the checker depends on what collection actually
 * produces: stripped positions, generated anchor ids, and the source snapshot
 * it recovers coordinates from.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildDocuments } from "../src/node/library.js"
import { checkReferences, type ReferenceIssueCode } from "../src/node/check.js"
import { formatCheckResult } from "../src/node/report.js"
import { importedNamesFromSource } from "../src/markdown.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
})

const check = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
  roots.push(root)
  const docs = path.join(root, "docs")
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(docs, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return checkReferences(
    buildDocuments({ sourceRoot: docs, outDir: path.join(root, ".cudoc") }),
  )
}

const codes = (result: ReturnType<typeof check>): ReferenceIssueCode[] =>
  result.issues.map((issue) => issue.code)

const REFERENCE = "# Reference\n\n## Limits (#limits)\n\nBody.\n"

describe("resolvable references", () => {
  it("reports nothing when every link and embed resolves", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide (#guide)\n\n[limits](reference.md#limits)\n",
    })

    expect(result.issues).toEqual([])
    expect(result.documentCount).toBe(2)
    expect(result.checkedReferences).toBe(1)
  })

  it("resolves a link into a subdirectory relative to its own document", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide/start.md": "# Start\n\n[limits](../reference.md#limits)\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("broken references", () => {
  it("names the anchors a document really has when one is missing", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide\n\n[typo](reference.md#limit)\n",
    })

    expect(codes(result)).toEqual(["missing-anchor"])
    // The author sees real names rather than a guess that can be wrong.
    expect(result.issues[0]!.available).toContain("limits")
  })

  it("points at the broken link, not an earlier one it is a prefix of", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        "# Guide\n\n[good](reference.md#limits)\n\n[bad](reference.md#limit)\n",
    })

    expect(result.issues[0]!.position?.start.line).toBe(5)
  })

  it("separates a missing document from a missing image", () => {
    const result = check({
      "guide.md": "# Guide\n\n[gone](nowhere.md)\n\n![gone](./none.png)\n",
    })

    expect(codes(result)).toEqual(["missing-document", "missing-asset"])
  })

  it("checks embed sources and their sections", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [reference.md#nosuch]\n```\n\n```cudoc-embed\nsources: [ghost.md]\n```\n",
    })

    expect(codes(result)).toEqual([
      "missing-embed-anchor",
      "missing-embed-source",
    ])
  })

  it("leaves external URLs alone", () => {
    const result = check({
      "guide.md":
        "# Guide\n\n[a](https://example.com/x)\n[b](mailto:a@example.com)\n[c](//cdn.example.com/y)\n",
    })

    expect(result.issues).toEqual([])
    expect(result.checkedReferences).toBe(3)
  })
})

describe("replacement rules that change nothing", () => {
  const embed = (spec: string) =>
    `# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("warns when a rule matches nothing the embed copies", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": embed(
        'sources: [reference.md#limits]\nreplace:\n  - find: "was reworded away"\n    replace: "x"',
      ),
    })

    expect(codes(result)).toEqual(["unmatched-embed-replacement"])
    expect(result.issues[0]!.severity).toBe("warning")
    // Pointed at the rule in the embedding document, not at the source.
    expect(result.issues[0]!.position?.start.line).toBe(6)
  })

  it("stays quiet when a rule matches at least one selected section", () => {
    // A rule list is applied to every selected section, so a rule aimed at one
    // of them misses the others by design. Only matching nothing is a problem.
    const result = check({
      "reference.md":
        "# Reference\n\n## Limits (#limits)\n\nBody.\n\n## Auth (#auth)\n\nOther.\n",
      "guide.md": embed(
        'sources: [reference.md]\nselect:\n  depth: 2\nreplace:\n  - find: "Body"\n    replace: "x"',
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("follows the rules in order, as the resolver does", () => {
    // The second rule can only match what the first one produced.
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": embed(
        'sources: [reference.md#limits]\nreplace:\n  - find: "Body"\n    replace: "MIDDLE"\n  - find: "MIDDLE"\n    replace: "final"',
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("narrows to what includeChildren actually copies", () => {
    const result = check({
      "reference.md":
        "# Reference\n\n## Limits (#limits)\n\nBody.\n\n### Retry (#retry)\n\nOnly in the child.\n",
      "guide.md": embed(
        'sources: [reference.md]\nselect:\n  anchors: [limits]\n  includeChildren: false\nreplace:\n  - find: "Only in the child"\n    replace: "x"',
      ),
    })

    expect(codes(result)).toEqual(["unmatched-embed-replacement"])
  })
})

describe("embed blocks that do not parse", () => {
  it("reports a syntax error as one, at the line inside the file", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        '# Guide\n\nIntro.\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: "unclosed\n```\n',
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    // The fence is on line 5 and the parser's line 3 is the rule, so line 8.
    expect(result.issues[0]!.position?.start.line).toBe(8)
    // The parser's own block-relative coordinate is dropped, not repeated.
    expect(result.issues[0]!.message).not.toMatch(/at line \d+, column/)
  })

  it("names the offending key rather than the whole block", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        '# Guide\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: "a"\n    replace: "b"\n    regexp: true\n```\n',
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    expect(result.issues[0]!.message).toContain('unknown key "regexp"')
    expect(result.issues[0]!.reference).toBe("embed block 1")
  })
})

describe("components an embed would copy", () => {
  const WIDGET = [
    "# Widget (#widget)",
    "",
    "## Live (#live)",
    "",
    "<Chart data={points} />",
    "",
    "## Static (#static)",
    "",
    "Plain prose.",
    "",
  ].join("\n")
  const embed = (spec: string) =>
    `# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("warns when the copied section carries a component", () => {
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed("sources: [widget.mdx#live]"),
    })

    expect(codes(result)).toEqual(["unportable-embed-component"])
    expect(result.issues[0]!.severity).toBe("warning")
    // Named, because the fix is either to move that component or to supply a
    // renderer for it, and both need to know which one it is.
    expect(result.issues[0]!.message).toContain("<Chart>")
  })

  it("stays quiet when the component sits outside the copied section", () => {
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed("sources: [widget.mdx#static]"),
    })

    expect(result.issues).toEqual([])
  })

  it("stays quiet for a summary table, which copies heading text only", () => {
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed(
        "sources: [widget.mdx]\nselect:\n  depth: 2\nrender:\n  type: table",
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("narrows with includeChildren the way the resolver does", () => {
    const result = check({
      "widget.mdx":
        "# Widget (#widget)\n\n## Outer (#outer)\n\nProse.\n\n### Inner (#inner)\n\n<Chart />\n",
      "guide.md": embed(
        "sources: [widget.mdx]\nselect:\n  anchors: [outer]\n  includeChildren: false",
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("reports a select anchor that names no section", () => {
    // collectSections throws here and the build raises the same error, so
    // swallowing it would make the checker pass something the build rejects.
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed("sources: [widget.mdx]\nselect:\n  anchors: [nosuch]"),
    })

    expect(codes(result)).toEqual(["missing-embed-anchor"])
    expect(result.issues[0]!.available).toContain("live")
  })
})

describe("anchors a document declares", () => {
  it("reports a duplicate explicit anchor at the later declaration", () => {
    const result = check({
      "dup.md":
        "# Dup\n\n## Alpha (#same)\n\nOne.\n\n## Beta (#same)\n\nTwo.\n",
    })

    expect(codes(result)).toEqual(["duplicate-anchor"])
    expect(result.issues[0]!.position?.start.line).toBe(7)
  })

  it("reports an anchor marker that carries no id", () => {
    // `(#)` never becomes an anchor. It stays in the heading text and joins the
    // generated slug, so the heading gets an id nobody meant to write.
    const result = check({ "empty.md": "# Guide (#)\n\ntext\n" })

    expect(codes(result)).toEqual(["empty-anchor"])
  })

  it("accepts repeated headings, which hosts disambiguate the same way", () => {
    const result = check({
      "repeat.md": "# R\n\n## Over\n\nx\n\n## Over\n\ny\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("generated anchors that move", () => {
  it("warns when a link depends on a slugger suffix", () => {
    const result = check({
      "reference.md": "# R\n\n## Over\n\nx\n\n## Over\n\ny\n",
      "guide.md": "# Guide\n\n[unstable](reference.md#over-1)\n",
    })

    expect(codes(result)).toEqual(["unstable-anchor-link"])
    expect(result.issues[0]!.severity).toBe("warning")
  })

  it("stays quiet when the target heading declares its own anchor", () => {
    const result = check({
      "reference.md": "# R\n\n## Over\n\nx\n\n## Over (#second)\n\ny\n",
      "guide.md": "# Guide\n\n[stable](reference.md#second)\n",
    })

    expect(result.issues).toEqual([])
  })

  it("does not mistake an explicit anchor that ends in a number", () => {
    const result = check({
      "reference.md": "# R\n\n## Step (#step-2)\n\nx\n",
      "guide.md": "# Guide\n\n[explicit](reference.md#step-2)\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("options", () => {
  it("drops ignored codes from the result entirely", () => {
    const files = {
      "reference.md": "# R\n\n## Over\n\nx\n\n## Over\n\ny\n",
      "guide.md": "# Guide\n\n[unstable](reference.md#over-1)\n",
    }
    expect(codes(check(files))).toEqual(["unstable-anchor-link"])

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(docs, { recursive: true })
      fs.writeFileSync(path.join(docs, name), content)
    }
    const result = checkReferences(
      buildDocuments({ sourceRoot: docs, outDir: path.join(root, ".cudoc") }),
      { ignore: ["unstable-anchor-link"] },
    )

    expect(result.issues).toEqual([])
  })
})

describe("formatCheckResult", () => {
  it("says so plainly when nothing is wrong", () => {
    const text = formatCheckResult({
      issues: [],
      documentCount: 3,
      checkedReferences: 9,
    })

    expect(text).toBe("checked 9 references in 3 documents; no problems found")
  })

  it("groups by document and summarises the counts", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide\n\n[typo](reference.md#limit)\n",
    })
    const text = formatCheckResult(result)

    expect(text).toContain("guide.md")
    expect(text).toContain("missing-anchor")
    expect(text).toContain("available: #reference, #limits")
    expect(text.trim().endsWith("1 error in 1 of 2 documents")).toBe(true)
  })
})

describe("components a source file imports for itself", () => {
  const CHART = [
    'import Chart from "./chart.jsx"',
    'import { Legend as Key } from "./legend.jsx"',
    "",
    "# Widget (#widget)",
    "",
    "## Live (#live)",
    "",
    "<Chart points={3} />",
    "",
    "<Key />",
    "",
    "## Plain (#plain)",
    "",
    "Prose only.",
    "",
  ].join("\n")
  const embed = (spec: string, imports = "") =>
    `${imports}# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("records what a document imports", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(path.join(root, "docs/widget.mdx"), CHART)
    fs.writeFileSync(path.join(root, "docs/plain.mdx"), "# Plain\n")
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
    })
    expect(library.documents.find((d) => d.id === "widget")!.imports).toEqual([
      "Chart",
      "Key",
    ])
    expect(library.documents.find((d) => d.id === "plain")).not.toHaveProperty(
      "imports",
    )
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, ".cudoc/manifest.json"), "utf8"),
    )
    expect(
      manifest.documents.find((d: { id: string }) => d.id === "widget").imports,
    ).toEqual(["Chart", "Key"])
  })

  it("reports a copied component whose import stays behind", () => {
    const result = check({
      "widget.mdx": CHART,
      "guide.mdx": embed("sources: [widget.mdx#live]"),
    })

    expect(codes(result)).toEqual([
      "unportable-embed-component",
      "imported-embed-component",
    ])
    const imported = result.issues[1]!
    expect(imported.severity).toBe("error")
    expect(imported.message).toContain("<Chart>, <Key>")
    expect(imported.message).toContain("guide has no such import")
  })

  it("stays quiet when the embedding document imports the same names", () => {
    const result = check({
      "widget.mdx": CHART,
      "guide.mdx": embed(
        "sources: [widget.mdx#live]",
        'import Chart from "./chart.jsx"\nimport { Legend as Key } from "./legend.jsx"\n\n',
      ),
    })

    expect(codes(result)).toEqual(["unportable-embed-component"])
  })

  it("says which hosts can render a copied component", () => {
    const files = {
      "widget.mdx": CHART,
      "guide.mdx": embed("sources: [widget.mdx#plain]\nrender: section"),
      "page.mdx": embed("sources: [widget.mdx#live]"),
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true })
      fs.writeFileSync(path.join(root, "docs", name), content)
    }
    const message = (host: "next" | "html") =>
      checkReferences(
        buildDocuments({
          sourceRoot: path.join(root, "docs"),
          outDir: path.join(root, `.cudoc-${host}`),
          host,
        }),
      ).issues.find((issue) => issue.code === "unportable-embed-component")!
        .message
    expect(message("next")).toContain("The host renders them")
    expect(message("html")).toContain("Neither this host")
  })
})

describe("imports read from source", () => {
  it("finds top-level import statements and ignores code and prose", () => {
    const source = [
      'import Chart from "./chart.jsx"',
      "import {",
      "  Legend as Key,",
      "  Axis,",
      '} from "./legend.jsx"',
      'import "./side-effect.css"',
      "",
      "# Title",
      "",
      "import this sentence is prose, not a statement.",
      "",
      "```js",
      'import Ghost from "./ghost.js"',
      "```",
      "",
      "````md",
      "```js",
      'import Nested from "./nested.js"',
      "```",
      "````",
      "",
    ].join("\n")
    expect(importedNamesFromSource(source)).toEqual(["Chart", "Key", "Axis"])
    expect(importedNamesFromSource("# Plain\n")).toEqual([])
  })
})
