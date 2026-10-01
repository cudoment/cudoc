import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import { validateAstContract } from "../src/ast.js"
import { resolveSyntax } from "../src/document.js"
import { collectSections } from "../src/sections.js"
import { buildDocuments, loadLibrary } from "../src/node/library.js"
import {
  resolveDocumentEmbeds,
  resolveEmbed,
  parseEmbedSpec,
  parseEmbedBlock,
} from "../src/node/resolve-embed.js"
import { projectAst, docsDatasetProjection } from "../src/dataset.js"
import { generateDataset } from "../src/node/dataset.js"
import { getNodeText } from "../src/query.js"
import { loadAst } from "../src/node/load-ast.js"

const workspace = (run: (root: string, sourceRoot: string) => void) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-portable-"))
  try {
    const sourceRoot = path.join(root, "docs")
    fs.mkdirSync(sourceRoot)
    run(root, sourceRoot)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
describe("portable Markdown", () => {
  it("reads normalized headings and native HTML without losing block boundaries", () => {
    const tree = compileDocument(
      "## Title (#title) (@New)\n\n<ul><li>one<strong>!</strong></li><li>two</li></ul>\n\n<table><tr><td>a</td><td>b</td></tr></table>",
      { format: "mdx" },
    ).tree
    expect(getNodeText(tree.children)).toBe("Title\none!\ntwo\na\tb")
  })
  it("renders Markdown, braces, nested cell lists, anchors and badges without React", () => {
    const source =
      "## API (#api) (@New)\n\nLiteral {value}.\n\n| Field | Description |\n| --- | --- |\n| id | - {value}<br>-- **nested**<br>- final |"
    const result = compileDocument(source)
    const html = renderDocument(result.tree)
    expect(html).toContain('id="api"')
    expect(html).toContain("cudoc-badge")
    expect(html).toContain("{value}")
    expect(html).toContain("<strong>nested</strong>")
    expect(html).toMatch(/<ul>[\s\S]*<ul>/)
    expect(collectSections(result.tree, { anchors: ["api"] })[0].title).toBe(
      "API",
    )
  })
  it.each(["host", "cudoc", "both"] as const)(
    "selects %s callouts without consuming ordinary blockquotes",
    (mode) => {
      const source =
        "> [!WARNING] **Read** this\n> First line\n> Second line\n>\n> - one\n\n:::note[Native]\n\nNative body\n\n:::\n\n> Ordinary quote"
      const result = compileDocument(source, {
        host: "docusaurus",
        syntax: { callout: mode },
      })
      const ast = JSON.stringify(result.tree)
      expect(ast.includes('"type":"warning"')).toBe(mode !== "host")
      expect(ast.includes('"type":"note"')).toBe(mode !== "cudoc")
      expect(ast).toContain("Ordinary quote")
      if (mode === "both") {
        const html = renderDocument(result.tree)
        expect(html).toContain("<strong>Read</strong> this")
        expect(html).toContain("First line\nSecond line")
        expect(html).toContain("<li>one</li>")
        expect(collectSections(result.tree)).toEqual([])
      }
    },
  )
  it("retains unknown types and code examples, and supports custom registered types", () => {
    const source =
      "> [!SUCCESS] Done\n> body\n\n```md\n> [!WARNING] Example\n```"
    expect(compileDocument(source).diagnostics[0].code).toBe(
      "UNKNOWN_CALLOUT_TYPE",
    )
    expect(
      renderDocument(
        compileDocument(source, { calloutTypes: ["success"] }).tree,
      ),
    ).toContain('data-callout="success"')
  })
  it("normalizes host components without evaluating their code", () => {
    const source =
      '<Infobox type="caution" title="Title">\n\nBody\n\n</Infobox>'
    const tree = compileDocument(source, {
      host: "docs",
      format: "mdx",
      syntax: { callout: "both" },
    }).tree
    expect(renderDocument(tree)).toContain('data-callout="caution"')
    expect(() =>
      renderDocument(compileDocument("<Unknown />", { format: "mdx" }).tree),
    ).toThrow("no portable renderer")
  })
  it("rejects one heading that declares two different IDs", () => {
    expect(() =>
      compileDocument("## Title (#one) {#two}", {
        host: "docusaurus",
        syntax: { headingAnchor: "both" },
      }),
    ).toThrow("conflicting heading")
    expect(() => resolveSyntax({ callout: "off" as never })).toThrow(
      "syntax.callout",
    )
  })
  it("reports two headings sharing an ID instead of failing the compile", () => {
    // Two headings claiming one ID is a problem across a document set, not a
    // malformed heading, so `cudoc check` collects every one at once rather
    // than the compile stopping at the first. Hosts suffix duplicates instead
    // of failing, so throwing here was stricter than the site itself.
    const { diagnostics } = compileDocument("## A (#same)\n\n## B (#same)")

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: "duplicate-heading-id",
      message: "duplicate heading ID: same",
    })
  })
})
describe("stored source and embedding", () => {
  it("collects before resolving, survives loading, rewrites raw Markdown and keeps originals immutable", () =>
    workspace((root, sourceRoot) => {
      const original =
        "# API (#api)\n\n## Limits (#limits)\n\nOriginal **value** and [external section](#other).\n\n### Child (#child)\n\n[local](#child) [reference][r]\n\n## Other (#other)\n\n[r]: https://example.com\n"
      fs.writeFileSync(path.join(sourceRoot, "api.md"), original)
      fs.writeFileSync(
        path.join(sourceRoot, "index.md"),
        '# Index\n\n```cudoc-embed\nsources: [api.md#limits]\nreplace:\n  - find: "**value**"\n    replace: "_replacement_"\n```\n\n```cudoc-embed\nsources: [api.md]\nselect:\n  depth: 2\nrender:\n  type: table\n```',
      )
      const outDir = path.join(root, "library")
      buildDocuments({ sourceRoot, outDir })
      const library = loadLibrary(outDir)
      const before = JSON.stringify(library)
      const html = renderDocument(resolveDocumentEmbeds(library, "index"))
      expect(html).toContain("<em>replacement</em>")
      expect(html).toContain('href="/api#other"')
      expect(html).toContain('href="#embed-1-1-child"')
      expect(html).toContain('href="https://example.com"')
      expect(html).toContain("<table>")
      expect(html).toContain('href="/api#limits"')
      expect(JSON.stringify(library)).toBe(before)
      expect(fs.readFileSync(path.join(sourceRoot, "api.md"), "utf8")).toBe(
        original,
      )
    }))
  it("detects cycles and missing anchors with source context", () =>
    workspace((root, sourceRoot) => {
      fs.writeFileSync(
        path.join(sourceRoot, "a.md"),
        "# A\n\n```cudoc-embed\nsources: [b.md]\n```",
      )
      fs.writeFileSync(
        path.join(sourceRoot, "b.md"),
        "# B\n\n```cudoc-embed\nsources: [a.md]\n```",
      )
      const library = buildDocuments({
        sourceRoot,
        outDir: path.join(root, "library"),
      })
      expect(() => resolveDocumentEmbeds(library, "a")).toThrow(
        /cyclic embed.*b#\*.*a#\*/,
      )
      expect(() =>
        resolveEmbed(
          library,
          { sources: ["b.md#missing"] },
          { documentId: "a" },
        ),
      ).toThrow("missing section")
    }))
  it("rebuilds changed and deleted inputs and rejects extension collisions", () =>
    workspace((root, sourceRoot) => {
      const outDir = path.join(root, "library")
      fs.writeFileSync(path.join(sourceRoot, "a.md"), "# A\n\nfirst")
      fs.writeFileSync(path.join(sourceRoot, "b.md"), "# B")
      buildDocuments({ sourceRoot, outDir })
      fs.writeFileSync(path.join(sourceRoot, "a.md"), "# A\n\nsecond")
      fs.unlinkSync(path.join(sourceRoot, "b.md"))
      buildDocuments({ sourceRoot, outDir })
      expect(loadLibrary(outDir).documents).toHaveLength(1)
      expect(JSON.stringify(loadLibrary(outDir))).toContain("second")
      expect(fs.existsSync(path.join(outDir, "documents/b.json"))).toBe(false)
      fs.writeFileSync(path.join(sourceRoot, "a.mdx"), "# collision")
      expect(() => buildDocuments({ sourceRoot, outDir })).toThrow(
        "duplicate document",
      )
    }))
  it("rejects tampered stored ASTs", () =>
    workspace((root, sourceRoot) => {
      const outDir = path.join(root, "library")
      fs.writeFileSync(path.join(sourceRoot, "a.md"), "# A")
      buildDocuments({ sourceRoot, outDir })
      const file = path.join(outDir, "documents/a.json")
      fs.writeFileSync(
        file,
        fs.readFileSync(file, "utf8").replace('"A"', '"B"'),
      )
      expect(() => loadLibrary(outDir)).toThrow("hash mismatch")
    }))
})
describe("dataset projection", () => {
  it("does not drop content by default and explicitly excludes whole nested components", () => {
    const tree = compileDocument(
      "> paragraph\n\n<Box>\n\n<DocDataEmbed />\n\n</Box>",
      { format: "mdx" },
    ).tree
    const before = JSON.stringify(tree)
    expect(projectAst(tree)).toEqual(tree)
    expect(
      JSON.stringify(projectAst(tree, docsDatasetProjection)),
    ).not.toContain("DocDataEmbed")
    expect(JSON.stringify(tree)).toBe(before)
  })
  it("publishes complete datasets and protects input and unowned directories", () =>
    workspace((root, sourceRoot) => {
      const inputDir = path.join(root, "input"),
        outDir = path.join(root, "dataset")
      fs.mkdirSync(inputDir)
      fs.writeFileSync(
        path.join(inputDir, "a.json"),
        JSON.stringify(compileDocument("# A").tree),
      )
      expect(
        generateDataset({ inputDir, outDir, requireVersion: false })
          .documentCount,
      ).toBe(1)
      expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true)
      expect(() => generateDataset({ inputDir, outDir: inputDir })).toThrow(
        "overlap",
      )
      expect(() => generateDataset({ inputDir, outDir: sourceRoot })).toThrow(
        "unowned",
      )
      fs.writeFileSync(path.join(inputDir, "a.json"), "{broken")
      expect(() => generateDataset({ inputDir, outDir })).toThrow(
        "projection failed",
      )
      expect(
        JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"))
          .documentCount,
      ).toBe(1)
    }))
})

