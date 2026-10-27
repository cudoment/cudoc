/**
 * `cudoc lsp`, driven the way an editor drives it: framed JSON-RPC in, the
 * checker's issues out as diagnostics, its suggestions as quick fixes.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import { pathToFileURL } from "node:url"
import { serveLanguageServer } from "../src/node/lsp.js"

type Message = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string }
}

/** An editor on the other end of the two streams. */
function client(config: Parameters<typeof serveLanguageServer>[0]) {
  const input = new PassThrough()
  const output = new PassThrough()
  const received: Message[] = []
  const waiting: {
    test: (m: Message) => boolean
    done: (m: Message) => void
  }[] = []
  let buffer = ""
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    for (;;) {
      const match = buffer.match(/^Content-Length: (\d+)\r\n\r\n/)
      if (!match) return
      const start = match[0].length
      const length = Number(match[1])
      if (Buffer.byteLength(buffer.slice(start)) < length) return
      const body = Buffer.from(buffer.slice(start)).subarray(0, length)
      buffer = Buffer.from(buffer.slice(start)).subarray(length).toString()
      const message = JSON.parse(body.toString("utf8")) as Message
      received.push(message)
      for (const waiter of waiting.splice(0))
        if (waiter.test(message)) waiter.done(message)
        else waiting.push(waiter)
    }
  })
  const served = serveLanguageServer(config, { input, output })
  let next = 0
  const write = (message: Message) => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message })
    input.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  const wait = (test: (m: Message) => boolean) =>
    new Promise<Message>((done) => {
      const seen = received.find(test)
      if (seen) {
        received.splice(received.indexOf(seen), 1)
        return done(seen)
      }
      waiting.push({
        test,
        done: (message) => {
          received.splice(received.indexOf(message), 1)
          done(message)
        },
      })
    })
  return {
    served,
    request: (method: string, params: Record<string, unknown> = {}) => {
      const id = ++next
      write({ id, method, params })
      return wait((m) => m.id === id && !m.method)
    },
    notify: (method: string, params: Record<string, unknown> = {}) =>
      write({ method, params }),
    wait,
    diagnostics: (uri: string) =>
      wait(
        (m) =>
          m.method === "textDocument/publishDiagnostics" &&
          m.params?.uri === uri,
      ),
  }
}

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

const workspace = () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-lsp-")),
  )
  roots.push(root)
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  write(
    "docs/en/guide.md",
    "# Guide\n\nSee [the install page](./instal.md) for SDK (=sdk.versoin).\n",
  )
  write("docs/en/install.md", "# Install\n\nRun it.\n")
  write("docs/ko/guide.md", "# 가이드\n\n본문.\n")
  write("docs/ko/install.md", "# 설치\n\n실행합니다.\n")
  return {
    root,
    write,
    uri: (file: string) => pathToFileURL(path.join(root, file)).href,
    config: {
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      variables: { "sdk.version": "2.8.3" },
      check: {
        translations: [
          { code: "en", prefix: "en/" },
          { code: "ko", prefix: "ko/" },
        ],
      },
    },
  }
}

