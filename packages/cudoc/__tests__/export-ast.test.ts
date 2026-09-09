import { describe, expect, it } from "vitest"
import path from "node:path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkMdx from "remark-mdx"
import remarkGfm from "remark-gfm"
import type { Root } from "mdast"
import exportAst, {
  buildExportedAst,
  getOutputPath,
  getRelativeOutputPath,
  resolveExportAstOptions,
  resolvePathOptions,
} from "@cudoment/cudoc/embed"

const CWD = "/project"

const pathOptions = (overrides = {}) =>
  resolvePathOptions({
    cwd: CWD,
    sourceRoot: "docs",
    outDir: "out",
    ...overrides,
  })

describe("path mapping", () => {
  it("mirrors the source layout under the output root", () => {
    expect(getOutputPath("docs/en/setup/app.mdx", pathOptions())).toBe(
      path.join(CWD, "out", "en", "setup", "app.json"),
    )
  })

  it("returns null for a file outside the source root", () => {
    expect(getOutputPath("other/app.mdx", pathOptions())).toBeNull()
  })

  it("refuses a path that climbs out of the source root", () => {
    expect(getOutputPath("docs/../secrets.mdx", pathOptions())).toBeNull()
  })

  it("returns null for an extension that is not exported", () => {
    expect(getOutputPath("docs/readme.txt", pathOptions())).toBeNull()
  })

  it("accepts an extension that is configured", () => {
    expect(
      getRelativeOutputPath(
        "docs/readme.md",
        pathOptions({ extensions: [".md"] }),
      ),
    ).toBe("readme.json")
  })

  it("compares extensions case-insensitively", () => {
    expect(getRelativeOutputPath("docs/app.MDX", pathOptions())).toBe(
      "app.json",
    )
  })

  it("rejects an extension without a leading dot", () => {
    expect(() => resolvePathOptions({ extensions: ["mdx"] })).toThrow(
      /starting with "\."/,
    )
  })
})

describe("projection", () => {
  const parse = (input: string): Root =>
    unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm)
      .parse(input) as Root

  it("removes positions and export-only nodes", () => {
    const tree = parse("export const meta = {}\n\n# Title\n")
    const exported = buildExportedAst(tree, resolveExportAstOptions())

    const serialized = JSON.stringify(exported)
    expect(serialized).not.toContain('"position"')
    expect(serialized).not.toContain("mdxjsEsm")
    expect(exported.type).toBe("root")
  })

  it("writes the version into the root data", () => {
    const exported = buildExportedAst(
      parse("# Title\n"),
      resolveExportAstOptions(),
    )

    expect(exported.data).toEqual({ cudocAstVersion: 1 })
  })

  it("uses a caller's version field and value", () => {
    const exported = buildExportedAst(
      parse("# Title\n"),
      resolveExportAstOptions({
        version: { field: "documentAstVersion", value: 2 },
      }),
    )

    expect(exported.data).toEqual({ documentAstVersion: 2 })
  })

  it("keeps a property that is not stripped", () => {
    const exported = buildExportedAst(
      parse("# Title\n"),
      resolveExportAstOptions({ strip: [] }),
    )

    expect(JSON.stringify(exported)).toContain('"position"')
  })
})

describe("plugin", () => {
  const compile = (
    input: string,
    filePath: string | undefined,
    options = {},
  ) => {
    const written: { path: string; contents: string }[] = []
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm)
      .use(exportAst, {
        cwd: CWD,
        sourceRoot: "docs",
        outDir: "out",
        write: (p, contents) => written.push({ path: p, contents }),
        ...options,
      })

    const tree = processor.parse(input) as Root
    processor.runSync(tree, { path: filePath, value: input })
    return written
  }

  it("writes one file per document", () => {
    const written = compile("# Title\n", "docs/en/app.mdx")

    expect(written).toHaveLength(1)
    expect(written[0]?.path).toBe(path.join(CWD, "out", "en", "app.json"))
    expect(JSON.parse(written[0]!.contents).type).toBe("root")
  })

  it("writes nothing for a file outside the source root", () => {
    expect(compile("# Title\n", "elsewhere/app.mdx")).toHaveLength(0)
  })

  it("writes nothing when the host gave no path", () => {
    expect(compile("# Title\n", undefined)).toHaveLength(0)
  })

  it("leaves the tree unchanged for the rest of the pipeline", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(exportAst, { cwd: CWD, outDir: "out", write: () => {} })

    const input = "# Title\n"
    const tree = processor.parse(input) as Root
    const result = processor.runSync(tree, {
      path: "docs/app.mdx",
      value: input,
    })

    expect(result.children[0]?.type).toBe("heading")
    // Positions are stripped from the exported copy, not from the live tree.
    expect(result.children[0]?.position).toBeDefined()
  })
})