describe("source fidelity and independent embeds", () => {
  it("respects includeChildren:false when recompiling the raw source range", () =>
    workspace((root, sourceRoot) => {
      const source =
        "# Root\n\n## Selected (#selected)\n\n<!-- keep -->\n\n**original**\n\n### Child (#child)\n\nChild body\n"
      fs.writeFileSync(path.join(sourceRoot, "a.md"), source)
      const inputs: string[] = []
      const library = buildDocuments({
        sourceRoot,
        outDir: path.join(root, "data"),
        compilerId: "capture-v1",
        compiler(value, context) {
          inputs.push(value)
          return compileDocument(value, context.options)
        },
      })
      const result = resolveEmbed(
        library,
        {
          sources: ["a.md#selected"],
          select: { includeChildren: false },
          replace: [{ find: "**original**", replace: "_changed_" }],
        },
        { documentId: "index" },
      )
      expect(inputs[1]).toBe(
        "## Selected (#selected)\n\n<!-- keep -->\n\n_changed_\n\n",
      )
      expect(renderDocument(result)).not.toContain("Child")
      expect(renderDocument(result)).toContain("<em>changed</em>")
    }))
  it("avoids destination IDs and keeps separate footnote labels and raw HTML links", () =>
    workspace((root, sourceRoot) => {
      fs.mkdirSync(path.join(sourceRoot, "guide"))
      fs.writeFileSync(
        path.join(sourceRoot, "guide/a.md"),
        '## Selected (#selected)\n\nFootnote[^a] <img src="image.svg" alt="image"> <span id="raw"></span> [raw](#raw)\n\n[^a]: The note\n',
      )
      fs.writeFileSync(
        path.join(sourceRoot, "index.md"),
        "## Existing (#embed-1-selected)",
      )
      const library = buildDocuments({
        sourceRoot,
        outDir: path.join(root, "data"),
      })
      const first = renderDocument(
        resolveEmbed(
          library,
          { sources: ["guide/a.md#selected"] },
          { documentId: "index" },
        ),
      )
      const second = renderDocument(
        resolveEmbed(
          library,
          { sources: ["guide/a.md#selected"] },
          { documentId: "index", prefix: "second" },
        ),
      )
      expect(first).toContain('id="embed-2-selected"')
      expect(first).toContain('src="/guide/image.svg"')
      expect(first).toContain('id="embed-2-raw"')
      expect(first).toContain('href="#embed-2-raw"')
      expect(first).toContain('id="cudoc-index-embed-footnote-label"')
      expect(second).toContain('id="cudoc-index-second-footnote-label"')
      expect(first).toContain('href="#user-content-fn-embed-2-a"')
    }))
  it("preserves dynamic attributes and normalizes host type aliases", () => {
    const result = compileDocument("<Infobox type={type}>Body</Infobox>", {
      format: "mdx",
      host: "docs",
      syntax: { callout: "both" },
    })
    expect(result.diagnostics[0].code).toBe("DYNAMIC_COMPONENT")
    expect(JSON.stringify(result.tree)).toContain('"value":"type"')
    const canonical = compileDocument(
      ":::danger[Title]{#alert}\n\nBody\n\n:::",
      { host: "docusaurus", syntax: { callout: "both" } },
    )
    expect(renderDocument(canonical.tree)).toContain('data-callout="caution"')
    expect(renderDocument(canonical.tree)).toContain('id="alert"')
    const nextra = compileDocument("## Title [#native]", {
      host: "nextra",
      syntax: { headingAnchor: "host" },
    })
    expect(collectSections(nextra.tree)[0].anchorId).toBe("native")
  })
})

