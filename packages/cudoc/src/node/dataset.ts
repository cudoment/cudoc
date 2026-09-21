import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import { validateAstContract } from "../internal/core/ast/validate.js"
import { projectAst, type ProjectionOptions } from "../dataset.js"
import { LIBRARY_SCHEMA_VERSION } from "./library.js"
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
  /**
   * The collected library the ASTs came from. Its roots tell the generator
   * where a document's scope segment starts, and its private documents are
   * left out. Without it, the scope is the first path segment and nothing is
   * private.
   */
  library?: string
  documents?: string[]
  scopes?: string[]
  projectionId?: string
  requireVersion?: boolean
}

/** What the generator reads from a library manifest, when it is given one. */
const readLibraryFacts = (
  library: string,
): { bases: string[]; privateIds: Set<string> } => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(library, "manifest.json"), "utf8"),
  )
  if (
    manifest.schemaVersion !== LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(manifest.roots) ||
    !Array.isArray(manifest.documents)
  )
    throw new Error("cudoc: incompatible document manifest; rebuild documents")
  return {
    bases: (manifest.roots as { base: string }[]).map((root) => root.base),
    privateIds: new Set(
      (manifest.documents as { id: string; private?: boolean }[])
        .filter((doc) => doc.private)
        .map((doc) => doc.id),
    ),
  }
}

/**
 * The segment that names a document's scope: the first one after the longest
 * root base that prefixes the id, so `docs/ko/guide` under base `docs` and
 * `terms/ko/token` under base `terms` both belong to `ko`.
 */
export const scopeOf = (id: string, bases: readonly string[]): string => {
  const base = [...bases]
    .filter((candidate) => !candidate || id.startsWith(`${candidate}/`))
    .sort((a, b) => b.length - a.length)[0]
  const rest = base ? id.slice(base.length + 1) : id
  return rest.split("/")[0]!
}

export function generateDataset({
  inputDir,
  outDir,
  library,
  documents,
  scopes,
  projectionId = "custom",
  requireVersion = true,
  ...projection
}: DatasetOptions) {
  const facts = library
    ? readLibraryFacts(library)
    : { bases: [""], privateIds: new Set<string>() }
  const entries = sourceFiles(inputDir, [".json"])
    .filter(
      (file) => !["manifest.json", "meta.json"].includes(path.basename(file)),
    )
    .map((file) => ({
      file,
      id: posix(path.relative(inputDir, file)).replace(/\.json$/, ""),
    }))
    .filter((entry) => !facts.privateIds.has(entry.id))
    .filter(
      (entry) =>
        (!documents || documents.includes(entry.id)) &&
        (!scopes || scopes.includes(scopeOf(entry.id, facts.bases))),
    )
  for (const id of documents ?? []) {
    if (facts.privateIds.has(id))
      throw new Error(`cudoc: dataset document is private: ${id}`)
    if (!entries.some((e) => e.id === id))
      throw new Error(`cudoc: dataset document missing: ${id}`)
  }
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
      scopes: scopes ?? [
        ...new Set(entries.map((e) => scopeOf(e.id, facts.bases))),
      ],
      documents: inputs,
    })
  })
  return {
    schemaVersion: "1.0.0",
    documentCount: inputs.length,
    documents: inputs,
  }
}
