/**
 * Collection that repeats: a previous library spares the documents whose text
 * is unchanged, a previous preparation spares the blocks whose documents are
 * unchanged, and the watcher runs both on every change under a root.
 */

import { describe, it, expect, afterEach, vi } from "vitest"
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
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
    fs.writeFileSync(path.join(docs, name), text)
  }
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

/** What the watcher under test produced: a pass, or the error of one. */
type Outcome = { pass: CollectionPass; start: number } | { error: unknown }

/**
 * A watch test's handlers for the watcher under test, and the record it fails
 * with. `ready` only says the first pass ended. On macOS the FSEvents stream
 * behind a recursive `fs.watch` starts on another thread a moment after the
 * call, so a change made before then may go unreported: these tests timed out
 * that way when a first pass took a few milliseconds. The same stream may
 * also report the files the workspace wrote just before the watch, and the
 * pass those reports start would satisfy a test whose own change the watcher
 * never heard. `settle` therefore writes a probe that collection ignores until
 * a second watcher on the root reports it (Node serves a thread's watchers
 * from one stream there, so the watcher under test hears the next change
 * too), and then waits for a pass that started after the last other report.
 * A wait fails once `budget`, kept below the test's own timeout, is spent,
 * with the record: what the second watcher reported and every pass and error,
 * in milliseconds from the start.
 */
