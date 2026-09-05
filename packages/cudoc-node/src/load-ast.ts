/**
 * Reads a stored AST back.
 *
 * The version is checked on load as well as on write, so a stale file left by
 * an older schema is reported where it is read rather than misinterpreted.
 */

import fs from "node:fs"
import path from "node:path"
import { resolveAstVersion, validateAstContract } from "cudoc-core"
import type { AstVersionOptions, ExportedCudocAstRoot } from "cudoc-core"
import {
  resolvePathOptions,
  type PathOptions,
  type ResolvedPathOptions,
} from "./paths.js"

export type LoadAstOptions = {
  version?: AstVersionOptions
  validate?: boolean
}

/** Loads and validates one stored document. */
export const loadAstFile = (
  filePath: string,
  { version, validate = true }: LoadAstOptions = {},
): ExportedCudocAstRoot => {
  let fileContent: string
  try {
    fileContent = fs.readFileSync(filePath, "utf-8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      throw new Error(`cudoc: stored AST not found: ${filePath}`)
    }
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fileContent)
  } catch (error) {
    throw new Error(
      `cudoc: stored AST is not valid JSON (${
        error instanceof Error ? error.message : String(error)
      }): ${filePath}`,
    )
  }

  if (validate) {
    validateAstContract(parsed, {
      requireVersion: true,
      version: resolveAstVersion(version),
    })
  }

  return parsed as ExportedCudocAstRoot
}

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
