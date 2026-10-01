/**
 * Trees an embed draws from folders and headings: which document hangs under
 * which, how deep a tree goes, what each line says and in what order, how the
 * web and paper show it, and what the checker and an incremental preparation
 * make of it.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { DocumentNode } from "../src/document.js"
import { buildDocuments, type Library } from "../src/node/library.js"
import {
  parseEmbedSpec,
  resolveEmbed,
  resolveTree,
  type TableExtractor,
  type TreeNode,
} from "../src/node/resolve-embed.js"
import { prepareEmbeds } from "../src/node/prepare-embeds.js"
import { checkReferences } from "../src/node/check.js"
import { formatCheckResult } from "../src/node/report.js"
import { renderDocument } from "../src/render.js"
import { compareNames } from "../src/node/tree.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const workspace = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-tree-"))
  temporary.push(root)
  const docs = path.join(root, "docs")
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
    fs.writeFileSync(path.join(docs, name), content)
  }
  return { docs, outDir: path.join(root, "library") }
}

const build = (
  files: Record<string, string>,
  extractors?: Record<string, TableExtractor>,
  routes?: Record<string, string>,
  hidden?: string[],
): Library => {
  const { docs, outDir } = workspace(files)
  return buildDocuments({
    sourceRoot: docs,
    outDir,
    ...(extractors ? { extractors } : {}),
    ...(routes ? { routes } : {}),
    ...(hidden ? { private: hidden } : {}),
  })
}

const page = (title: string, summary = `${title} summary.`) =>
  `# ${title}\n\n${summary}\n`

/** The outline as `[level, name]` pairs, depth first. */
const outline = (nodes: TreeNode[]): [number, string][] =>
  nodes.flatMap((node) => [
    [node.level, node.name] as [number, string],
    ...outline(node.children),
  ])

const tree = (library: Library, yaml: string, documentId = "index") =>
  resolveTree(library, parseEmbedSpec(yaml), { documentId })

const html = (library: Library, yaml: string, documentId = "index") =>
  renderDocument(resolveEmbed(library, parseEmbedSpec(yaml), { documentId }))

