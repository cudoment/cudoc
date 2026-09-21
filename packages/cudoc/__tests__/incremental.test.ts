/**
 * Collection that repeats: a previous library spares the documents whose text
 * is unchanged, a previous preparation spares the blocks whose documents are
 * unchanged, and the watcher runs both on every change under a root.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { DocumentOptions } from "../src/document.js"
import { compileDocument } from "../src/markdown.js"
import {
  buildDocuments,
  buildDocumentsAsync,
  type Library,
} from "../src/node/library.js"
import {
  prepareEmbeds,
  readPreparedEmbeds,
  type PreparedEmbeds,
} from "../src/node/prepare-embeds.js"
import {
  collectDocuments,
  previousCollection,
  watchDocuments,
  type CollectionPass,
} from "../src/node/watch.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const FILES: Record<string, string> = {
  "a.md": "# A (#a)\n\n```cudoc-embed\nsources: [b.md#x]\n```\n",
  "b.md": "# B (#b)\n\n## X (#x)\n\nfrom b\n",
  "c.md": "# C (#c)\n\n```cudoc-embed\nsources: [a.md#a]\n```\n",
  "d.md":
    "# D (#d)\n\n```cudoc-embed\nsources: [b.md]\nselect:\n  depth: 2\nrender:\n  type: table\n  columns:\n    - { header: R, value: { extractor: ref } }\n```\n",
  "e.md": "# E (#e)\n\nno embeds\n",
}

const workspace = (files = FILES) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-incremental-"))
  temporary.push(root)
  const docs = path.join(root, "docs")
  fs.mkdirSync(docs)
  for (const [name, text] of Object.entries(files))
    fs.writeFileSync(path.join(docs, name), text)
  return { root, docs, outDir: path.join(root, "library") }
}

const counting = () => {
  const compiled: string[] = []
  return {
    compiled,
    compiler(
      source: string,
      context: { id: string; options: DocumentOptions },
    ) {
      compiled.push(context.id)
      return compileDocument(source, context.options)
    },
  }
}

const extractors = {
  ref: { version: "v1", extract: () => "ref" },
}

describe("buildDocuments with a previous library", () => {
  it("compiles only the documents whose text changed", () => {
    const { docs, outDir } = workspace()
    const first = counting()
    const options = {
      sourceRoot: docs,
      outDir,
      compilerId: "count-v1",
      extractors,
    }
    const library = buildDocuments({ ...options, compiler: first.compiler })
    expect(first.compiled).toEqual(["a", "b", "c", "d", "e"])
    expect(library.incremental).toBe(undefined)

    fs.writeFileSync(
      path.join(docs, "b.md"),
      "# B (#b)\n\n## X (#x)\n\nedited\n",
    )
    const second = counting()
    const next = buildDocuments({
      ...options,
      compiler: second.compiler,
      previous: library,
    })
    expect(second.compiled).toEqual(["b"])
    expect(next.incremental).toEqual({
      compiled: ["b"],
      reused: ["a", "c", "d", "e"],
    })
    // Reused documents are the previous objects, and the changed one is new.
    expect(next.documents.find((d) => d.id === "a")).toBe(
      library.documents.find((d) => d.id === "a"),
    )
    expect(next.documents.find((d) => d.id === "b")?.source.text).toContain(
      "edited",
    )
    // The published library holds all five, reused or not.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
    )
    expect(manifest.documents.map((d: { id: string }) => d.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
  })

  it("compiles everything again when the configuration differs, and follows added and removed files", () => {
    const { docs, outDir } = workspace()
    const options = { sourceRoot: docs, outDir, compilerId: "count-v1" }
    const library = buildDocuments({
      ...options,
      compiler: counting().compiler,
      extractors,
    })
    const rerouted = counting()
    buildDocuments({
      ...options,
      compiler: rerouted.compiler,
      extractors,
      routeBase: "/docs",
      previous: library,
    })
    expect(rerouted.compiled).toHaveLength(5)

    fs.rmSync(path.join(docs, "e.md"))
    fs.writeFileSync(path.join(docs, "f.md"), "# F (#f)\n")
    const changed = counting()
    const next = buildDocuments({
      ...options,
      compiler: changed.compiler,
      extractors,
      previous: library,
    })
    expect(changed.compiled).toEqual(["f"])
    expect(next.documents.map((d) => d.id)).toEqual(["a", "b", "c", "d", "f"])
  })

  it("spares the async compiler the unchanged documents too", async () => {
    const { docs, outDir } = workspace()
    const options = { sourceRoot: docs, outDir, compilerId: "count-v1" }
    const first = counting()
    const library = await buildDocumentsAsync({
      ...options,
      compiler: async (source, context) => first.compiler(source, context),
    })
    fs.writeFileSync(path.join(docs, "e.md"), "# E (#e)\n\nedited\n")
    const second = counting()
    const next = await buildDocumentsAsync({
      ...options,
      compiler: async (source, context) => second.compiler(source, context),
      previous: library,
    })
    expect(second.compiled).toEqual(["e"])
    expect(next.incremental?.reused).toEqual(["a", "b", "c", "d"])
    expect(next.asyncCompiler).toBeDefined()
  })
})

describe("prepareEmbeds with a previous preparation", () => {
  const collect = (docs: string, outDir: string, previous?: Library) =>
    buildDocuments({ sourceRoot: docs, outDir, extractors, previous })
  const keyOf = (prepared: PreparedEmbeds, id: string) =>
    Object.keys(prepared.blocks).find((key) => key.startsWith(`${id}:`))!

  it("records what every block read and resolves again only what those changes touch", async () => {
    const { docs, outDir } = workspace()
    const library = collect(docs, outDir)
    const first = await prepareEmbeds(library, outDir)
    expect(first.schemaVersion).toBe(2)
    expect(first.dependencies[keyOf(first, "a")]).toEqual(["b"])
    // c embeds a, whose fence embeds b: both are dependencies.
    expect(first.dependencies[keyOf(first, "c")]).toEqual(["a", "b"])
    expect(first.dependencies[keyOf(first, "d")]).toEqual(["*", "b"])

    // Nothing changed: every block but the extractor's is the same object.
    const same = await prepareEmbeds(collect(docs, outDir, library), outDir, {
      previous: first,
    })
    expect(same.blocks[keyOf(first, "a")]).toBe(first.blocks[keyOf(first, "a")])
    expect(same.blocks[keyOf(first, "c")]).toBe(first.blocks[keyOf(first, "c")])
    expect(same.blocks[keyOf(first, "d")]).not.toBe(
      first.blocks[keyOf(first, "d")],
    )

    // b changed: a and c depend on it; the extractor block is new anyway.
    fs.writeFileSync(
      path.join(docs, "b.md"),
      "# B (#b)\n\n## X (#x)\n\nedited\n",
    )
    const next = collect(docs, outDir, library)
    const second = await prepareEmbeds(next, outDir, { previous: first })
    expect(second.blocks[keyOf(first, "a")]).not.toBe(
      first.blocks[keyOf(first, "a")],
    )
    expect(JSON.stringify(second.blocks[keyOf(first, "a")])).toContain("edited")
    expect(second.blocks[keyOf(first, "c")]).not.toBe(
      first.blocks[keyOf(first, "c")],
    )

    // e changed: no block reads it, so every non-extractor block is reused.
    fs.writeFileSync(path.join(docs, "e.md"), "# E (#e)\n\nedited\n")
    const third = await prepareEmbeds(collect(docs, outDir, next), outDir, {
      previous: second,
    })
    expect(third.blocks[keyOf(first, "a")]).toBe(
      second.blocks[keyOf(first, "a")],
    )
    expect(third.blocks[keyOf(first, "c")]).toBe(
      second.blocks[keyOf(first, "c")],
    )
  })

  it("reuses nothing when a document was added or the configuration changed", async () => {
    const { docs, outDir } = workspace()
    const library = collect(docs, outDir)
    const first = await prepareEmbeds(library, outDir)
    fs.writeFileSync(path.join(docs, "f.md"), "# F (#f)\n")
    const added = await prepareEmbeds(collect(docs, outDir, library), outDir, {
      previous: first,
    })
    expect(added.blocks[keyOf(first, "a")]).not.toBe(
      first.blocks[keyOf(first, "a")],
    )
    const rerouted = buildDocuments({
      sourceRoot: docs,
      outDir,
      extractors,
      routeBase: "/docs",
    })
    const other = await prepareEmbeds(rerouted, outDir, { previous: added })
    expect(other.blocks[keyOf(first, "a")]).not.toBe(
      added.blocks[keyOf(first, "a")],
    )
    // What the host reads back is the new schema, and the old one is stale.
    const read = readPreparedEmbeds(outDir, "a", FILES["a.md"]!)
    expect(read.dependencies[keyOf(first, "a")]).toEqual(["b"])
    fs.writeFileSync(
      path.join(outDir, "embeds.json"),
      JSON.stringify({ ...other, schemaVersion: 1 }),
    )
    expect(() => readPreparedEmbeds(outDir, "a", FILES["a.md"]!)).toThrow(
      /stale prepared embeds/,
    )
  })
})

describe("collectDocuments and watchDocuments", () => {
  it("starts from the output directory and reports what each pass did", async () => {
    const { docs, outDir } = workspace()
    const config = { sourceRoot: docs, outDir, extractors }
    const first = await collectDocuments(config)
    expect(first.compiled).toEqual(["a", "b", "c", "d", "e"])
    expect(first.reused).toBe(0)
    expect(first.blocks).toBe(3)
    expect(first.reusedBlocks).toBe(0)

    // A new process finds the published files and continues from them.
    const state = previousCollection(outDir)
    expect(state.library?.documents).toHaveLength(5)
    expect(state.prepared?.schemaVersion).toBe(2)
    fs.writeFileSync(path.join(docs, "e.md"), "# E (#e)\n\nedited\n")
    const second = await collectDocuments(config, state)
    expect(second.compiled).toEqual(["e"])
    expect(second.reused).toBe(4)
    // The extractor block is the only one resolved again.
    expect(second.reusedBlocks).toBe(2)
    expect(second.elapsed).toBeGreaterThanOrEqual(0)
    expect(previousCollection(path.join(outDir, "missing"))).toEqual({})
  })

  it("collects again after a source under the root changes", async () => {
    const { docs, outDir } = workspace()
    const passes: CollectionPass[] = []
    const errors: unknown[] = []
    // Resolves at the end of the next pass, successful or not.
    let resolveNext: ((pass: CollectionPass | undefined) => void) | undefined
    const nextPass = () =>
      new Promise<CollectionPass | undefined>((resolve) => {
        resolveNext = resolve
      })
    const settle = (pass?: CollectionPass) => {
      resolveNext?.(pass)
      resolveNext = undefined
    }
    const watcher = watchDocuments(
      { sourceRoot: docs, outDir, extractors },
      {
        debounce: 50,
        onPass: (pass) => {
          passes.push(pass)
          settle(pass)
        },
        onError: (error) => {
          errors.push(error)
          settle()
        },
      },
    )
    try {
      await watcher.ready
      expect(passes).toHaveLength(1)
      expect(passes[0]!.compiled).toHaveLength(5)

      let waiting = nextPass()
      fs.writeFileSync(
        path.join(docs, "b.md"),
        "# B (#b)\n\n## X (#x)\n\nwatched\n",
      )
      const second = (await waiting)!
      expect(second.compiled).toEqual(["b"])
      expect(second.reused).toBe(4)
      expect(
        JSON.parse(fs.readFileSync(path.join(outDir, "embeds.json"), "utf8"))
          .sourceHashes.b,
      ).toBe(second.library.documents.find((d) => d.id === "b")!.source.hash)

      // A document that no longer parses as a spec is an error, not a broken library.
      waiting = nextPass()
      const errorsBefore = errors.length
      fs.writeFileSync(
        path.join(docs, "a.md"),
        "# A (#a)\n\n```cudoc-embed\nsources: [missing.md]\n```\n",
      )
      expect(await waiting).toBe(undefined)
      expect(errors.length).toBeGreaterThan(errorsBefore)
      expect(String(errors.at(-1))).toMatch(/missing document/)
      expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true)
    } finally {
      watcher.close()
    }
  }, 15000)
})
