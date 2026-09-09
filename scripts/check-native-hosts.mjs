import path from "node:path"
import os from "node:os"
import { buildSite } from "cudoc-html"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import fs from "node:fs"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { createCompilerCapture } from "cudoc-remark"
import { renderDocument } from "@cudoment/cudoc/render"
import { collectSections } from "@cudoment/cudoc/query"

for (const host of ["docusaurus", "nextra"]) {
  const siteDir = path.resolve("examples", host)
  const require = createRequire(path.join(siteDir, "package.json"))
  const { cudocRemarkPlugins } = await import(`cudoc-${host}`)
  const capture = createCompilerCapture()
  const options = {
    syntax: { headingAnchor: "both", callout: "both", link: "both" },
  }
  const common =
    "\n\n## Portable (#portable)\n\n> [!WARNING] Portable title\n> Portable body\n\n[Link](https://example.com)"
  let source
  if (host === "docusaurus") {
    const {
      createProcessorUncached,
    } = require("@docusaurus/mdx-loader/lib/processor.js")
    const processor = await createProcessorUncached({
      format: "mdx",
      options: {
        siteDir,
        staticDirs: [],
        admonitions: true,
        removeContentTitle: false,
        markdownConfig: {
          anchors: { maintainCase: false },
          hooks: {
            onBrokenMarkdownLinks: "throw",
            onBrokenMarkdownImages: "throw",
          },
          mdx1Compat: { comments: true, admonitions: true, headingIds: true },
          emoji: false,
          mermaid: false,
        },
        beforeDefaultRemarkPlugins: [
          ...cudocRemarkPlugins(options),
          capture.remark,
        ],
        rehypePlugins: [capture.rehype],
      },
    })
    source =
      "# Native\n\n## Host {/* #host */}\n\n:::warning[Native title]{#native-alert}\n\nNative body\n\n:::" +
      common
    await processor.process({
      filePath: path.join(siteDir, "docs/native.mdx"),
      content: source,
      frontMatter: {},
      compilerName: "server",
    })
  } else {
    const { compileMdx } = await import(
      pathToFileURL(
        path.resolve(
          siteDir,
          "node_modules/nextra",
          JSON.parse(
            fs.readFileSync(
              path.join(siteDir, "node_modules/nextra/package.json"),
              "utf8",
            ),
          ).exports["./compile"].import,
        ),
      ).href
    )
    source =
      '# Native\n\n## Host [#host]\n\n<Callout type="warning">Native body</Callout>' +
      common
    await compileMdx(source, {
      filePath: path.join(siteDir, "content/native.mdx"),
      codeHighlight: false,
      mdxOptions: {
        remarkPlugins: [...cudocRemarkPlugins(options), capture.remark],
        rehypePlugins: [capture.rehype],
      },
    })
  }
  const tree = capture.read().tree
  assert.equal(
    collectSections(tree, { anchors: ["host", "portable"] }).length,
    2,
  )
  const html = renderDocument(tree)
  assert.equal(
    (html.match(/data-callout="warning"/g) ?? []).length,
    2,
    `${host}: native and cudoc callouts share semantics`,
  )
  assert.ok(html.includes("Native body"))
  assert.ok(html.includes("Portable body"))
  assert.ok(html.includes('href="https://example.com"'))
  if (host === "docusaurus") assert.ok(html.includes('id="native-alert"'))
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-native-html-"))
  try {
    const sourceRoot = path.join(temporary, "docs")
    const library = path.join(temporary, "library")
    fs.mkdirSync(sourceRoot)
    fs.writeFileSync(path.join(sourceRoot, "native.mdx"), source)
    buildDocuments({
      sourceRoot,
      outDir: library,
      host,
      compilerId: `${host}-native-capture`,
      compiler: () => capture.read(),
    })
    const outDir = path.join(temporary, "html")
    buildSite({
      sourceRoot,
      library,
      outDir,
      links: "host",
      hostUrl: "https://docs.example.com/project/",
    })
    const exported = fs.readFileSync(path.join(outDir, "native.html"), "utf8")
    assert.equal(
      (exported.match(/data-callout="warning"/g) ?? []).length,
      2,
      `${host}: native callouts survive HTML export`,
    )
    assert.ok(
      exported.includes('href="https://docs.example.com/project/native#host"'),
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
  console.log(
    `${host}: actual compiler normalizes native and cudoc anchors, callouts and links together`,
  )
}