it("lays out component-free tables and validates their semantic cell lists", () => {
  const tree = compileDocument(
    "### Requirements (@New)\n\n| Method | Value (@Old) |\n| --- | ---: |\n| GET | - a<br>- b<br>- c<br>- d |",
    {
      tableColumnLayout: [
        { section: { titles: ["Requirements"] }, columnHeaders: ["Value"] },
      ],
    },
  ).tree
  const html = renderDocument(tree)
  expect(html).toContain('colspan="2"')
  expect(html).toContain("text-align:right")
  const lists: { type: string; spread?: boolean; children?: unknown[] }[] = []
  const walk = (node: {
    type: string
    spread?: boolean
    children?: unknown[]
  }) => {
    if (node.type === "list") lists.push(node)
    node.children?.forEach((child) => walk(child as typeof node))
  }
  walk(tree)
  expect(lists.length).toBeGreaterThan(0)
  lists[0].spread = true
  expect(() => validateAstContract(tree)).toThrow("table list spread")
})

describe("embed spec validation", () => {
  const spec = (body: string) => () => parseEmbedSpec(body)
  const rule = (extra: string) =>
    spec(`sources: [a.md]\nreplace:\n  - find: "a"\n    replace: "b"\n${extra}`)

  it("names the key a typo produced and what was expected instead", () => {
    // `regexp` used to pass, turning a pattern into a literal that matches
    // nothing. Nothing later in the pipeline said so.
    expect(rule("    regexp: true\n")).toThrow('unknown key "regexp"')
    expect(rule("    regexp: true\n")).toThrow("find, replace, regex, flags")
  })

  it("rejects flags that cannot do anything", () => {
    expect(rule('    flags: "gi"\n')).toThrow("no effect without regex: true")
    expect(rule('    regex: true\n    flags: "gi"\n')).not.toThrow()
  })

  it("separates the ways a rule can be wrong", () => {
    expect(
      spec('sources: [a.md]\nreplace:\n  - find: ""\n    replace: "b"\n'),
    ).toThrow("replace[0].find must be a non-empty string")
    expect(spec('sources: [a.md]\nreplace:\n  - find: "a"\n')).toThrow(
      "replace[0].replace must be a string",
    )
    expect(
      spec('sources: [a.md]\nreplace:\n  - fnd: "a"\n    replace: "b"\n'),
    ).toThrow('unknown key "fnd"')
    expect(spec("sources: [a.md]\nreplace: not-a-list\n")).toThrow(
      "replace must be an array of rules",
    )
  })

  it("lists the known keys at every level, not just two of them", () => {
    expect(spec("sources: [a.md]\nreplaces: []\n")).toThrow(
      "Known options: sources, select, render, replace",
    )
    expect(spec("sources: [a.md]\nselect:\n  anchor: [x]\n")).toThrow(
      "Known selections: anchors, titles, depth, includeChildren",
    )
  })

  it("names the document and block a bad spec came from", () => {
    // A bare parser error says `line 3, column 17` and stops there, which is
    // not enough to find the block in a repository of documents.
    expect(() =>
      parseEmbedBlock(
        'sources: [a.md]\nreplace:\n  - find: "**x**\n',
        "guide",
        2,
      ),
    ).toThrow(/guide, embed block 2, line \d+, column \d+: Missing closing/)
    expect(() => parseEmbedBlock("sources: []\n", "guide", 1)).toThrow(
      "cudoc: guide, embed block 1:",
    )
  })
})