describe("cudoc lsp", () => {
  it("publishes the checker's issues and offers its suggestions as fixes", async () => {
    const space = workspace()
    const editor = client(space.config)
    const init = await editor.request("initialize", { capabilities: {} })
    expect(init.result).toMatchObject({
      capabilities: {
        textDocumentSync: { openClose: true, change: 1 },
        codeActionProvider: { codeActionKinds: ["quickfix"] },
      },
      serverInfo: { name: "cudoc" },
    })
    const guide = space.uri("docs/en/guide.md")
    const published = editor.diagnostics(guide)
    editor.notify("initialized")
    const { params } = await published
    const diagnostics = params!.diagnostics as {
      code: string
      severity: number
      range: { start: { line: number; character: number } }
      data: { reference: string; suggestions: string[] }
    }[]
    expect(
      diagnostics.map((d) => [
        d.code,
        d.severity,
        d.range.start.line,
        d.data.reference,
        d.data.suggestions,
      ]),
    ).toEqual([
      ["undefined-variable", 1, 2, "(=sdk.versoin)", ["(=sdk.version)"]],
      [
        "missing-document",
        1,
        2,
        "./instal.md",
        ["./install.md", "../ko/install.md"],
      ],
    ])
    const missing = diagnostics[1]!

    // The edit replaces the reference, not the whole link it is in.
    const actions = (
      await editor.request("textDocument/codeAction", {
        textDocument: { uri: guide },
        range: missing.range,
        context: { diagnostics: [missing] },
      })
    ).result as {
      title: string
      kind: string
      isPreferred?: boolean
      edit: { changes: Record<string, { range: unknown; newText: string }[]> }
    }[]
    const replaced = {
      start: { line: 2, character: 23 },
      end: { line: 2, character: 34 },
    }
    expect(actions).toEqual(
      ["./install.md", "../ko/install.md"].map((newText, index) => ({
        title: `Replace with ${newText}`,
        kind: "quickfix",
        diagnostics: [missing],
        ...(index === 0 ? { isPreferred: true } : {}),
        edit: { changes: { [guide]: [{ range: replaced, newText }] } },
      })),
    )

    // Fixed on disk and saved: the file's diagnostics are cleared.
    space.write(
      "docs/en/guide.md",
      "# Guide\n\nSee [the install page](./install.md) for SDK (=sdk.version).\n",
    )
    const cleared = editor.diagnostics(guide)
    editor.notify("textDocument/didSave", { textDocument: { uri: guide } })
    expect((await cleared).params!.diagnostics).toEqual([])

    expect(
      (
        await editor.request("cudoc/counterpart", {
          textDocument: { uri: guide },
        })
      ).result,
    ).toEqual([{ language: "ko", uri: space.uri("docs/ko/guide.md") }])

    const unknown = await editor.request("textDocument/hover", {})
    expect(unknown.error?.code).toBe(-32601)
    expect((await editor.request("shutdown")).result).toBeNull()
    editor.notify("exit")
    expect(await editor.served).toBe(0)
  })

  it("logs a collection that fails and keeps serving", async () => {
    const space = workspace()
    // A document collection cannot read stops the pass.
    space.write("docs/en/broken.md", "---\ntitle: [unclosed\n---\n\n# Broken\n")
    const editor = client(space.config)
    await editor.request("initialize", {})
    const failed = (type: number) =>
      editor.wait(
        (m) =>
          m.method === "window/logMessage" &&
          (m.params as { type: number }).type === type,
      )
    const logged = failed(1)
    editor.notify("initialized")
    const { message } = (await logged).params as { message: string }
    expect(message).toMatch(/^cudoc: /)
    expect(message).not.toMatch(/^cudoc: cudoc/)

    // Fixed and saved, the next pass runs and publishes.
    space.write("docs/en/broken.md", "# Broken\n")
    const guide = space.uri("docs/en/guide.md")
    const published = editor.diagnostics(guide)
    const checked = failed(3)
    editor.notify("textDocument/didSave", {
      textDocument: { uri: space.uri("docs/en/broken.md") },
    })
    expect(
      ((await published).params!.diagnostics as { code: string }[]).map(
        (d) => d.code,
      ),
    ).toEqual(["undefined-variable", "missing-document"])
    expect(((await checked).params as { message: string }).message).toMatch(
      /^cudoc: checked 5 documents/,
    )
    // An exit without a shutdown request is the protocol's error exit.
    editor.notify("exit")
    expect(await editor.served).toBe(1)
  })

  it("answers a request its handler fails on with an error", async () => {
    const space = workspace()
    const editor = client(space.config)
    await editor.request("initialize", {})
    const published = editor.diagnostics(space.uri("docs/en/guide.md"))
    editor.notify("initialized")
    await published
    // An unsaved buffer's URI names no file to pair.
    const answer = await editor.request("cudoc/counterpart", {
      textDocument: { uri: "untitled:Untitled-1" },
    })
    expect(answer.error?.code).toBe(-32603)
    expect(answer.error?.message).toMatch(/^cudoc: /)
    editor.notify("exit")
    expect(await editor.served).toBe(1)
  })

  it("refuses to replace a library another compiler collected", async () => {
    const space = workspace()
    // The site's collector wrote the library with its host compiler.
    const { buildDocuments } = await import("../src/node/library.js")
    const { compileDocument } = await import("../src/markdown.js")
    buildDocuments({
      sourceRoot: space.config.sourceRoot,
      outDir: space.config.outDir,
      compiler: (source, context) =>
        compileDocument(source, { ...context.options }),
      compilerId: "host-compiler",
    })
    const manifest = path.join(space.config.outDir, "manifest.json")
    const written = fs.readFileSync(manifest, "utf8")
    const editor = client(space.config)
    await editor.request("initialize", {})
    const logged = editor.wait(
      (m) =>
        m.method === "window/logMessage" &&
        (m.params as { type: number }).type === 1,
    )
    editor.notify("initialized")
    expect(((await logged).params as { message: string }).message).toMatch(
      /^cudoc lsp: .+ was collected with host-compiler for markdown, and this configuration collects with cudoc-markdown-v1 for markdown\./,
    )
    expect(fs.readFileSync(manifest, "utf8")).toBe(written)
    editor.notify("exit")
    expect(await editor.served).toBe(1)
  })
})