describe("what hangs under what", () => {
  it("puts the documents of X/ under X.md, as an outliner keeps pages", () => {
    const library = build({
      "index.md": page("Home"),
      "Alpha.md": page("Alpha"),
      "Alpha/Child.md": page("Child"),
      "Alpha/Child/Grandchild.md": page("Grandchild"),
      "Beta.md": page("Beta"),
    })
    expect(
      outline(tree(library, "sources: [/]\nrender: { type: tree }\n")),
    ).toEqual([
      [1, "Alpha"],
      [2, "Child"],
      [3, "Grandchild"],
      [1, "Beta"],
    ])
  })

  it("lets X/index.md stand for its folder, as a static site generator does", () => {
    const library = build({
      "index.md": page("Home"),
      "guide/index.md": page("Guide"),
      "guide/install.md": page("Install"),
      "guide/advanced/index.md": page("Advanced"),
      "guide/advanced/tuning.md": page("Tuning"),
    })
    const nodes = tree(library, "sources: [/]\nrender: { type: tree }\n")
    expect(outline(nodes)).toEqual([
      [1, "guide"],
      [2, "advanced"],
      [3, "tuning"],
      [2, "install"],
    ])
    expect(nodes[0]).toMatchObject({
      id: "guide/index",
      title: "Guide",
      url: "/guide/",
      sourcePath: "guide/index.md",
    })
    // A folder source starts below the folder's own document.
    expect(
      outline(tree(library, "sources: [/guide/]\nrender: { type: tree }\n")),
    ).toEqual([
      [1, "advanced"],
      [2, "tuning"],
      [1, "install"],
    ])
  })

  it("passes through a folder nothing stands for, to the nearest node above", () => {
    const library = build({
      "index.md": page("Home"),
      "projects/Side.md": page("Side"),
      "projects/Main.md": page("Main"),
      "projects/Main/archive/Old.md": page("Old"),
      "areas/Health.md": page("Health"),
    })
    expect(
      outline(tree(library, "sources: [/]\nrender: { type: tree }\n")),
    ).toEqual([
      [1, "Health"],
      [1, "Main"],
      [2, "Old"],
      [1, "Side"],
    ])
    expect(
      outline(tree(library, "sources: [/projects/]\nrender: { type: tree }\n")),
    ).toEqual([
      [1, "Main"],
      [2, "Old"],
      [1, "Side"],
    ])
  })

  it("puts X/index.md under X.md when both exist", () => {
    // Both would be served at /X, so one of them is routed elsewhere.
    const library = build(
      {
        "index.md": page("Home"),
        "X.md": page("X"),
        "X/index.md": page("X index"),
        "X/item.md": page("Item"),
      },
      undefined,
      { "X/index": "/x-index" },
    )
    expect(
      tree(library, "sources: [/]\nrender: { type: tree }\n").map((node) => [
        node.id,
        node.children.map((child) => child.id),
      ]),
      // Siblings by title: "Item" before "X index".
    ).toEqual([["X", ["X/item", "X/index"]]])
  })

  it("holds every level of a chain deeper than six, and stops at depth", () => {
    const files: Record<string, string> = { "index.md": page("Home") }
    let folder = ""
    for (let level = 1; level <= 8; level++) {
      files[`${folder}L${level}.md`] = page(`L${level}`)
      folder = `${folder}L${level}/`
    }
    const library = build(files)
    const all = outline(tree(library, "sources: [/]\nrender: { type: tree }\n"))
    expect(all).toEqual(
      Array.from({ length: 8 }, (_, i) => [i + 1, `L${i + 1}`]),
    )
    expect(
      outline(
        tree(library, "sources: [/]\nrender: { type: tree, depth: 3 }\n"),
      ),
    ).toEqual([
      [1, "L1"],
      [2, "L2"],
      [3, "L3"],
    ])
  })

  it("starts from a document, or from one of its sections", () => {
    const library = build({
      "index.md": page("Home"),
      "ref.md":
        "# Reference\n\nAll of it.\n\n## Limits (#limits)\n\nLimit text.\n\n### Burst (#burst)\n\nBurst text.\n\n## Auth (#auth)\n\nAuth text.\n",
      "ref/extra.md": page("Extra"),
    })
    expect(
      outline(tree(library, "sources: [ref.md]\nrender: { type: tree }\n")),
    ).toEqual([
      [1, "ref"],
      [2, "extra"],
    ])
    const section = tree(
      library,
      "sources: [ref.md#limits]\nrender: { type: tree, headings: 2 }\n",
    )
    expect(outline(section)).toEqual([
      [1, "Limits"],
      [2, "Burst"],
    ])
    expect(section[0]).toMatchObject({
      id: "ref#limits",
      kind: "heading",
      anchorId: "limits",
      url: "/ref#limits",
      cells: [{ text: "Limits", url: "/ref#limits" }, { text: "Limit text." }],
    })
  })
})

describe("headings", () => {
  const library = () =>
    build({
      "index.md": page("Home"),
      "guide.md": [
        "# Guide",
        "",
        "Guide summary.",
        "",
        "## Install (#install)",
        "",
        "Install text.",
        "",
        "### macOS (#macos)",
        "",
        "#### Brew (#brew)",
        "",
        "Brew text.",
        "",
        "## Use (#use)",
        "",
        "##### Deep (#deep)",
        "",
      ].join("\n"),
      "guide/faq.md": page("FAQ"),
    })

  it("nests a document's sections under it, before the documents below it", () => {
    const nodes = tree(
      library(),
      "sources: [guide.md]\nrender: { type: tree, headings: 4 }\n",
    )
    expect(outline(nodes)).toEqual([
      [1, "guide"],
      [2, "Install"],
      [3, "macOS"],
      [4, "Brew"],
      [2, "Use"],
      // A skipped level nests under the nearest shallower heading.
      [3, "Deep"],
      [2, "faq"],
    ])
    // The `#` title names the document's line and is not a line of its own.
    expect(nodes[0]!.title).toBe("Guide")
  })

  it("takes only the heading levels asked for, and none past depth", () => {
    expect(
      outline(
        tree(
          library(),
          "sources: [guide.md]\nrender: { type: tree, headings: 1 }\n",
        ),
      ),
    ).toEqual([
      [1, "guide"],
      [2, "Install"],
      [2, "Use"],
      [2, "faq"],
    ])
    // A heading past depth leaves out the ones under it, not just itself.
    expect(
      outline(
        tree(
          library(),
          "sources: [guide.md]\nrender: { type: tree, headings: 4, depth: 2 }\n",
        ),
      ),
    ).toEqual([
      [1, "guide"],
      [2, "Install"],
      [2, "Use"],
      [2, "faq"],
    ])
  })
})