describe("a document that repeats a heading id", () => {
  const SOURCE =
    "# Guide\n\n## One (#dup)\n\nfirst body\n\n## Two (#dup)\n\nsecond body\n"

  it("gives every repeated heading its own section", () => {
    const { tree, diagnostics } = compileDocument(SOURCE)
    expect(diagnostics.map((d) => d.code)).toContain("duplicate-heading-id")
    const sections = collectSections(tree, { depth: 2 })
    expect(sections.map((s) => s.title)).toEqual(["One", "Two"])
    expect(
      sections.map((s) => getNodeText(s.tree.children.slice(1) as never)),
    ).toEqual(["first body", "second body"])
  })

  it("records the first section's source range, the one a link reaches", () =>
    workspace((root, sourceRoot) => {
      fs.writeFileSync(path.join(sourceRoot, "guide.md"), SOURCE)
      const library = buildDocuments({
        sourceRoot,
        outDir: path.join(root, "library"),
      })
      const range = library.documents.find((d) => d.id === "guide")!.source
        .sections.dup!
      expect(SOURCE.slice(range.start, range.end)).toBe(
        "## One (#dup)\n\nfirst body\n\n",
      )
    }))

  it("copies each section once, and refuses to rewrite one it cannot tell apart", () =>
    workspace((root, sourceRoot) => {
      fs.writeFileSync(path.join(sourceRoot, "guide.md"), SOURCE)
      fs.writeFileSync(
        path.join(sourceRoot, "copied.md"),
        "# Copied\n\n```cudoc-embed\nsources: [guide.md#dup]\n```\n",
      )
      fs.writeFileSync(
        path.join(sourceRoot, "replaced.md"),
        '# Replaced\n\n```cudoc-embed\nsources: [guide.md#dup]\nreplace:\n  - find: "body"\n    replace: "copy"\n```\n',
      )
      const library = buildDocuments({
        sourceRoot,
        outDir: path.join(root, "library"),
      })
      const copied = renderDocument(resolveDocumentEmbeds(library, "copied"))
      expect(copied.match(/first body/g)).toHaveLength(1)
      expect(copied.match(/second body/g)).toHaveLength(1)
      // The snapshot has one range per id, so the second heading's source is
      // not there to rewrite; copying the first twice would be silent.
      expect(() => resolveDocumentEmbeds(library, "replaced")).toThrow(
        "cudoc: guide gives #dup to 2 headings, so a replace rule cannot tell which section to rewrite; give them distinct ids",
      )
    }))
})

