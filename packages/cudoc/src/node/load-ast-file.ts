/** File loading without the build-time output path helpers. */
import fs from "node:fs"
import {
  resolveAstVersion,
  validateAstContract,
} from "../internal/core/index.js"
import type {
  AstVersionOptions,
  ExportedCudocAstRoot,
  ValidateAstOptions,
} from "../internal/core/index.js"

export type LoadAstOptions = {
  version?: AstVersionOptions
  validate?: boolean
  tableCellElement?: ValidateAstOptions["tableCellElement"]
}

/** Loads and validates one stored document. */
export const loadAstFile = (
  filePath: string,
  { version, validate = true, tableCellElement }: LoadAstOptions = {},
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
      tableCellElement,
    })
  }

  return parsed as ExportedCudocAstRoot
}
