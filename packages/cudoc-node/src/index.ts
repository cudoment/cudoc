export {
  default,
  default as exportAst,
  buildExportedAst,
  projectTree,
  resolveExportAstOptions,
  DEFAULT_DROPPED_NODE_TYPES,
  DEFAULT_STRIPPED_PROPERTIES,
} from "./export-ast.js"
export type { ExportAstContext, ExportAstOptions } from "./export-ast.js"
export { loadAst, loadAstFile } from "./load-ast.js"
export type { LoadAstOptions } from "./load-ast.js"
export {
  getOutputPath,
  getRelativeOutputPath,
  resolvePathOptions,
  DEFAULT_EXTENSIONS,
  DEFAULT_OUTPUT_ROOT,
  DEFAULT_SOURCE_ROOT,
} from "./paths.js"
export type { PathOptions, ResolvedPathOptions } from "./paths.js"