describe("replacement in a section that starts inside another block", () => {
  const embed = (source: string, find?: string) =>
    `# Page\n\n\`\`\`cudoc-embed\nsources: [${source}]${find ? `\nreplace:\n  - find: "${find}"\n    replace: "Beta"` : ""}\n\`\`\`\n`
  const collect = (
    root: string,
    sourceRoot: string,
    files: Record<string, string>,
  ) => {
    for (const [name, text] of Object.entries(files))
      fs.writeFileSync(path.join(sourceRoot, name), text)
    return buildDocuments({ sourceRoot, outDir: path.join(root, "library") })
  }

  it("is refused in a quote, matching or not, since the quote's marks stay in its text", () =>
    workspace((root, sourceRoot) => {
      const library = collect(root, sourceRoot, {
        "reference.md": "# Reference\n\n> ## Quote (#quote)\n>\n> Alpha\n",
        "copied.md": embed("reference.md#quote"),
        "replaced.md": embed("reference.md#quote", "Alpha"),
        "unmatched.md": embed("reference.md#quote", "Gamma"),
      })
      // Without rules the section is the collected tree: its heading and its
      // paragraph, out of the quote.
      expect(
        resolveDocumentEmbeds(library, "copied").children.map((n) => n.type),
      ).toEqual(["heading", "heading", "paragraph"])
      // Its text starts after the first line's `>` and keeps the others', so
      // compiled again it would put the paragraph back in a quote.
      for (const id of ["replaced", "unmatched"])
        expect(() => resolveDocumentEmbeds(library, id), id).toThrow(
          "cudoc: reference#quote starts inside a quote, and the `>` marks stay on the lines after its heading, so a replace rule cannot rewrite it; move the heading out of the quote, or embed the section without replace",
        )
    }))

  it("rewrites a section in a list item with the item's marks and indentation taken off", () =>
    workspace((root, sourceRoot) => {
      const library = collect(root, sourceRoot, {
        "reference.md":
          "# Reference\n\n- ## Shallow (#shallow)\n\n  Alpha\n\n1. Step\n\n   - ## Deep (#deep)\n\n     Alpha\n\n* ## Wide (#wide)\n\n    Alpha\n\n- ## Nested (#nested)\n\n  Alpha\n\n  - Step one\n\n    Details of step one.\n\n  ```sh\n  run\n  ```\n\n- Item\n\n   ## Later (#later)\n\n  Alpha\n\n      code()\n\n## Top (#top)\n\n> Alpha\n",
        ...Object.fromEntries(
          ["shallow", "deep", "wide", "nested", "later", "top"].map((id) => [
            `${id}.md`,
            embed(`reference.md#${id}`, "Alpha"),
          ]),
        ),
        ...Object.fromEntries(
          ["shallow", "deep", "wide", "nested", "later", "top"].map((id) => [
            `${id}-copy.md`,
            embed(`reference.md#${id}`),
          ]),
        ),
      })
      const shape = (node: { type: string; children?: unknown[] }): unknown => [
        node.type,
        ...(node.children ?? []).map((child) => shape(child as typeof node)),
      ]
      for (const id of ["shallow", "deep", "wide", "nested", "later", "top"]) {
        const replaced = resolveDocumentEmbeds(library, id)
        // The same structure as the section copied without rules: four
        // spaces two past the item's column are its paragraph, not code.
        expect(shape(replaced), id).toEqual(
          shape(resolveDocumentEmbeds(library, `${id}-copy`)),
        )
        expect(getNodeText(replaced.children), id).toContain("Beta")
        expect(getNodeText(replaced.children), id).not.toContain("Alpha")
      }
    }))

  it("rewrites a section inside a component, but not the last one, which runs into the closing tag", () =>
    workspace((root, sourceRoot) => {
      const library = collect(root, sourceRoot, {
        "reference.mdx":
          "# Reference\n\n<Note>\n\n## Alpha (#alpha)\n\nAlpha text.\n\n## Last (#last)\n\nAlpha text.\n\n</Note>\n",
        "first.md": embed("reference.mdx#alpha", "Alpha"),
        "last.md": embed("reference.mdx#last", "Alpha"),
      })
      const first = resolveDocumentEmbeds(library, "first")
      expect(first.children.map((n) => n.type)).toEqual([
        "heading",
        "heading",
        "paragraph",
      ])
      expect(getNodeText(first.children)).toContain("Beta text.")
      expect(() => resolveDocumentEmbeds(library, "last")).toThrow(
        "cudoc: reference#last starts inside a component, and its text runs into the line that closes that block,",
      )
    }))
})

