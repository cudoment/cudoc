/**
 * What a program that writes a tree in a form of its own can rely on: an
 * outliner that keeps one page per file, whose nodes nest as `X.md` and the
 * folder `X/`, under category folders such as `projects/`, with file names a
 * sync tool may have left in NFD, and which writes the tree into a file and
 * later tells a hand edit from its own output by a hash.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildDocuments, type Library } from "../src/node/library.js"
import {
  buildEmbedTree,
  parseEmbedSpec,
  resolveEmbed,
  resolveTree,
  type EmbedSpec,
  type TableExtractor,
  type TreeNode,
  type TreeRender,
} from "../src/node/resolve-embed.js"
import { renderDocument } from "../src/render.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const nfd = (value: string) => value.normalize("NFD")
const OPEN = /^- (?:TODO|DOING|NOW|LATER|WAITING)(?:\s|$)/gm

/**
 * A memo graph: a chain of nodes six levels deep under `projects/`, a node
 * with nothing below it, and Korean pages whose files are in NFD while the
 * folder beside one of them is in NFC, as a sync tool and a local edit
 * leave them.
 */
const GRAPH: Record<string, string> = {
  "projects/Side.md": "# Side\n\nA node with nothing below it.\n",
  [nfd("areas/개발.md")]:
    "# 개발\n\n개발 요약입니다.\n\n- TODO 일 하나\n- DONE 끝난 일\n",
  "areas/개발/세부.md": "# 세부\n\n세부 요약입니다.\n\n- TODO 일 둘\n",
  [nfd("areas/가계.md")]: "# 가계\n\n가계 요약입니다.\n",
}
for (let level = 0, folder = "projects"; level < 6; level++) {
  const name = level ? `Level${level}` : "Root"
  GRAPH[`${folder}/${name}.md`] =
    `${level === 2 ? "status:: active\n\n" : ""}# ${name}\n\nSummary of level ${level}.\n\n- TODO work at ${level}\n`
  folder = `${folder}/${name}`
}

const collect = (files = GRAPH, extractors = EXTRACTORS): Library => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-memo-"))
  temporary.push(root)
  const notes = path.join(root, "notes")
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(notes, name)), { recursive: true })
    fs.writeFileSync(path.join(notes, name), text)
  }
  return buildDocuments({
    sourceRoot: notes,
    outDir: path.join(root, "library"),
    extractors,
  })
}

/**
 * The open tasks of a node and everything under it: its own, counted in its
 * document, plus the totals its children already carry.
 */
const EXTRACTORS: Record<string, TableExtractor> = {
  open: {
    version: "1",
    extract(row, { node }) {
      const own = (row.document.source.text.match(OPEN) ?? []).length
      const below = (node?.children ?? []).reduce(
        (sum, child) => sum + Number(child.cells[1]?.text.split(" ")[0] || 0),
        0,
      )
      const total = own + below
      return total ? `${total} open` : undefined
    },
  },
}

const SPEC: EmbedSpec = parseEmbedSpec(
  [
    "sources: [/projects/, /areas/]",
    "render:",
    "  type: tree",
    `  order: [개발, ...]`,
    "  columns: [link, { value: { extractor: open } }, summary]",
  ].join("\n"),
)

const resolve = (library: Library, spec = SPEC) =>
  resolveTree(library, spec, { documentId: "projects/Side" })

const find = (nodes: TreeNode[], name: string): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.name === name) return node
    const found = find(node.children, name)
    if (found) return found
  }
  return undefined
}

describe("tree data for an outliner", () => {
  it("gives each line its id, title, address, file, cells and the lines below", () => {
    const nodes = resolve(collect())
    const root = find(nodes, "Root")!
    expect({ ...root, children: root.children.length }).toEqual({
      id: "projects/Root",
      kind: "document",
      documentId: "projects/Root",
      name: "Root",
      title: "Root",
      url: "/projects/Root",
      sourcePath: "projects/Root.md",
      level: 1,
      cells: [
        { text: "Root", url: "/projects/Root" },
        { text: "6 open" },
        { text: "Summary of level 0." },
      ],
      children: 1,
    })
    // The chain is whole, six levels deep, one node per level.
    let node: TreeNode | undefined = root
    const chain: string[] = []
    while (node) {
      chain.push(`${node.level}:${node.name}`)
      node = node.children[0]
    }
    expect(chain).toEqual([
      "1:Root",
      "2:Level1",
      "3:Level2",
      "4:Level3",
      "5:Level4",
      "6:Level5",
    ])
    // A node with nothing below it, beside the chain in the category folder.
    expect(find(nodes, "Side")).toMatchObject({ level: 1, children: [] })
  })

  it("summarizes a node with the first paragraph after its title", () => {
    const nodes = resolve(collect())
    // Level2 opens with a property line above its title.
    expect(find(nodes, "Level2")!.cells[2]).toEqual({
      text: "Summary of level 2.",
    })
  })

  it("lets an extractor total what the levels below it hold", () => {
    const nodes = resolve(collect())
    expect(
      ["Root", "Level3", "Level5", "개발", "세부", "가계", "Side"].map(
        (name) => find(nodes, name)!.cells[1]!.text,
      ),
    ).toEqual(["6 open", "3 open", "1 open", "2 open", "1 open", "", ""])
  })

  it("names, orders and sorts NFD file names as their NFC spelling", () => {
    const library = collect()
    const stored = library.documents.find(
      (d) =>
        d.sourcePath.endsWith(".md") && d.id.normalize("NFC") === "areas/개발",
    )!
    // The file really is decomposed, so this is not passing by accident.
    expect(stored.id).not.toBe(stored.id.normalize("NFC"))
    const nodes = resolve(library)
    // `order` written in NFC finds the NFD file; the rest sorts by title,
    // the Korean pages after the Latin ones.
    expect(nodes.map((node) => node.name)).toEqual([
      "개발",
      "Root",
      "Side",
      "가계",
    ])
    for (const node of nodes) expect(node.name).toBe(node.name.normalize("NFC"))
    // The NFC folder beside the NFD file still holds its child.
    expect(nodes[0]!.children.map((node) => node.name)).toEqual(["세부"])
    // And a source spelled in NFC names the NFD document.
    expect(
      resolve(
        library,
        parseEmbedSpec("sources: [/areas/개발]\nrender: { type: tree }\n"),
      ).map((node) => node.documentId),
    ).toEqual([stored.id])
  })

  it("gives equal output for equal input, whichever collection it reads", () => {
    const first = JSON.stringify(resolve(collect()))
    const again = JSON.stringify(resolve(collect()))
    expect(again).toBe(first)
    // Documents listed in another order give the same tree.
    const library = collect()
    const reversed = { ...library, documents: [...library.documents].reverse() }
    expect(JSON.stringify(resolve(reversed))).toBe(first)
  })

  it("is the data the embed renders", () => {
    const library = collect()
    const embedded = resolveEmbed(library, SPEC, {
      documentId: "projects/Side",
    })
    const nodes = resolve(library)
    expect(
      renderDocument(buildEmbedTree(nodes, SPEC.render as TreeRender)),
    ).toBe(renderDocument(embedded))
  })
})
