/** Source-relative document lookup, built on the file loader. */
import path from "node:path"
import type { ExportedCudocAstRoot } from "../internal/core/index.js"
import {
  resolvePathOptions,
  type PathOptions,
  type ResolvedPathOptions,
} from "./paths.js"
import { loadAstFile, type LoadAstOptions } from "./load-ast-file.js"

export { loadAstFile } from "./load-ast-file.js"
export type { LoadAstOptions } from "./load-ast-file.js"

/**
 * Loads the document stored for a source-relative document path, such as
 * `en/app-setting/app`.
 */
export const loadAst = (
  documentPath: string,
  options: LoadAstOptions & PathOptions = {},
): ExportedCudocAstRoot => {
  const pathOptions: ResolvedPathOptions = resolvePathOptions(options)
  const projectRoot = pathOptions.cwd ?? process.cwd()
  const normalized = documentPath.replace(/^[/\\]+/, "").replace(/\.json$/i, "")
  const filePath = path.join(
    projectRoot,
    pathOptions.outDir,
    `${normalized}.json`,
  )

  return loadAstFile(filePath, options)
}