describe("a relative path in an embedded copy that climbs out of the collection", () => {
  it("names the same file from the page it lands on, however far it climbs", () =>
    workspace((root, sourceRoot) => {
      const climb = "../".repeat(12)
      fs.mkdirSync(path.join(sourceRoot, "internal"))
      fs.writeFileSync(
        path.join(sourceRoot, "internal/notes.md"),
        `# Notes\n\n## Keep (#keep)\n\n![o](../../outside%20file.png) ![d](${climb}deep.png) [s](../../shared/)\n`,
      )
      fs.writeFileSync(
        path.join(sourceRoot, "guide.md"),
        "# Guide\n\n```cudoc-embed\nsources: [internal/notes.md#keep]\n```\n",
      )
      const outDir = path.join(root, "library")
      const urls = (library: Parameters<typeof resolveDocumentEmbeds>[0]) => {
        const found: string[] = []
        const walk = (node: { url?: string; children?: unknown[] }) => {
          if (typeof node.url === "string") found.push(node.url)
          node.children?.forEach((child) => walk(child as typeof node))
        }
        walk(resolveDocumentEmbeds(library, "guide") as never)
        return found
      }
      // With its roots, from the files' own directories.
      expect(urls(buildDocuments({ sourceRoot, outDir }))).toEqual([
        "../outside%20file.png",
        expect.stringMatching(/^(\.\.\/)+deep\.png$/),
        // A directory keeps the slash that names its index.
        "../shared/",
      ])
      // Without them, from the library paths alone, never clamped at the
      // working directory however deep the climb.
      expect(urls(loadLibrary(outDir))).toEqual([
        "../outside%20file.png",
        `${"../".repeat(11)}deep.png`,
        "../shared/",
      ])
    }))
})

