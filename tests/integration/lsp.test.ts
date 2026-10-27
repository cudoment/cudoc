/**
 * `cudoc lsp` on each host's own compiler.
 *
 * The server collects with whatever compiler the configuration names, and a
 * host may store a link in another form than the source spells it. The
 * diagnostics an editor receives, and the text a quick fix replaces, have to
 * be the author's on every host.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import { pathToFileURL } from "node:url"
import { describe, it, expect, afterAll } from "vitest"
import { serveLanguageServer } from "@cudoment/cudoc/node/lsp"
import { HOST_CASES, OPTIONS } from "./hosts.js"

type Message = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
}
type Range = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}
type Diagnostic = {
  code: string
  range: Range
  data: { reference: string; suggestions: string[] }
}

/** An editor on the other end of the server's streams. */
function client(config: Parameters<typeof serveLanguageServer>[0]) {
  const input = new PassThrough()
  const output = new PassThrough()
  const received: Message[] = []
  const waiting: {
    test: (m: Message) => boolean
    done: (m: Message) => void
  }[] = []
  let buffer = Buffer.alloc(0)
  output.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const end = buffer.indexOf("\r\n\r\n")
      if (end < 0) return
      const length = Number(
        buffer
          .subarray(0, end)
          .toString()
          .match(/Content-Length: (\d+)/)![1],
      )
      if (buffer.length < end + 4 + length) return
      const message = JSON.parse(
        buffer.subarray(end + 4, end + 4 + length).toString("utf8"),
      ) as Message
      buffer = buffer.subarray(end + 4 + length)
      const waiter = waiting.find((entry) => entry.test(message))
      if (waiter) {
        waiting.splice(waiting.indexOf(waiter), 1)
        waiter.done(message)
      } else received.push(message)
    }
  })
  const served = serveLanguageServer(config, { input, output })
  const write = (message: Message) => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message })
    input.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  const wait = (test: (m: Message) => boolean) =>
    new Promise<Message>((done) => {
      const seen = received.find(test)
      if (seen) {
        received.splice(received.indexOf(seen), 1)
        done(seen)
      } else waiting.push({ test, done })
    })
  let next = 0
  return {
    served,
    wait,
    notify: (method: string, params: Record<string, unknown> = {}) =>
      write({ method, params }),
    request: (method: string, params: Record<string, unknown> = {}) => {
      const id = ++next
      write({ id, method, params })
      return wait((m) => m.id === id && !m.method)
    },
  }
}

/** The text an editor range covers. */
const textAt = (text: string, range: Range) => {
  const lines = text.split("\n")
  return lines[range.start.line]!.slice(
    range.start.character,
    range.end.character,
  )
}

const GUIDE =
  "# Guide (#guide)\n\nSee [the install page](./instal.md) for SDK (=sdk.versoin).\n"

const workspaces: string[] = []
afterAll(() => {
  for (const workspace of workspaces)
    fs.rmSync(workspace, { recursive: true, force: true })
})

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: cudoc lsp`, () => {
    it("publishes the author's references and fixes them in place", async () => {
      const workspace = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-lsp-")),
      )
      workspaces.push(workspace)
      const docs = path.join(workspace, "docs")
      fs.mkdirSync(docs)
      fs.writeFileSync(path.join(docs, "guide.md"), GUIDE)
      fs.writeFileSync(path.join(docs, "install.md"), "# Install (#install)\n")
      const compile = await host.compiler!()
      const editor = client({
        ...OPTIONS,
        sourceRoot: docs,
        outDir: path.join(workspace, "library"),
        host: host.host,
        compilerId: `${host.name}-lsp`,
        compiler: (text, context) => compile(text, context),
      })
      await editor.request("initialize", { capabilities: {} })
      const uri = pathToFileURL(path.join(docs, "guide.md")).href
      const published = editor.wait(
        (m) =>
          m.method === "textDocument/publishDiagnostics" &&
          m.params?.uri === uri,
      )
      editor.notify("initialized")
      const diagnostics = (await published).params!.diagnostics as Diagnostic[]
      expect(
        diagnostics.map((d) => [d.code, d.data.reference, d.data.suggestions]),
      ).toEqual([
        ["undefined-variable", "(=sdk.versoin)", ["(=sdk.version)"]],
        ["missing-document", "./instal.md", ["./install.md"]],
      ])
      // The diagnostic covers the reference as the source spells it.
      for (const diagnostic of diagnostics)
        expect(textAt(GUIDE, diagnostic.range)).toContain(
          diagnostic.data.reference,
        )

      const actions = (
        await editor.request("textDocument/codeAction", {
          textDocument: { uri },
          range: diagnostics[1]!.range,
          context: { diagnostics: [diagnostics[1]] },
        })
      ).result as {
        edit: { changes: Record<string, { range: Range; newText: string }[]> }
      }[]
      const [edit] = actions[0]!.edit.changes[uri]!
      expect([textAt(GUIDE, edit!.range), edit!.newText]).toEqual([
        "./instal.md",
        "./install.md",
      ])

      await editor.request("shutdown")
      editor.notify("exit")
      expect(await editor.served).toBe(0)
    }, 120_000)
  })
}
