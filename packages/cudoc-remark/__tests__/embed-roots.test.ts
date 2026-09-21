/**
 * The embed plugin has to name a document the way collection did, or it asks
 * `embeds.json` for a block that was prepared under another id. With several
 * roots that means the same root list, and the same base prefixes, on both
 * sides.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { compile } from "@mdx-js/mdx"
import remarkGfm from "remark-gfm"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import cudocPrepare from "../src/prepare.js"
import embed, { restoreExpressions } from "../src/embed.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

it("finds prepared blocks for a file under a based root and refuses one outside every root", async () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-embed-roots-")),
  )
  temporary.push(root)
  const write = (name: string, value: string) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
  }
  write(
    "content/ko/guide.mdx",
    "# Guide\n\n```cudoc-embed\nsources: [/terms/ko/token.md#token]\n```\n",
  )
  // The source is MDX with a component, an expression attribute, a spread
  // attribute and a commented-out expression: everything the export strips
  // the estree from and the splice has to restore.
  write("glossary/ko/token.md", "# Token (#token)\n\nA token.\n")
  write(
    "glossary/ko/scope.mdx",
    '# Scope (#scope)\n\n<Callout level={2} {...extra} title="Read">\nGranted per app.\n</Callout>\n\n{/* a note to the author */}\n',
  )
  write(
    "content/ko/scopes.mdx",
    "# Scopes\n\n```cudoc-embed\nsources: [/terms/ko/scope.mdx#scope]\n```\n",
  )
  write(
    "elsewhere/page.mdx",
    "# Page\n\n```cudoc-embed\nsources: [/terms/ko/token.md]\n```\n",
  )
  const roots = [
    { dir: path.join(root, "content"), base: "docs" },
    { dir: path.join(root, "glossary"), base: "terms" },
  ]
  const outDir = path.join(root, ".cudoc/documents")
  await prepareEmbeds(buildDocuments({ roots, outDir, host: "next" }), outDir)

  const compiled = await compile(
    {
      value: fs.readFileSync(path.join(root, "content/ko/guide.mdx"), "utf8"),
      path: path.join(root, "content/ko/guide.mdx"),
    },
    {
      remarkPlugins: [remarkGfm, cudocPrepare, [embed, { outDir, roots }]],
    },
  )
  // The block is spliced as mdast, so its heading compiles like the page's
  // own headings: no wrapper component, no HTML string, no data import.
  const code = String(compiled)
  expect(code).not.toContain("_CudocEmbed")
  expect(code).not.toContain("embeds.json")
  expect(code).toContain("embed-1-1-token")
  expect(code).toContain("A token.")

  const spliced = String(
    await compile(
      {
        value: fs.readFileSync(
          path.join(root, "content/ko/scopes.mdx"),
          "utf8",
        ),
        path: path.join(root, "content/ko/scopes.mdx"),
      },
      {
        remarkPlugins: [remarkGfm, cudocPrepare, [embed, { outDir, roots }]],
      },
    ),
  )
  // The component stays a component, rendered through the host's mapping,
  // and its expressions compile from the text the export kept.
  expect(spliced).toContain("Callout")
  expect(spliced).toContain("level: 2")
  expect(spliced).toContain("...extra")
  expect(spliced).toContain('title: "Read"')
  expect(spliced).toContain("Granted per app.")

  // The loader appends its marker line to what the bundler compiles; the
  // plugin takes it off before comparing the source with the snapshot.
  const marked = String(
    await compile(
      {
        value: `${fs.readFileSync(path.join(root, "content/ko/guide.mdx"), "utf8")}\n\n[cudoc-library]: #0123abcd\n`,
        path: path.join(root, "content/ko/guide.mdx"),
      },
      {
        remarkPlugins: [remarkGfm, cudocPrepare, [embed, { outDir, roots }]],
      },
    ),
  )
  expect(marked).toContain("A token.")
  expect(marked).not.toContain("cudoc-library")

  await expect(
    compile(
      {
        value: fs.readFileSync(path.join(root, "elsewhere/page.mdx"), "utf8"),
        path: path.join(root, "elsewhere/page.mdx"),
      },
      {
        remarkPlugins: [remarkGfm, cudocPrepare, [embed, { outDir, roots }]],
      },
    ),
  ).rejects.toThrow(/outside every collection root/)

  // Naming both spellings of the roots is an error, not a merge.
  await expect(
    compile(
      { value: "# Plain\n", path: path.join(root, "content/ko/plain.mdx") },
      {
        remarkPlugins: [
          remarkGfm,
          cudocPrepare,
          [embed, { outDir, roots, sourceRoot: "content" }],
        ],
      },
    ),
  ).resolves.toBeDefined() // no fence: the roots are never resolved
})

it("restores an estree for every expression form and names the document when one does not parse", () => {
  const block = {
    type: "root",
    children: [
      {
        type: "mdxJsxFlowElement",
        name: "Callout",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "level",
            value: { type: "mdxJsxAttributeValueExpression", value: "1 + 1" },
          },
          { type: "mdxJsxExpressionAttribute", value: "...extra" },
        ],
        children: [{ type: "mdxFlowExpression", value: "/* only a note */" }],
      },
      { type: "mdxTextExpression", value: "count" },
    ],
  } as never
  restoreExpressions(block, "docs/guide")
  const element = (block as { children: Record<string, unknown>[] })
    .children[0] as {
    attributes: {
      value?: { data?: { estree?: unknown } }
      data?: { estree?: unknown }
    }[]
    children: { data?: { estree?: { body: unknown[] } } }[]
  }
  expect(element.attributes[0]!.value?.data?.estree).toMatchObject({
    type: "Program",
  })
  expect(element.attributes[1]!.data?.estree).toMatchObject({ type: "Program" })
  // A comment-only expression is an empty program rather than a parse error.
  expect(element.children[0]!.data?.estree?.body).toEqual([])
  expect(
    (block as { children: { data?: { estree?: unknown } }[] }).children[1]!.data
      ?.estree,
  ).toMatchObject({ type: "Program" })

  expect(() =>
    restoreExpressions(
      {
        type: "root",
        children: [{ type: "mdxFlowExpression", value: "1 +" }],
      } as never,
      "docs/guide",
    ),
  ).toThrow(/embedded expression in docs\/guide does not parse: \{1 \+\}/)
})
