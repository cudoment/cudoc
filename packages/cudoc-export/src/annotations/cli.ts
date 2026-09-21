/**
 * `cudoc-export annotations <notes…> [--token t] --library <dir> [--out file] [--json]`,
 * kept apart from the executable so tests can call it without a process.
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import {
  locateAnnotations,
  readNotesFile,
  readNotesToken,
  renderJsonReport,
  renderMarkdownReport,
} from "./report.js"

export const ANNOTATIONS_USAGE = `Usage: cudoc-export annotations [notes.json|page.annotated.html]... [--token token]...
  --library directory [--out report.md] [--json]`

export type AnnotationsCommandResult = {
  /** The report, or an error message when the exit code is not 0. */
  output: string
  exitCode: number
  /** Set when the report was written to a file instead of returned. */
  outFile?: string
}

export function runAnnotationsCommand(
  argv: readonly string[],
): AnnotationsCommandResult {
  const files: string[] = []
  const tokens: string[] = []
  let libraryDir = path.join(".cudoc", "documents")
  let outFile: string | undefined
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i]!
    if (
      argument === "--library" ||
      argument === "--out" ||
      argument === "--token"
    ) {
      const next = argv[i + 1]
      if (!next || next.startsWith("--"))
        return {
          output: `Missing value for ${argument}\n${ANNOTATIONS_USAGE}`,
          exitCode: 1,
        }
      if (argument === "--library") libraryDir = next
      else if (argument === "--token") tokens.push(next)
      else outFile = next
      i += 1
    } else if (argument === "--json") json = true
    else if (argument.startsWith("-"))
      return {
        output: `Unknown argument: ${argument}\n${ANNOTATIONS_USAGE}`,
        exitCode: 1,
      }
    else files.push(argument)
  }
  if (!files.length && !tokens.length)
    return { output: ANNOTATIONS_USAGE, exitCode: 1 }
  try {
    const collections = [
      ...files.map(readNotesFile),
      ...tokens.map(readNotesToken),
    ]
    const library = loadLibrary(libraryDir)
    const version = (
      createRequire(import.meta.url)("../../package.json") as {
        version: string
      }
    ).version
    const report = locateAnnotations(collections, library, {
      files: [...files, ...tokens.map(() => "share token")],
      libraryDir: path.resolve(libraryDir),
      generator: `cudoc-export ${version}`,
    })
    const output = json
      ? renderJsonReport(report)
      : renderMarkdownReport(report)
    if (outFile) {
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
      fs.writeFileSync(outFile, output)
      return { output: "", exitCode: 0, outFile: path.resolve(outFile) }
    }
    return { output, exitCode: 0 }
  } catch (error) {
    return {
      output: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    }
  }
}