describe("order", () => {
  const library = () =>
    build({
      "index.md": page("Home"),
      "alpha.md": page("Alpha"),
      "beta.md": page("Beta"),
      "gamma.md": page("Gamma"),
      "done.md": page("Done"),
    })
  const names = (yaml: string) =>
    tree(library(), yaml).map((node) => node.title)

  it("sorts by title when nothing is given", () => {
    expect(names("sources: [/]\nrender: { type: tree }\n")).toEqual([
      "Alpha",
      "Beta",
      "Done",
      "Gamma",
    ])
  })

  it("puts the names it lists first, with ... standing for the rest", () => {
    expect(
      names(
        "sources: [/]\nrender:\n  type: tree\n  order: [gamma, ..., Done]\n",
      ),
    ).toEqual(["Gamma", "Alpha", "Beta", "Done"])
    // Without ... the rest follows the names it lists.
    expect(
      names("sources: [/]\nrender:\n  type: tree\n  order:\n    - Beta\n"),
    ).toEqual(["Beta", "Alpha", "Done", "Gamma"])
  })

  it("orders the first level only", () => {
    const nodes = tree(
      build({
        "index.md": page("Home"),
        "a.md": page("A"),
        "a/z.md": page("Z"),
        "a/y.md": page("Y"),
      }),
      "sources: [/]\nrender:\n  type: tree\n  order: [Z, ...]\n",
    )
    expect(nodes[0]!.children.map((node) => node.title)).toEqual(["Y", "Z"])
  })

  it("compares by code point, not by UTF-16 unit", () => {
    // U+1F600 is two units starting at 0xD83D, below U+FF21's 0xFF21.
    expect(compareNames("😀", "Ａ")).toBe(1)
    expect(compareNames("Ａ", "😀")).toBe(-1)
  })

  it("sorts case-insensitively, numbers by value and Hangul in dictionary order", () => {
    const sorted = [
      "나무",
      "step 10",
      "Apple",
      "step 2",
      "가지",
      "banana",
    ].sort(compareNames)
    expect(sorted).toEqual([
      "Apple",
      "banana",
      "step 2",
      "step 10",
      "가지",
      "나무",
    ])
  })
})

