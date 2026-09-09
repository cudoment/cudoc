import { compileMdx } from "nextra/compile"
import { cudocRemarkPlugins } from "cudoc-nextra"
import { createCompilerCapture } from "cudoc-remark"
import { buildDocumentsAsync } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"

const library = await buildDocumentsAsync({
  sourceRoot: "content",
  outDir: ".cudoc/documents",
  host: "nextra",
  compilerId: "nextra-4.6.0-portable-v1",
  syntax: {},
  async compiler(source, { filePath, options }) {
    const capture = createCompilerCapture()
    await compileMdx(source, {
      filePath,
      codeHighlight: false,
      mdxOptions: {
        format: options.format,
        remarkPlugins: [...cudocRemarkPlugins({ syntax: {} }), capture.remark],
        rehypePlugins: [capture.rehype],
      },
    })
    return capture.read()
  },
})
await prepareEmbeds(library)