const watchRecord = (root: string, budget = 13_000) => {
  const started = Date.now()
  const lines: string[] = []
  const passes: CollectionPass[] = []
  const starts: number[] = []
  let reported: number | undefined
  let waiter: ((outcome: Outcome) => void) | undefined
  let heard: (() => void) | undefined
  const at = () => Date.now() - started
  const note = (line: string) => {
    lines.push(`${String(at()).padStart(6)} ms  ${line}`)
  }
  const recorder = fs
    .watch(root, { recursive: true }, (event, filename) => {
      note(`event ${event} ${String(filename)}`)
      if (String(filename) === ".probe") heard?.()
      else reported = at()
    })
    .on("error", (error) => note(`recorder error: ${String(error)}`))
  const text = () =>
    [
      `load average ${os
        .loadavg()
        .map((load) => load.toFixed(1))
        .join(" ")}`,
      ...lines,
    ].join("\n")
  const within = async <T>(promise: Promise<T>, what: string) => {
    let timer: NodeJS.Timeout | undefined
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`${what} did not come within ${budget} ms\n${text()}`),
          ),
        Math.max(0, started + budget - Date.now()),
      )
    })
    try {
      return await Promise.race([promise, expired])
    } finally {
      clearTimeout(timer)
    }
  }
  /** The first outcome from now on that `match` accepts. */
  const next = async (what: string, match: (outcome: Outcome) => boolean) => {
    let mine: ((outcome: Outcome) => void) | undefined
    try {
      return await within(
        new Promise<Outcome>((resolve) => {
          mine = waiter = (outcome) => {
            if (match(outcome)) resolve(outcome)
          }
        }),
        what,
      )
    } finally {
      if (waiter === mine) waiter = undefined
    }
  }
  return {
    passes,
    note,
    text,
    within,
    next,
    onPass(pass: CollectionPass) {
      const start = at() - pass.elapsed
      note(
        `pass from ${start} ms: compiled [${pass.compiled.join(", ")}] of ${pass.documentCount}`,
      )
      passes.push(pass)
      starts.push(start)
      waiter?.({ pass, start })
    },
    onError(error: unknown) {
      note(`pass failed: ${String(error)}`)
      waiter?.({ error })
    },
    async settle() {
      let timer: NodeJS.Timeout | undefined
      const probed = new Promise<void>((resolve) => {
        heard = resolve
      })
      const write = () => {
        fs.writeFileSync(path.join(root, ".probe"), String(at()))
        timer = setTimeout(write, 25)
      }
      write()
      try {
        await within(probed, "a report of the probe")
      } finally {
        clearTimeout(timer)
        heard = undefined
      }
      note("probe reported")
      // Everything written before the probe has been reported by now.
      const last = reported
      if (last !== undefined && !starts.some((start) => start >= last))
        await next(
          "the pass after the reports before the probe",
          (outcome) => "start" in outcome && outcome.start >= last,
        )
    },
    close() {
      recorder.close()
    },
  }
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

  it("reuses nothing a different cudoc release collected", async () => {
    // Another release may normalize the same text into another tree, so the
    // version is part of the configuration even though no option changed.
    const { docs, outDir } = workspace()
    const options = { sourceRoot: docs, outDir, extractors }
    const library = buildDocuments(options)
    vi.resetModules()
    vi.doMock("node:module", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:module")>()
      const createRequire = (url: string | URL) => {
        const require = actual.createRequire(url)
        return Object.assign(
          (id: string) =>
            id === "../../package.json"
              ? { version: "0.0.0-other" }
              : require(id),
          require,
        )
      }
      return { ...actual, createRequire, default: { ...actual, createRequire } }
    })
    try {
      const other = await import("../src/node/library.js")
      const next = other.buildDocuments({ ...options, previous: library })
      expect(next.configuration).not.toBe(library.configuration)
      expect(next.incremental?.reused).toEqual([])
    } finally {
      vi.doUnmock("node:module")
      vi.resetModules()
    }
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

describe("readPreparedEmbeds", () => {
  it("parses the files once while they are unchanged and again after a collection", async () => {
    const { docs, outDir } = workspace()
    const config = { sourceRoot: docs, outDir, extractors }
    await collectDocuments(config)
    const source = FILES["a.md"]!
    const first = readPreparedEmbeds(outDir, "a", source)
    expect(readPreparedEmbeds(outDir, "a", source)).toBe(first)

    fs.writeFileSync(path.join(docs, "e.md"), "# E (#e)\n\nedited\n")
    await collectDocuments(config, previousCollection(outDir))
    const second = readPreparedEmbeds(outDir, "a", source)
    expect(second).not.toBe(first)
    expect(second.sourceHashes.e).not.toBe(first.sourceHashes.e)
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
    const record = watchRecord(docs)
    let watcher: ReturnType<typeof watchDocuments> | undefined
    try {
      watcher = watchDocuments(
        { sourceRoot: docs, outDir, extractors },
        { debounce: 50, onPass: record.onPass, onError: record.onError },
      )
      await record.within(watcher.ready, "the first pass")
      expect(record.passes[0]?.compiled, record.text()).toHaveLength(5)
      await record.settle()

      record.note("write b.md")
      fs.writeFileSync(
        path.join(docs, "b.md"),
        "# B (#b)\n\n## X (#x)\n\nwatched\n",
      )
      // The watcher is idle, so the next pass is the one this change starts.
      const outcome = await record.next(
        "the pass after b.md",
        (outcome) => "pass" in outcome,
      )
      const second = "pass" in outcome ? outcome.pass : undefined
      expect(second?.compiled, record.text()).toEqual(["b"])
      expect(second?.reused).toBe(4)
      expect(
        JSON.parse(fs.readFileSync(path.join(outDir, "embeds.json"), "utf8"))
          .sourceHashes.b,
      ).toBe(second?.library.documents.find((d) => d.id === "b")!.source.hash)

      // A document that no longer parses as a spec is an error, not a broken library.
      record.note("write a.md")
      fs.writeFileSync(
        path.join(docs, "a.md"),
        "# A (#a)\n\n```cudoc-embed\nsources: [missing.md]\n```\n",
      )
      const failure = await record.next(
        "a failed pass",
        (outcome) => "error" in outcome,
      )
      expect(
        String("error" in failure && failure.error),
        record.text(),
      ).toMatch(/missing document/)
      // The last good pass is still what the host reads, embeds included.
      expect(
        readPreparedEmbeds(
          outDir,
          "b",
          fs.readFileSync(path.join(docs, "b.md"), "utf8"),
        ).sourceHashes.b,
      ).toBe(second?.library.documents.find((d) => d.id === "b")!.source.hash)
    } finally {
      watcher?.close()
      record.close()
    }
  }, 15000)

  it("publishes nothing from a pass whose embeds fail, so the previous library and its embeds still match", async () => {
    const { docs, outDir } = workspace()
    const config = { sourceRoot: docs, outDir, extractors }
    await collectDocuments(config)
    const manifest = fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")
    const embeds = fs.readFileSync(path.join(outDir, "embeds.json"), "utf8")

    fs.writeFileSync(path.join(docs, "e.md"), "# E (#e)\n\nedited\n")
    fs.writeFileSync(
      path.join(docs, "a.md"),
      "# A (#a)\n\n```cudoc-embed\nsources: [missing.md]\n```\n",
    )
    await expect(
      collectDocuments(config, previousCollection(outDir)),
    ).rejects.toThrow(/missing document/)

    expect(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")).toBe(
      manifest,
    )
    expect(fs.readFileSync(path.join(outDir, "embeds.json"), "utf8")).toBe(
      embeds,
    )
    // A page that has nothing to do with the typo still builds.
    expect(() => readPreparedEmbeds(outDir, "c", FILES["c.md"]!)).not.toThrow()
    expect(
      fs.readdirSync(path.dirname(outDir)).filter((name) => name !== "docs"),
    ).toEqual(["library"])
  })

  for (const [from, to] of [
    ["guide", "moved"],
    // A name alone reads as a file with the extension `.5`, and a rename is
    // reported by the directory's names, so this case fails a watcher that
    // judges an entry by its name.
    ["v1.5", "v1.6"],
  ] as const)
    it(`collects again when the directory ${from} is renamed`, async () => {
      const { docs, outDir } = workspace({
        ...FILES,
        [`${from}/intro.md`]: "# Intro (#intro)\n",
      })
      const record = watchRecord(docs)
      let watcher: ReturnType<typeof watchDocuments> | undefined
      try {
        watcher = watchDocuments(
          { sourceRoot: docs, outDir, extractors },
          { debounce: 50, onPass: record.onPass, onError: record.onError },
        )
        await record.within(watcher.ready, "the first pass")
        expect(
          record.passes[0]?.library.documents.map((d) => d.id),
          record.text(),
        ).toContain(`${from}/intro`)
        await record.settle()
        record.note(`rename ${from} to ${to}`)
        fs.renameSync(path.join(docs, from), path.join(docs, to))
        const outcome = await record.next(
          `the pass after renaming ${from}`,
          (outcome) => "pass" in outcome,
        )
        const ids =
          "pass" in outcome
            ? outcome.pass.library.documents.map((d) => d.id)
            : []
        expect(ids, record.text()).toContain(`${to}/intro`)
        expect(ids, record.text()).not.toContain(`${from}/intro`)
      } finally {
        watcher?.close()
        record.close()
      }
    }, 15000)

  it("prints a failed pass when no error handler is given", async () => {
    const { docs, outDir } = workspace({
      "a.md": "# A\n\n```cudoc-embed\nsources: [missing.md]\n```\n",
    })
    const printed: unknown[] = []
    const original = console.error
    console.error = (value: unknown) => printed.push(value)
    const watcher = watchDocuments({ sourceRoot: docs, outDir })
    try {
      await watcher.ready
    } finally {
      watcher.close()
      console.error = original
    }
    expect(String(printed[0])).toMatch(/missing document/)
  })
})