describe("what a line says", () => {
  it("links the title to the node and adds the first paragraph after the title", () => {
    const library = build({
      "index.md": page("Home"),
      "note.md": "status:: active\n\n# Note\n\nThe summary.\n\nThe body.\n",
      "titled.md": "---\ntitle: From front matter\n---\n\nIntro paragraph.\n",
      "bare.md": "No heading here.\n",
    })
    const nodes = tree(library, "sources: [/]\nrender: { type: tree }\n")
    expect(
      nodes.map((node) => [node.title, node.cells.map((cell) => cell.text)]),
    ).toEqual([
      ["bare", ["bare", "No heading here."]],
      ["From front matter", ["From front matter", "Intro paragraph."]],
      // A property line above the title is not the summary.
      ["Note", ["Note", "The summary."]],
    ])
    expect(nodes[2]!.cells[0]!.url).toBe("/note")
  })

  it("finds the title inside a header element, where Docusaurus puts it", () => {
    const library = build({
      "index.md": page("Home"),
      "wrapped.mdx": "<header>\n\n# Wrapped\n\n</header>\n\nThe summary.\n",
    })
    expect(
      tree(library, "sources: [wrapped.mdx]\nrender: { type: tree }\n")[0],
    ).toMatchObject({
      title: "Wrapped",
      cells: [{ text: "Wrapped" }, { text: "The summary." }],
    })
  })

  it("takes the table's columns, and joins what is not empty with a dot", () => {
    const library = build({
      "index.md": page("Home"),
      "api.md":
        "# API\n\n## Charge (#charge)\n\n| Method | URL |\n| --- | --- |\n| POST | /v1/charges |\n",
    })
    const yaml =
      "sources: [api.md]\nrender:\n  type: tree\n  headings: 1\n  columns:\n    - title\n    - { value: { row: 1, column: 0 } }\n    - { value: parent, link: parent }\n"
    const nodes = tree(library, yaml)
    expect(nodes[0]!.children[0]!.cells).toEqual([
      { text: "Charge" },
      { text: "POST" },
      { text: "API", url: "/api#api" },
    ])
    // The document's line reads the table in its section, as a table row
    // for the whole document would, and has no heading above it.
    expect(html(library, yaml)).toContain("<summary>API · POST</summary>")
    expect(html(library, yaml)).toContain(
      'Charge · POST · <a href="/api#api">API</a>',
    )
  })

  it("hands an extractor the node with its children done, so it can total them", () => {
    const open = (library: Library, id: string) =>
      (
        library.documents
          .find((d) => d.id === id)!
          .source.text.match(/^- TODO /gm) ?? []
      ).length
    const seen: string[] = []
    const extractors: Record<string, TableExtractor> = {
      tasks: {
        version: "1",
        extract(row, { library, node }) {
          seen.push(node!.id)
          // Every child's own cell is already there to add up.
          const below = node!.children.reduce(
            (sum, child) => sum + Number(child.cells[1]?.text || 0),
            0,
          )
          const total = open(library, row.document.id) + below
          return total ? String(total) : undefined
        },
      },
    }
    const library = build(
      {
        "index.md": page("Home"),
        "a.md": "# A\n\nA.\n\n- TODO one\n",
        "a/b.md": "# B\n\nB.\n\n- TODO two\n- TODO three\n",
        "a/b/c.md": "# C\n\nC.\n\n- TODO four\n",
        "d.md": "# D\n\nD.\n",
      },
      extractors,
    )
    const yaml =
      "sources: [/]\nrender:\n  type: tree\n  columns: [link, { value: { extractor: tasks } }]\n"
    const nodes = tree(library, yaml)
    expect(seen).toEqual(["a/b/c", "a/b", "a", "d"])
    expect(nodes.map((node) => node.cells[1]!.text)).toEqual(["4", ""])
    expect(nodes[0]!.children[0]!.cells[1]!.text).toBe("3")
    // The empty cell is left out of the line rather than shown as a dot.
    expect(html(library, yaml)).toContain(
      '<li class="cudoc-tree-leaf"><a href="/d">D</a></li>',
    )
  })
})

describe("private documents", () => {
  const library = () => {
    const { docs, outDir } = workspace({
      "index.md": page("Home"),
      "notes/a.md": page("A"),
      "notes/a/b.md": page("B"),
      "notes/secret.md": page("Secret"),
      "notes/secret/below.md": page("Below"),
      "internal/map.md": page("Map"),
    })
    return buildDocuments({
      sourceRoot: docs,
      outDir,
      private: ["notes/secret.md", "internal/**"],
    })
  }
  const names = (documentId: string, sources = "[/notes/]") =>
    outline(
      tree(
        library(),
        `sources: ${sources}\nrender: { type: tree }\n`,
        documentId,
      ),
    ).map(([, name]) => name)

  it("leaves a private document and the lines under it off a public page", () => {
    expect(names("index")).toEqual(["a", "b"])
  })

  it("fails on a folder whose documents a public page would all leave out", () => {
    const library = build(
      { "index.md": page("Home"), "vault/a.md": page("A") },
      undefined,
      undefined,
      ["vault/**"],
    )
    expect(() =>
      tree(library, "sources: [/vault/]\nrender: { type: tree }\n"),
    ).toThrow(
      "folder /vault/ referenced from index holds only private documents, which a tree on index leaves out",
    )
  })

  it("lists them on a private page, and anywhere when named as a source", () => {
    expect(names("internal/map")).toEqual(["a", "b", "secret", "below"])
    expect(names("index", "[/notes/secret]")).toEqual(["secret", "below"])
  })
})

