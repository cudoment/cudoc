import { compileMdx } from "nextra/compile"
import { cudocRemarkPlugins } from "cudoc-nextra"
import { createCompilerCapture } from "cudoc-remark"
// The site draws its headings with its own Anchor and Badge components, which
// a library meant for embedding and export cannot carry. Collection keeps
// cudoc's native output and takes the one site option that changes the tree,
// the table layout, as the Next.js collector does.
import { cudocOptions } from "../fixtures/cudoc-options.mjs"
import { collectDocuments } from "@cudoment/cudoc/node/watch"

const documentOptions = {
  syntax: {},
  tableColumnLayout: cudocOptions.tableColumnLayout,
}

await collectDocuments({
  sourceRoot: "content",
  outDir: ".cudoc/documents",
  host: "nextra",
  compilerId: "nextra-4.6.0-portable-v2",
  ...documentOptions,
  async compiler(source, { filePath, options }) {
    const capture = createCompilerCapture()
    await compileMdx(source, {
      filePath,
      codeHighlight: false,
      mdxOptions: {
        format: options.format,
        remarkPlugins: [...cudocRemarkPlugins(documentOptions), capture.remark],
        rehypePlugins: [capture.rehype],
      },
    })
    return capture.read()
  },
})
