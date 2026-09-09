import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import { validateAstContract } from "../internal/core/ast/validate.js"
import { projectAst, type ProjectionOptions } from "../dataset.js"
import {
  hash,
  sourceFiles,
  publishDirectory,
  safePath,
  posix,
  writeJson,
} from "./storage.js"

export type DatasetOptions = ProjectionOptions & {
  inputDir: string
  outDir: string
  documents?: string[]
  scopes?: string[]
  projectionId?: string
  requireVersion?: boolean
}
export function generateDataset({
  inputDir,
  outDir,
  documents,
  scopes,
  projectionId = "custom",
  requireVersion = true,
  ...projection
}: DatasetOptions) {
  const entries = sourceFiles(inputDir, [".json"])
    .filter(
      (file) => !["manifest.json", "meta.json"].includes(path.basename(file)),
    )
    .map((file) => ({
      file,
      id: posix(path.relative(inputDir, file)).replace(/\.json$/, ""),
    }))
    .filter(
      (entry) =>
        (!documents || documents.includes(entry.id)) &&
        (!scopes || scopes.includes(entry.id.split("/")[0])),
    )
  for (const id of documents ?? [])
    if (!entries.some((e) => e.id === id))
      throw new Error(`cudoc: dataset document missing: ${id}`)
  const inputs: { id: string; hash: string; outputHash: string }[] = []
  publishDirectory(inputDir, outDir, (staging) => {
    for (const { file, id } of entries) {
      try {
        const source = fs.readFileSync(file, "utf8")
        const input = JSON.parse(source) as Root
        validateAstContract(input, { requireVersion })
        const tree = projectAst(input, projection)
        const serialized = JSON.stringify(tree)
        writeJson(safePath(staging, `documents/${id}.json`), tree)
        inputs.push({ id, hash: hash(source), outputHash: hash(serialized) })
      } catch (cause) {
        throw new Error(`cudoc: dataset projection failed for ${file}`, {
          cause,
        })
      }
    }
    writeJson(path.join(staging, "manifest.json"), {
      schemaVersion: "1.0.0",
      projectionId,
      projection,
      documentCount: inputs.length,
      scopes: scopes ?? [...new Set(entries.map((e) => e.id.split("/")[0]))],
      documents: inputs,
    })
  })
  return {
    schemaVersion: "1.0.0",
    documentCount: inputs.length,
    documents: inputs,
  }
}