describe("the web and paper", () => {
  const library = () =>
    build({
      "index.md": page("Home"),
      "a.md": page("A"),
      "a/b.md": page("B"),
      "a/b/c.md": page("C"),
      "a/b/c/d.md": page("D"),
    })

  it("folds levels in details and opens them down to open", () => {
    const output = html(library(), "sources: [/]\nrender: { type: tree }\n")
    expect(output).toMatch(/^<ul class="cudoc-tree">/)
    expect(output.match(/<details open>/g)).toHaveLength(1)
    expect(output.match(/<details>/g)).toHaveLength(2)
    expect(output).toContain(
      '<summary><a href="/a">A</a> · A summary.</summary>',
    )
    expect(
      html(library(), "sources: [/]\nrender: { type: tree, open: 0 }\n"),
    ).not.toContain("<details open>")
    expect(
      html(library(), "sources: [/]\nrender: { type: tree, open: 9 }\n").match(
        /<details open>/g,
      ),
    ).toHaveLength(3)
  })

  it("marks how many levels paper shows, and nothing when it shows them all", () => {
    expect(
      html(library(), "sources: [/]\nrender: { type: tree, print: 2 }\n"),
    ).toMatch(/^<ul class="cudoc-tree" data-cudoc-print="2">/)
    const resolved = resolveEmbed(
      library(),
      parseEmbedSpec("sources: [/]\nrender: { type: tree }\n"),
      { documentId: "index" },
    )
    const list = resolved.children[0] as unknown as DocumentNode
    expect(list.data?.cudoc?.kind).toBe("tree")
    expect(list.data?.hProperties).toEqual({ className: ["cudoc-tree"] })
  })
})

describe("the specification", () => {
  it.each([
    [
      "render:\n  type: tree\n  collapse: 1\n",
      'render: unknown key "collapse". Known keys: type, open, print, depth, headings, order, columns',
    ],
    [
      "render:\n  type: tree\n  open: -1\n",
      "render.open must be an integer of at least 0",
    ],
    [
      "render:\n  type: tree\n  print: 0\n",
      "render.print must be an integer of at least 1",
    ],
    [
      "render:\n  type: tree\n  depth: 1.5\n",
      "render.depth must be an integer of at least 1",
    ],
    [
      "render:\n  type: tree\n  headings: 6\n",
      "render.headings must be an integer from 0 to 5",
    ],
    [
      "render:\n  type: tree\n  order: Alpha\n",
      "render.order must be a list of names",
    ],
    [
      "render:\n  type: tree\n  order: [A, ..., B, ...]\n",
      "render.order has ... twice",
    ],
    [
      "render:\n  type: tree\n  order: [A, A]\n",
      'render.order names "A" twice',
    ],
    [
      "render:\n  type: tree\n  columns: [title, outline]\n",
      'unknown column "outline"',
    ],
    [
      "render:\n  type: tree\nselect:\n  depth: 2\n",
      "select does not apply to a tree",
    ],
    [
      "render:\n  type: tree\nreplace:\n  - { find: a, replace: b }\n",
      "replace does not apply to a tree",
    ],
    [
      "render:\n  type: graph\n",
      'render must be "section" or a mapping with type: table or type: tree',
    ],
  ])("rejects %j", (yaml, message) => {
    expect(() => parseEmbedSpec(`sources: [/]\n${yaml}`)).toThrow(message)
  })

  it("names what is wrong with a source", () => {
    const library = build({
      "index.md": page("Home"),
      "guide/index.md": page("Guide"),
      "guide/a.md": page("A"),
      "empty/notes.txt": "",
    })
    const fails = (source: string) => () =>
      tree(library, `sources: [${source}]\nrender: { type: tree }\n`)
    expect(fails("/nowhere/")).toThrow(
      "no documents in folder /nowhere/ referenced from index",
    )
    expect(fails("/guide/#a")).toThrow("a folder source takes no anchor")
    expect(fails("../")).toThrow("embed source escapes root")
    expect(fails("/guide/index/")).toThrow("no documents in folder")
    expect(fails("/guide/a/")).toThrow("no documents in folder")
    // A document path that is a folder says how to name the folder.
    expect(fails("guide")).toThrow(
      "missing document guide referenced from index; a folder source ends with /, as in guide/",
    )
    expect(() =>
      resolveTree(library, parseEmbedSpec("sources: [/]\n"), {
        documentId: "index",
      }),
    ).toThrow("resolveTree needs an embed whose render is a tree")
  })

  it("resolves ./ and ../ from the embedding document", () => {
    const library = build({
      "index.md": page("Home"),
      "guide/index.md": page("Guide"),
      "guide/a.md": page("A"),
      "other.md": page("Other"),
    })
    expect(
      outline(
        tree(library, "sources: [./]\nrender: { type: tree }\n", "guide/a"),
      ),
    ).toEqual([[1, "a"]])
    expect(
      outline(
        tree(library, "sources: [../]\nrender: { type: tree }\n", "guide/a"),
      ),
    ).toEqual([
      [1, "guide"],
      [2, "a"],
      [1, "other"],
    ])
  })
})

