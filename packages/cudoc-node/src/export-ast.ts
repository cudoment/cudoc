/**
 * Writes the compiled AST of each document to JSON.
 *
 * The tree comes from the host's real compilation rather than a second parse.
 * Re-parsing MDX to reproduce it would drift, because the MDX compiler applies
 * its own transforms before user plugins ever run.
 */

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import type { Transformer } from "unified"
import type { Root } from "mdast"
import type { VFile } from "vfile"
import { resolveAstVersion, validateAstContract } from "cudoc-core"
import type { AstVersionOptions } from "cudoc-core"
import {
  getOutputPath,
  resolvePathOptions,
  type PathOptions,
  type ResolvedPathOptions,
} from "./paths.js"

type AstNode = Record<string, unknown>

/** Properties dropped from stored JSON: neither survives a round trip usefully. */
export const DEFAULT_STRIPPED_PROPERTIES = ["position", "estree"]

/** Node types dropped entirely. ESM export nodes carry no document content. */
export const DEFAULT_DROPPED_NODE_TYPES = ["mdxjsEsm"]

export type ExportAstOptions = PathOptions & {
  /** Properties removed from every node. */
  strip?: string[]
  /** Node types removed together with their subtree. */
  dropNodeTypes?: string[]
  /** Where the schema version is written, and what it is. */
  version?: AstVersionOptions
  /** Validate the contract before writing. On by default. */
  validate?: boolean
  /**
   * Sink for the serialized document. Defaults to an atomic file write.
   * Intended for programmatic use; a config passed through a bundler cannot
   * carry a function.
   */
  write?: (filePath: string, contents: string) => void
}

const writeJsonAtomically = (outputFile: string, contents: string) => {
  const temporaryFile = path.join(
    path.dirname(outputFile),
    `.${path.basename(outputFile)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  )

  let operationFailed = false
  try {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    fs.writeFileSync(temporaryFile, contents, "utf-8")
    fs.renameSync(temporaryFile, outputFile)
  } catch (error) {
    operationFailed = true
    throw error
  } finally {
    if (fs.existsSync(temporaryFile)) {
      try {
        fs.unlinkSync(temporaryFile)
      } catch (cleanupError) {
        // A cleanup failure must not mask the original error.
        if (!operationFailed) throw cleanupError
        console.error(
          `cudoc: failed to remove temporary file ${temporaryFile}`,
          cleanupError,
        )
      }
    }
  }
}

export type ExportAstContext = {
  pathOptions: ResolvedPathOptions
  strip: Set<string>
  dropNodeTypes: Set<string>
  version: ReturnType<typeof resolveAstVersion>
  validate: boolean
  write: (filePath: string, contents: string) => void
}

export const resolveExportAstOptions = (
  options: ExportAstOptions = {},
): ExportAstContext => ({
  pathOptions: resolvePathOptions(options),
  strip: new Set(options.strip ?? DEFAULT_STRIPPED_PROPERTIES),
  dropNodeTypes: new Set(options.dropNodeTypes ?? DEFAULT_DROPPED_NODE_TYPES),
  version: resolveAstVersion(options.version),
  validate: options.validate !== false,
  write: options.write ?? writeJsonAtomically,
})

/** Strips properties and drops node types in a single pass. */
export const projectTree = (
  node: unknown,
  context: ExportAstContext,
): unknown => {
  if (!node || typeof node !== "object") return node

  if (Array.isArray(node)) {
    return node.flatMap((child) => {
      const projected = projectTree(child, context)
      return projected === undefined ? [] : [projected]
    })
  }

  const type = (node as AstNode).type
  if (typeof type === "string" && context.dropNodeTypes.has(type)) {
    return undefined
  }

  const result: AstNode = {}
  for (const [key, value] of Object.entries(node as AstNode)) {
    if (context.strip.has(key)) continue
    const projected = projectTree(value, context)
    if (projected !== undefined) result[key] = projected
  }
  return result
}

/** Builds the object written for one document, without touching the disk. */
export const buildExportedAst = (
  tree: unknown,
  context: ExportAstContext,
): AstNode => {
  const projected = projectTree(tree, context)
  if (!projected || typeof projected !== "object") {
    throw new Error("cudoc: the AST root did not survive projection")
  }

  const exportTree = projected as AstNode
  const currentData =
    exportTree.data && typeof exportTree.data === "object"
      ? (exportTree.data as AstNode)
      : {}
  exportTree.data = {
    ...currentData,
    [context.version.field]: context.version.value,
  }

  if (context.validate) {
    validateAstContract(exportTree, {
      requireVersion: true,
      version: context.version,
    })
  }

  return exportTree
}

const exportAst =
  (options: ExportAstOptions = {}): Transformer<Root, Root> =>
  (tree, file: VFile) => {
    const context = resolveExportAstOptions(options)
    const outputFile = file.path
      ? getOutputPath(file.path, context.pathOptions)
      : null
    if (!outputFile) return tree

    try {
      const exportTree = buildExportedAst(tree, context)
      context.write(outputFile, JSON.stringify(exportTree))
    } catch (error) {
      console.error(
        `cudoc: failed to export ${file.path}:`,
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }

    return tree
  }

export default exportAst
