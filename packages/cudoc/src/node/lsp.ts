/**
 * `cudoc lsp`: the reference checker as a language server, over stdio.
 *
 * An editor starts it with the same configuration `cudoc collect` and
 * `cudoc check` read. When the editor is ready, and after every save, the
 * server collects the library incrementally, as `cudoc collect --watch`
 * does, and checks it; each issue becomes a diagnostic on the file it is
 * in, a suggestion the checker made becomes a quick fix, and the custom
 * `cudoc/counterpart` request names a document's translations.
 *
 * It speaks the subset of the Language Server Protocol that needs: one
 * full-text document sync, diagnostics, code actions, shutdown. The
 * protocol's messages are JSON-RPC 2.0 with a `Content-Length` header each.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { Readable, Writable } from "node:stream"
import {
  collectDocuments,
  previousCollection,
  type CollectConfig,
  type CollectionState,
} from "./watch.js"
import {
  checkReferences,
  type CheckOptions,
  type ReferenceIssue,
} from "./check.js"
import { sourceFileOf } from "./roots.js"
import {
  resolveTranslations,
  translationId,
  translationKey,
} from "./translations.js"

/** The configuration `cudoc collect` reads, with its `check` options. */
export type LanguageServerConfig = CollectConfig & { check?: CheckOptions }

export type LanguageServerStreams = {
  input: Readable
  output: Writable
}

type Message = {
  jsonrpc: "2.0"
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string }
}

type Position = { line: number; character: number }
type Range = { start: Position; end: Position }
type Diagnostic = {
  range: Range
  severity: 1 | 2
  code: string
  source: "cudoc"
  message: string
  data: { reference: string; suggestions: string[] }
}

const VERSION = (() => {
  try {
    return String(
      JSON.parse(
        fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
      ).version,
    )
  } catch {
    return "0.0.0"
  }
})()

/**
 * Reads `Content-Length` framed messages from a stream as they arrive.
 * Returns the function that stops reading.
 */
function readMessages(
  input: Readable,
  receive: (message: Message) => void,
): () => void {
  let buffer = Buffer.alloc(0)
  const read = (chunk: Buffer | string) => {
    buffer = Buffer.concat([
      buffer,
      typeof chunk === "string" ? Buffer.from(chunk) : chunk,
    ])
    for (;;) {
      const end = buffer.indexOf("\r\n\r\n")
      if (end < 0) return
      const header = buffer.subarray(0, end).toString("ascii")
      const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1])
      if (!Number.isFinite(length)) {
        // Not a header this protocol writes: drop it and read on.
        buffer = buffer.subarray(end + 4)
        continue
      }
      if (buffer.length < end + 4 + length) return
      const body = buffer.subarray(end + 4, end + 4 + length).toString("utf8")
      buffer = buffer.subarray(end + 4 + length)
      let message: Message
      try {
        message = JSON.parse(body) as Message
      } catch {
        // A body that is not JSON answers nothing.
        continue
      }
      receive(message)
    }
  }
  input.on("data", read)
  return () => {
    input.off("data", read)
    input.pause()
  }
}

/** An issue's place as an editor range, from unist's 1-based points. */
const rangeOf = (issue: ReferenceIssue): Range => {
  const point = (line?: number, column?: number): Position => ({
    line: Math.max(0, (line ?? 1) - 1),
    character: Math.max(0, (column ?? 1) - 1),
  })
  const start = issue.position?.start
  const end = issue.position?.end ?? start
  return {
    start: point(start?.line, start?.column),
    end: point(end?.line, end?.column),
  }
}

/** The text between two editor positions of a document. */
const offsetOf = (text: string, position: Position): number => {
  let offset = 0
  for (let line = 0; line < position.line; line++) {
    const next = text.indexOf("\n", offset)
    if (next < 0) return text.length
    offset = next + 1
  }
  return Math.min(text.length, offset + position.character)
}
const positionOf = (text: string, offset: number): Position => {
  const before = text.slice(0, offset)
  const line = before.split("\n").length - 1
  return { line, character: offset - (before.lastIndexOf("\n") + 1) }
}

/** The compiler a configuration without one collects with. */
const STANDALONE_COMPILER = "cudoc-markdown-v1"