describe("what a tree depends on", () => {
  const files = {
    "index.md":
      "# Home\n\n```cudoc-embed\nsources: [/notes/]\nrender: { type: tree }\n```\n",
    "notes/a.md": page("A"),
    "notes/a/b.md": page("B"),
    "other.md": page("Other"),
  }

  it("lists every document a line came from", () => {
    const resolved = resolveEmbed(
      build(files),
      parseEmbedSpec("sources: [/notes/]\nrender: { type: tree }\n"),
      { documentId: "index" },
    )
    expect(resolved.data?.cudocDependencies).toEqual(["notes/a", "notes/a/b"])
  })

  it("is resolved again when a document below it changes, and only then", async () => {
    const { docs, outDir } = workspace(files)
    const library = buildDocuments({ sourceRoot: docs, outDir })
    const first = await prepareEmbeds(library, outDir)
    const key = Object.keys(first.blocks).find((k) => k.startsWith("index:"))!
    expect(first.dependencies[key]).toEqual(["notes/a", "notes/a/b"])

    fs.writeFileSync(path.join(docs, "other.md"), page("Other", "Edited."))
    const unrelated = buildDocuments({
      sourceRoot: docs,
      outDir,
      previous: library,
    })
    const second = await prepareEmbeds(unrelated, outDir, { previous: first })
    expect(second.blocks[key]).toBe(first.blocks[key])

    fs.writeFileSync(
      path.join(docs, "notes/a/b.md"),
      page("B", "Changed below."),
    )
    const below = buildDocuments({
      sourceRoot: docs,
      outDir,
      previous: unrelated,
    })
    const third = await prepareEmbeds(below, outDir, { previous: second })
    expect(third.blocks[key]).not.toBe(second.blocks[key])
    expect(JSON.stringify(third.blocks[key])).toContain("Changed below.")
  })

  it("depends on anything once an extractor runs", () => {
    const library = build(files, {
      none: { version: "1", extract: () => undefined },
    })
    const resolved = resolveEmbed(
      library,
      parseEmbedSpec(
        "sources: [/notes/]\nrender:\n  type: tree\n  columns: [{ value: { extractor: none } }]\n",
      ),
      { documentId: "index" },
    )
    expect(resolved.data?.cudocDependencies).toEqual([
      "*",
      "notes/a",
      "notes/a/b",
    ])
  })
})