describe("links without a path in an embedded copy", () => {
  it("point at the document they were copied from, not its directory", () =>
    workspace((root, sourceRoot) => {
      fs.mkdirSync(path.join(sourceRoot, "guide"))
      fs.writeFileSync(
        path.join(sourceRoot, "guide/intro.md"),
        "# Intro\n\n## Tabs (#tabs)\n\n[query](?tab=1) and [here]() and [top](#tabs)\n",
      )
      fs.writeFileSync(
        path.join(sourceRoot, "index.md"),
        "# Index\n\n```cudoc-embed\nsources: [guide/intro.md#tabs]\n```\n",
      )
      const library = buildDocuments({
        sourceRoot,
        outDir: path.join(root, "library"),
      })
      const html = renderDocument(resolveDocumentEmbeds(library, "index"))
      expect(html).toContain('href="/guide/intro?tab=1"')
      expect(html).toContain('href="/guide/intro"')
      expect(html).not.toContain('href="/guide?tab=1"')
    }))
})

describe("names that only mean something at the top of a directory", () => {
  it("keeps a document called manifest or meta below the top in the dataset", () =>
    workspace((root, sourceRoot) => {
      fs.mkdirSync(path.join(sourceRoot, "android"))
      fs.writeFileSync(path.join(sourceRoot, "android/manifest.md"), "# M\n")
      fs.writeFileSync(path.join(sourceRoot, "android/meta.md"), "# Meta\n")
      fs.writeFileSync(path.join(sourceRoot, "index.md"), "# Index\n")
      const library = path.join(root, "library")
      buildDocuments({ sourceRoot, outDir: library })
      const dataset = generateDataset({
        inputDir: path.join(library, "documents"),
        outDir: path.join(root, "dataset"),
        library,
      })
      expect(dataset.documents.map((d) => d.id).sort()).toEqual([
        "android/manifest",
        "android/meta",
        "index",
      ])
    }))

  it("refuses a stored document path that climbs out of the output", () =>
    workspace((root) => {
      fs.writeFileSync(path.join(root, "outside.json"), "{}")
      expect(() =>
        loadAst("../../outside", { cwd: root, outDir: ".cudoc/ast" }),
      ).toThrow(/escapes document root/)
    }))
})