/**
 * Throws when the library in `outDir` was collected with another compiler or
 * for another host than the configuration names. A pass writes the library
 * the site's build reads, and a configuration that only sets up the check,
 * as some guides' `cudoc.config.mjs` does, would replace the host's library
 * with one the plain Markdown compiler made.
 */
const refuseOtherCompiler = (config: CollectConfig) => {
  const outDir = config.outDir ?? ".cudoc/documents"
  let manifest: { compilerId?: string; options?: { host?: string } }
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
    )
  } catch {
    return
  }
  const collected = `${manifest.compilerId ?? STANDALONE_COMPILER} for ${manifest.options?.host ?? "markdown"}`
  const configured = `${config.compilerId ?? STANDALONE_COMPILER} for ${config.host ?? "markdown"}`
  if (collected !== configured)
    throw new Error(
      `cudoc lsp: ${outDir} was collected with ${collected}, and this configuration collects with ${configured}. Give cudoc lsp the configuration the site collects with, so it does not replace that library.`,
    )
}

/**
 * Serves one editor until it sends `exit` or closes the input, and stops
 * reading the input then. Resolves with the exit code the protocol asks
 * for: 0 after a `shutdown` request, 1 without one.
 */
export function serveLanguageServer(
  config: LanguageServerConfig,
  { input, output }: LanguageServerStreams,
): Promise<number> {
  const { check: checkOptions = {}, ...collectConfig } = config
  const languages = checkOptions.translations
    ? resolveTranslations(checkOptions.translations)
    : undefined
  let state: CollectionState = previousCollection(
    collectConfig.outDir ?? ".cudoc/documents",
  )
  /** The text of each document the editor has open, by URI. */
  const open = new Map<string, string>()
  /** The files given diagnostics by the last pass, to clear the ones fixed. */
  let published = new Set<string>()
  let running: Promise<void> | undefined
  let again = false
  let shutdown = false
  let resolve!: (code: number) => void
  const done = new Promise<number>((settle) => (resolve = settle))
  let stop = () => {}
  const finish = () => {
    stop()
    input.off("end", finish)
    resolve(shutdown ? 0 : 1)
  }

  const send = (message: Omit<Message, "jsonrpc">) => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message })
    output.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  const notify = (method: string, params: unknown) =>
    send({ method, params: params as Record<string, unknown> })
  const log = (type: 1 | 3, message: string) =>
    notify("window/logMessage", { type, message })

  /** The file an issue is in, as an absolute path. */
  const fileOf = (issue: ReferenceIssue): string | undefined => {
    if (!issue.documentId) return path.resolve(issue.sourcePath)
    const roots = state.library?.roots
    return roots ? sourceFileOf(roots, issue.sourcePath) : undefined
  }

  const pass = async () => {
    try {
      refuseOtherCompiler(collectConfig)
      const result = await collectDocuments(collectConfig, state)
      state = { library: result.library, prepared: result.prepared }
      const checked = checkReferences(result.library, checkOptions)
      const byFile = new Map<string, Diagnostic[]>()
      for (const issue of checked.issues) {
        const file = fileOf(issue)
        if (!file) continue
        const uri = pathToFileURL(file).href
        const list = byFile.get(uri) ?? []
        list.push({
          range: rangeOf(issue),
          severity: issue.severity === "error" ? 1 : 2,
          code: issue.code,
          source: "cudoc",
          message: issue.message,
          data: {
            reference: issue.reference,
            suggestions: issue.suggestions ?? [],
          },
        })
        byFile.set(uri, list)
      }
      for (const uri of published)
        if (!byFile.has(uri))
          notify("textDocument/publishDiagnostics", { uri, diagnostics: [] })
      for (const [uri, diagnostics] of byFile)
        notify("textDocument/publishDiagnostics", { uri, diagnostics })
      published = new Set(byFile.keys())
      log(
        3,
        `cudoc: checked ${result.documentCount} documents (${result.compiled.length} compiled), ${checked.issues.length} issues`,
      )
    } catch (error) {
      // The last diagnostics stay: they describe the last library that
      // collected, which is still the one on disk.
      const message = error instanceof Error ? error.message : String(error)
      log(1, message.startsWith("cudoc") ? message : `cudoc: ${message}`)
    }
  }
  /** One pass at a time; saves during a pass ask for one more after it. */
  const schedule = () => {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        await pass()
      } while (again)
      running = undefined
    })()
    return running
  }

  const quickFixes = (params: Record<string, unknown>) => {
    const uri = (params.textDocument as { uri: string }).uri
    const diagnostics =
      (params.context as { diagnostics?: Diagnostic[] }).diagnostics ?? []
    let text = open.get(uri)
    if (text === undefined)
      try {
        text = fs.readFileSync(fileURLToPath(uri), "utf8")
      } catch {
        return []
      }
    return diagnostics.flatMap((diagnostic) => {
      const { reference, suggestions = [] } = diagnostic.data ?? {
        reference: "",
      }
      if (!reference || !suggestions.length) return []
      // The issue covers the node the reference is in, such as a whole
      // link; the edit replaces the reference alone.
      const from = offsetOf(text!, diagnostic.range.start)
      const to = Math.max(from, offsetOf(text!, diagnostic.range.end))
      const at = text!.slice(from, to).indexOf(reference)
      if (at < 0) return []
      const range = {
        start: positionOf(text!, from + at),
        end: positionOf(text!, from + at + reference.length),
      }
      return suggestions.map((suggestion, index) => ({
        title: `Replace with ${suggestion}`,
        kind: "quickfix",
        diagnostics: [diagnostic],
        ...(index === 0 ? { isPreferred: true } : {}),
        edit: { changes: { [uri]: [{ range, newText: suggestion }] } },
      }))
    })
  }

  /** The other languages' versions of a document, where they exist. */
  const counterparts = (params: Record<string, unknown>) => {
    const uri = (params.textDocument as { uri: string }).uri
    const library = state.library
    if (!languages || !library?.roots) return []
    const file = fileURLToPath(uri)
    const document = library.documents.find(
      (doc) =>
        path.resolve(sourceFileOf(library.roots!, doc.sourcePath) ?? "") ===
        path.resolve(file),
    )
    const found = document && translationKey(document.id, languages)
    if (!found) return []
    return languages.flatMap((language) => {
      if (language.code === found.code) return []
      const id = translationId(found.key, language.code, languages)
      const other = library.documents.find((doc) => doc.id === id)
      const target = other && sourceFileOf(library.roots!, other.sourcePath)
      return target
        ? [{ language: language.code, uri: pathToFileURL(target).href }]
        : []
    })
  }

  stop = readMessages(input, (message) => {
    try {
      handle(message)
    } catch (error) {
      // A request is answered even when its handler fails, such as on a
      // URI that names no file; a notification has no one to answer.
      if (message.id !== undefined && message.id !== null && message.method)
        send({
          id: message.id,
          error: {
            code: -32603,
            message: `cudoc: ${error instanceof Error ? error.message : String(error)}`,
          },
        })
    }
  })
  function handle(message: Message): void {
    const { id, method, params = {} } = message
    const reply = (result: unknown) => send({ id, result })
    switch (method) {
      case "initialize":
        return reply({
          capabilities: {
            textDocumentSync: {
              openClose: true,
              change: 1,
              save: { includeText: false },
            },
            codeActionProvider: { codeActionKinds: ["quickfix"] },
          },
          serverInfo: { name: "cudoc", version: VERSION },
        })
      case "initialized":
        void schedule()
        return
      case "textDocument/didOpen": {
        const document = params.textDocument as { uri: string; text: string }
        open.set(document.uri, document.text)
        return
      }
      case "textDocument/didChange": {
        const changes = params.contentChanges as { text: string }[]
        const latest = changes.at(-1)
        if (latest)
          open.set((params.textDocument as { uri: string }).uri, latest.text)
        return
      }
      case "textDocument/didClose":
        open.delete((params.textDocument as { uri: string }).uri)
        return
      case "textDocument/didSave":
        void schedule()
        return
      case "textDocument/codeAction":
        return reply(quickFixes(params))
      case "cudoc/counterpart":
        return reply(counterparts(params))
      case "shutdown":
        shutdown = true
        // Answered once the pass in progress, if any, has published.
        void (running ?? Promise.resolve()).then(() => reply(null))
        return
      case "exit":
        finish()
        return
      default:
        if (id !== undefined && id !== null)
          send({
            id,
            error: { code: -32601, message: `cudoc: no method ${method}` },
          })
    }
  }
  input.on("end", finish)
  return done
}