describe("checking a tree", () => {
  const check = (
    embed: string,
    extractors?: Record<string, TableExtractor>,
  ) => {
    const library = build(
      {
        "index.md": `# Home\n\nIntro.\n\n\`\`\`cudoc-embed\n${embed}\`\`\`\n`,
        "guide/index.md": page("Guide"),
        "guide/alpha.md": page("Alpha"),
        "guide/beta.md": "# Beta\n\n## Part (#part)\n\nText.\n",
      },
      extractors,
    )
    return checkReferences(library).issues
  }

  it("passes a tree whose sources, columns and order all resolve", () => {
    expect(
      check(
        "sources: [/guide/, /guide/beta#part]\nrender:\n  type: tree\n  order: [beta, Alpha, ...]\n",
      ),
    ).toEqual([])
  })

  it("reports sources that name nothing", () => {
    const issues = check(
      "sources: [/gone/, guide/beta#nope, guide]\nrender: { type: tree }\n",
    )
    expect(issues.map((issue) => [issue.code, issue.reference])).toEqual([
      ["missing-embed-source", "/gone/"],
      ["missing-embed-anchor", "guide/beta#nope"],
      ["missing-embed-source", "guide"],
    ])
    expect(issues[1]!.available).toEqual(["beta", "part"])
    expect(issues[2]!.message).toContain("a folder source ends with /")
  })

  it("reports a folder whose documents the page would all leave out", () => {
    const library = build(
      {
        "index.md":
          "# Home\n\n```cudoc-embed\nsources: [/vault/]\nrender: { type: tree }\n```\n",
        "vault/a.md": page("A"),
      },
      undefined,
      undefined,
      ["vault/**"],
    )
    const issues = checkReferences(library).issues
    expect(issues.map((issue) => issue.code)).toEqual(["missing-embed-source"])
    expect(issues[0]!.message).toContain("holds only private documents")
  })

  it("reports an order entry that names no line of the first level, inside the fence", () => {
    const issues = check(
      "sources: [/guide/]\nrender:\n  type: tree\n  order:\n    - Intro\n    - ...\n    - alpha\n",
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: "unmatched-tree-order",
      severity: "warning",
      reference: "Intro",
      available: ["Alpha", "Beta"],
    })
    // The entry's line in the block, not the word "Intro." above the fence.
    expect(issues[0]!.position?.start).toEqual({ line: 10, column: 7 })
    // The names it could have been are names, not anchors.
    expect(
      formatCheckResult({ issues, documentCount: 4, checkedReferences: 1 }),
    ).toContain('available: "Alpha", "Beta"')
  })

  it("reports an extractor the configuration does not register", () => {
    const issues = check(
      "sources: [/guide/]\nrender:\n  type: tree\n  columns: [link, { value: { extractor: tasks } }]\n",
    )
    expect(issues.map((issue) => issue.code)).toEqual(["invalid-embed-spec"])
    expect(issues[0]!.message).toBe(
      'extractor "tasks" is not registered; add it to extractors in the collection options',
    )
  })

  it("follows no cycle, since a tree copies nothing", () => {
    // The embedding document is a line of its own tree.
    expect(check("sources: [/]\nrender: { type: tree }\n")).toEqual([])
  })

  it("follows no cycle through a tree inside a copied section", () => {
    // x embeds a section of b holding a tree whose line is x again.
    const library = build({
      "index.md": page("Home"),
      "x.md": "# X\n\n```cudoc-embed\nsources: [b.md#part]\n```\n",
      "b.md":
        "# B\n\n## Part (#part)\n\n```cudoc-embed\nsources: [x.md]\nrender: { type: tree }\n```\n",
    })
    expect(checkReferences(library).issues).toEqual([])
    const resolved = resolveEmbed(
      library,
      parseEmbedSpec("sources: [b.md#part]\n"),
      { documentId: "x" },
    )
    expect(renderDocument(resolved)).toContain('<ul class="cudoc-tree">')
  })

  it("places an entry and an extractor at their own place in the block", () => {
    const issues = check(
      "sources: [/guide/]\nrender:\n  type: tree\n  order:\n    - Alphabet\n    - Alph\n  columns: [link, { value: { extractor: Intro } }]\n",
    )
    // "Alph" is inside "Alphabet" and "Intro" in the prose above the fence;
    // each is placed on its own line of the block all the same.
    expect(
      issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start,
      ]),
    ).toEqual([
      ["invalid-embed-spec", "Intro", { line: 12, column: 41 }],
      ["unmatched-tree-order", "Alphabet", { line: 10, column: 7 }],
      ["unmatched-tree-order", "Alph", { line: 11, column: 7 }],
    ])
  })
})
