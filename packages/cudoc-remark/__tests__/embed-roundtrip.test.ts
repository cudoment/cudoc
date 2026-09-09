import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { compile } from "@mdx-js/mdx"
import remarkGfm from "remark-gfm"
import { visit } from "unist-util-visit"
import type { List } from "mdast"
import type { CudocTable } from "@cudoment/cudoc"
import {
  findSiblingNode,
  getHeadingBadge,
  getNodeText,
  getTableCellText,
  sliceSectionByAnchorId,
} from "@cudoment/cudoc/query"
import exportAst, { loadAst } from "@cudoment/cudoc/embed"
import { loadAstFile } from "@cudoment/cudoc/node/load-ast-file"
import cudocPrepare from "cudoc-remark"
import promoteAnchorIds from "cudoc-remark/heading-ids"

const temporaryDirectories: string[] = []
const workspace = () => {
  const cwd = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-embed-")),
  )
  temporaryDirectories.push(cwd)
  return cwd
}
afterEach(() => {
  for (const cwd of temporaryDirectories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

describe("compiled MDX to stored AST to embed queries", () => {
  it("keeps host-supported task lists in source-authored HTML cells", async () => {
    const cwd = workspace()
    await compile(
      {
        path: path.join(cwd, "docs/guide.mdx"),
        value:
          "<table><tbody><tr><td>\n\n- [x] Finished\n\n</td></tr></tbody></table>\n",
      },
      { remarkPlugins: [remarkGfm, cudocPrepare, [exportAst, { cwd }]] },
    )
    const document = loadAst("guide", { cwd })
    const checked: (boolean | null | undefined)[] = []
    visit(document, "listItem", (item) => {
      checked.push(item.checked)
    })
    expect(checked).toEqual([true])
  })

  it("preserves the original first definition when a slice contains a duplicate", async () => {
    const source =
      "[ref]: /first\n\n## Target (#target)\n\n[link][ref]\n\n[ref]: /second\n\n## Next (#next)\n"
    const output = String(
      await compile(source, {
        remarkPlugins: [
          remarkGfm,
          cudocPrepare,
          () => (tree) => sliceSectionByAnchorId(tree, "target"),
        ],
        jsx: true,
      }),
    )
    expect(output).toContain('href="/first"')
    expect(output).not.toContain('href="/second"')
  })

  it("keeps external definitions needed to render a sliced section", async () => {
    const source = [
      "## Limits (#limits)",
      "",
      "See [the guide][guide] and ![diagram][image]. Note[^note].",
      "",
      "## Other (#other)",
      "",
      "Unrelated section.",
      "",
      "[guide]: /guide",
      "[image]: /diagram.png",
      "[unused]: /unused",
      "",
      "[^note]: See [more][detail].",
      "",
      "[detail]: /detail",
    ].join("\n")
    const output = String(
      await compile(source, {
        remarkPlugins: [
          remarkGfm,
          cudocPrepare,
          () => (tree) => sliceSectionByAnchorId(tree, "limits"),
        ],
        jsx: true,
      }),
    )
    expect(output).toContain('href="/guide"')
    expect(output).toContain('src="/diagram.png"')
    expect(output).toContain('href="/detail"')
    expect(output).not.toContain("Unrelated section")
    expect(output).not.toContain("/unused")
  })

  it("loads an isolated section with its badge, code and table lists", async () => {
    const cwd = workspace()
    const options = { cwd, version: { field: "documentAstVersion", value: 2 } }
    await compile(
      {
        path: path.join(cwd, "docs/guide.mdx"),
        value: [
          "export const ignored = 1",
          "",
          "## Limits (#limits) (@REST)",
          "",
          "Read **carefully**.",
          "",
          "```js",
          "const limit = 60",
          "```",
          "",
          "| Window | Requirements |",
          "| - | - |",
          "| minute | - one<br />- two |",
          "",
          "## Errors (#errors)",
          "",
          "Not part of the embed.",
        ].join("\n"),
      },
      {
        remarkPlugins: [
          remarkGfm,
          cudocPrepare,
          promoteAnchorIds,
          [exportAst, options],
        ],
      },
    )

    const document = loadAst("guide", options)
    expect(
      loadAstFile(path.join(cwd, ".cudoc/ast/guide.json"), options),
    ).toEqual(document)
    const section = sliceSectionByAnchorId(document, "#limits")!
    const heading = section.children[0]
    if (heading.type !== "heading") throw new Error("Missing heading")
    expect(getHeadingBadge(heading)).toBe("REST")
    expect(getNodeText(section.children)).toBe(
      "Limits\nRead carefully.\nconst limit = 60\nWindow\tRequirements\nminute\tone\ntwo",
    )
    const table = findSiblingNode<CudocTable>(section, 0, {
      direction: "after",
      type: "table",
    })!
    expect(getTableCellText(table, [[1, 1]])).toEqual(["one\ntwo"])
    expect(document.data.documentAstVersion).toBe(2)
    expect(JSON.stringify(document)).not.toMatch(/"position"|"estree"|mdxjsEsm/)
    expect(() => loadAst("guide", { cwd })).toThrow(/expected cudocAstVersion/)
  })

  it.each(["td", "TableCell", "CustomCell"])(
    "validates %s lists during export and load",
    async (cell) => {
      const cwd = workspace()
      const options = {
        cwd,
        ...(cell === "CustomCell" ? { tableCellElement: [cell] } : {}),
      }
      const source =
        "##### Requirements\n\n| Prerequisites |\n| - |\n| - a<br />- b<br />- c<br />- d |\n"
      const plugins = [
        remarkGfm,
        [
          cudocPrepare,
          {
            tableColumnLayout: [
              {
                section: { depth: 5, titles: ["Requirements"] },
                columnHeaders: ["Prerequisites"],
                components: { cell },
              },
            ],
          },
        ],
      ] as import("unified").PluggableList
      const file = { path: path.join(cwd, "docs/guide.mdx"), value: source }
      await compile(file, { remarkPlugins: [...plugins, [exportAst, options]] })
      const document = loadAst("guide", options)
      visit(document, "list", (list: List) => {
        list.spread = true
      })
      fs.writeFileSync(
        path.join(cwd, ".cudoc/ast/guide.json"),
        JSON.stringify(document),
      )
      expect(() => loadAst("guide", options)).toThrow(
        /table list spread must be false/,
      )

      await expect(
        compile(file, {
          remarkPlugins: [
            ...plugins,
            () => (tree) => {
              visit(tree, "list", (list: List) => {
                list.spread = true
              })
            },
            [exportAst, options],
          ],
        }),
      ).rejects.toThrow(/table list spread must be false/)
    },
  )
})
