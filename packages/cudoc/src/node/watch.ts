/**
 * Collection that repeats as sources change.
 *
 * A pass is what the CLI's `collect` does once: build the library, then
 * prepare the embeds. Here every pass after the first hands the previous
 * library and the previous preparation back in, so only the documents whose
 * text changed compile again and only the blocks that read a changed document
 * resolve again. The watcher runs a pass when a file under any root changes,
 * after a short quiet period, and keeps the last good result when a pass
 * fails, so a half-typed document is an error message rather than a broken
 * library.
 */

import fs from "node:fs"
import path from "node:path"
import type { CompiledDocument } from "../markdown.js"
import {
  loadLibrary,
  resolveRoots,
  type BuildDocumentsOptions,
  type Library,
} from "./library.js"
import { collectLibrary, collectLibraryAsync } from "./collect.js"
import { prepareEmbeds, type PreparedEmbeds } from "./prepare-embeds.js"
import { publishDirectory } from "./storage.js"

/**
 * A collection configuration as a config file exports it: the build options,
 * where the compiler may return its result synchronously or as a promise.
 */
export type CollectConfig = Omit<BuildDocumentsOptions, "compiler"> & {
  compiler?: (
    ...parameters: Parameters<NonNullable<BuildDocumentsOptions["compiler"]>>
  ) => CompiledDocument | Promise<CompiledDocument>
}

/** What one pass produced and how much of it was new. */
export type CollectionPass = {
  library: Library
  prepared: PreparedEmbeds
  documentCount: number
  /** Ids of the documents this pass compiled. Every document on a full pass. */
  compiled: string[]
  /** Documents taken from the previous library unchanged. */
  reused: number
  /** Embed blocks in the library, and how many were taken from the previous preparation. */
  blocks: number
  reusedBlocks: number
  outDir: string
  /** Wall-clock milliseconds the pass took. */
  elapsed: number
}

export type CollectionState = {
  library?: Library
  prepared?: PreparedEmbeds
}

/**
 * The library and preparation already in `outDir`, when they load and are
 * worth reusing, so a watcher's first pass compiles only what changed since
 * the last run. Anything unreadable or incompatible means starting fresh.
 */
export function previousCollection(
  outDir = ".cudoc/documents",
): CollectionState {
  const state: CollectionState = {}
  try {
    if (fs.existsSync(path.join(outDir, "manifest.json")))
      state.library = loadLibrary(outDir)
  } catch {
    return {}
  }
  try {
    const file = path.join(outDir, "embeds.json")
    if (state.library && fs.existsSync(file)) {
      const prepared = JSON.parse(fs.readFileSync(file, "utf8"))
      if (prepared?.schemaVersion === 2) state.prepared = prepared
    }
  } catch {
    delete state.prepared
  }
  return state
}

/**
 * One pass: collect, then prepare, then publish both at once. With
 * `previous`, an unchanged document is not compiled and an unaffected block
 * is not resolved; the published files are complete either way. Nothing is
 * written until every embed has resolved, so a pass that fails leaves the
 * previous library and its prepared embeds in place, still matching.
 */
export async function collectDocuments(
  config: CollectConfig,
  previous: CollectionState = {},
): Promise<CollectionPass> {
  const started = Date.now()
  const { compiler, ...rest } = config
  const options = { ...rest, previous: previous.library }
  const collection = compiler
    ? await collectLibraryAsync({
        ...options,
        compiler: async (...parameters) => compiler(...parameters),
      })
    : collectLibrary(options)
  const { library, outDir } = collection
  // Assigned by the publication below, which throws if preparation fails.
  let prepared!: PreparedEmbeds
  await publishDirectory(collection.inputs, outDir, async (staging) => {
    collection.write(staging)
    prepared = await prepareEmbeds(library, staging, {
      previous: previous.prepared,
    })
  })
  const keys = Object.keys(prepared.blocks)
  return {
    library,
    prepared,
    documentCount: library.documents.length,
    compiled:
      library.incremental?.compiled ??
      library.documents.map((document) => document.id),
    reused: library.incremental?.reused.length ?? 0,
    blocks: keys.length,
    reusedBlocks: keys.filter(
      (key) => previous.prepared?.blocks[key] === prepared.blocks[key],
    ).length,
    outDir,
    elapsed: Date.now() - started,
  }
}

export type WatchOptions = {
  /** Quiet time after the last change before a pass starts, in milliseconds. Default 150. */
  debounce?: number
  /** The result of every pass, the first included. */
  onPass?: (pass: CollectionPass) => void
  /**
   * A failed pass, or a watcher the system stopped. The watcher keeps the last
   * good result and keeps running. Default: print the error to stderr.
   */
  onError?: (error: unknown) => void
  /**
   * Whether the first pass may start from what `outDir` already holds.
   * Default true.
   */
  reuseOutput?: boolean
}

export type CollectionWatcher = {
  /** Resolves when the first pass has finished, whether it succeeded or failed. */
  ready: Promise<void>
  /** Stops watching. A pass in progress finishes. */
  close(): void
}

/**
 * Whether a change may alter what collection reads: a Markdown file, a
 * directory, or an entry that is gone, which may have been a directory
 * renamed, moved or deleted with its documents inside. A name alone cannot
 * tell `v1.5/` from a file, so what is still there is looked at. Dot entries
 * and `node_modules` are never collected, so changes under them are ignored.
 */
const isSource = (root: string, filename: string | Buffer | null) => {
  if (filename === null) return true
  const segments = String(filename).split(/[\\/]/)
  if (
    segments.some(
      (segment) => segment.startsWith(".") || segment === "node_modules",
    )
  )
    return false
  if (/\.mdx?$/i.test(segments[segments.length - 1] ?? "")) return true
  try {
    return fs.statSync(path.join(root, String(filename))).isDirectory()
  } catch {
    return true
  }
}

/**
 * Collects once, then again whenever a `.md` or `.mdx` file under any root is
 * created, changed, renamed or deleted. Changes that arrive while a pass runs
 * start another pass when it finishes, so the output always reflects the
 * latest files.
 */
export function watchDocuments(
  config: CollectConfig,
  options: WatchOptions = {},
): CollectionWatcher {
  const debounce = options.debounce ?? 150
  const report = options.onError ?? ((error: unknown) => console.error(error))
  const roots = resolveRoots(config)
  let state: CollectionState =
    options.reuseOutput === false ? {} : previousCollection(config.outDir)
  let running: Promise<void> | undefined
  let pending = false
  let timer: NodeJS.Timeout | undefined
  let closed = false

  const pass = async () => {
    try {
      const result = await collectDocuments(config, state)
      state = { library: result.library, prepared: result.prepared }
      options.onPass?.(result)
    } catch (error) {
      report(error)
    }
  }
  const run = (): Promise<void> => {
    if (running) {
      pending = true
      return running
    }
    running = pass().then(async () => {
      running = undefined
      if (pending && !closed) {
        pending = false
        await run()
      }
    })
    return running
  }
  const schedule = (root: string, filename: string | Buffer | null) => {
    if (closed || !isSource(root, filename)) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, debounce)
  }
  const watchers = roots.map((root) =>
    // A watcher the system gives up on — too many watched files, a root
    // deleted — emits an error; without a listener that ends the process.
    fs
      .watch(root.dir, { recursive: true }, (_event, filename) =>
        schedule(root.dir, filename),
      )
      .on("error", (error) => report(error)),
  )
  return {
    ready: run(),
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      for (const watcher of watchers) watcher.close()
    },
  }
}
