/**
 * The `cudoc` command line: exit codes, output formats, and what each command
 * leaves on disk. `runCommand` is the whole binary but for the process
 * streams, so these run it directly with a config file of their own.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describeError, runCommand, USAGE } from "../src/node/command.js"
import { readPreparedEmbeds } from "../src/node/prepare-embeds.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const project = (files: Record<string, string>, config: object = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-cli-"))
  temporary.push(root)
  const docs = path.join(root, "docs")
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
    fs.writeFileSync(path.join(docs, name), text)
  }
  const outDir = path.join(root, "library")
  const configFile = path.join(root, "cudoc.config.json")
  fs.writeFileSync(
    configFile,
    JSON.stringify({ sourceRoot: docs, outDir, ...config }),
  )
  return { root, docs, outDir, configFile }
}

const run = async (argv: string[]) => {
  const out: string[] = []
  const errors: unknown[] = []
  const code = await runCommand(argv, {
    out: (text) => out.push(text),
    error: (value) => errors.push(value),
  })
  return { code, out: out.join("\n"), errors: errors.map(String).join("\n") }
}

const SOURCES = {
  "a.md": "# A (#a)\n\n## Limits (#limits)\n\nSixty per minute.\n",
  "b.md": "# B (#b)\n\n```cudoc-embed\nsources: [a.md#limits]\n```\n",
}

describe("cudoc collect", () => {
  it("publishes the library and its prepared embeds", async () => {
    const { configFile, outDir, docs } = project(SOURCES)
    const result = await run(["collect", "--config", configFile])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.out)).toEqual({ documentCount: 2, outDir })
    expect(() =>
      readPreparedEmbeds(
        outDir,
        "b",
        fs.readFileSync(path.join(docs, "b.md"), "utf8"),
      ),
    ).not.toThrow()
  })

  it("keeps the previous output when an embed cannot resolve", async () => {
    const { configFile, outDir, docs } = project(SOURCES)
    await run(["collect", "--config", configFile])
    fs.writeFileSync(
      path.join(docs, "c.md"),
      "# C\n\n```cudoc-embed\nsources: [missing.md]\n```\n",
    )
    const result = await run(["collect", "--config", configFile])
    expect(result.code).toBe(1)
    expect(result.errors).toMatch(
      /cudoc: c\.md, embed 1: missing document missing\.md referenced from c/,
    )
    expect(() =>
      readPreparedEmbeds(
        outDir,
        "b",
        fs.readFileSync(path.join(docs, "b.md"), "utf8"),
      ),
    ).not.toThrow()
  })

  it("names every embed that cannot be prepared in one pass", async () => {
    // Nothing is published until every block resolves, so `check` never sees
    // these; collection itself has to report them all at once.
    const { configFile, outDir } = project({
      ...SOURCES,
      "c.md":
        "# C (#c)\n\n```cudoc-embed\nsources: [missing.md]\n```\n\n```cudoc-embed\nsources: [a.md#nope]\n```\n",
      "d.md": "# D (#d)\n\n```cudoc-embed\nsources: [gone.md]\n```\n",
    })
    const result = await run(["collect", "--config", configFile])
    expect(result.code).toBe(1)
    expect(result.errors).toContain("cudoc: 3 embeds could not be prepared:")
    expect(result.errors).toMatch(/ {2}c\.md, embed 1: .*missing\.md/)
    expect(result.errors).toMatch(/ {2}c\.md, embed 2: .*nope/)
    expect(result.errors).toMatch(/ {2}d\.md, embed 1: .*gone\.md/)
    expect(fs.existsSync(outDir)).toBe(false)
  })
})

describe("cudoc check", () => {
  it("reads the collected library and leaves it, prepared embeds included, as it was", async () => {
    const { configFile, outDir } = project(SOURCES)
    await run(["collect", "--config", configFile])
    const before = fs.readdirSync(outDir).sort()
    const embeds = fs.readFileSync(path.join(outDir, "embeds.json"), "utf8")
    const result = await run(["check", "--config", configFile])
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/no problems found/)
    expect(fs.readdirSync(outDir).sort()).toEqual(before)
    expect(fs.readFileSync(path.join(outDir, "embeds.json"), "utf8")).toBe(
      embeds,
    )
  })

  it("needs no compiler, so a host collector's library checks with a plain config", async () => {
    // A host that cudoc cannot compile by itself: collection would refuse
    // this config without its compiler, checking must not.
    const { configFile, root } = project(SOURCES, { host: "docusaurus" })
    const { collectDocuments } = await import("../src/node/watch.js")
    const { compileDocument } = await import("../src/markdown.js")
    await collectDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, "library"),
      host: "docusaurus",
      compiler: (source, { options }) => compileDocument(source, options),
      compilerId: "test-host",
    })
    const { loadLibrary } = await import("../src/node/library.js")
    expect(loadLibrary(path.join(root, "library")).options.host).toBe(
      "docusaurus",
    )
    const result = await run(["check", "--config", configFile])
    expect(result.errors).toBe("")
    expect(result.code).toBe(0)
  })

  it("exits 1 on an error, prints JSON on request, and fails on warnings under --strict", async () => {
    const { configFile } = project({
      "a.md": "# A (#a)\n\n## Overview\n\n## Overview\n\n[bad](./missing.md)\n",
      "b.md": "# B\n\n[second](./a.md#overview-1)\n",
    })
    await run(["collect", "--config", configFile])

    const text = await run(["check", "--config", configFile])
    expect(text.code).toBe(1)
    expect(text.out).toMatch(/missing-document/)

    const json = await run([
      "check",
      "--config",
      configFile,
      "--format",
      "json",
    ])
    const parsed = JSON.parse(json.out) as {
      issues: { code: string; severity: string }[]
    }
    expect(parsed.issues.map((issue) => issue.code).sort()).toEqual([
      "missing-document",
      "unstable-anchor-link",
    ])

    const { configFile: warningsOnly } = project({
      "a.md": "# A (#a)\n\n## Overview\n\n## Overview\n",
      "b.md": "# B\n\n[second](./a.md#overview-1)\n",
    })
    await run(["collect", "--config", warningsOnly])
    expect((await run(["check", "--config", warningsOnly])).code).toBe(0)
    expect(
      (await run(["check", "--config", warningsOnly, "--strict"])).code,
    ).toBe(1)
  })

  it("checks a table column with the extractor its configuration registers", async () => {
    // A stored library carries no functions, so collection passing is not
    // enough: the check resolves the table again and needs the extractor too.
    const { root, docs, outDir } = project({
      "a.md": "# A (#a)\n\n## Limits (#limits)\n\nSixty per minute.\n",
      "b.md":
        "# B (#b)\n\n```cudoc-embed\nsources: [a.md]\nselect:\n  depth: 2\nrender:\n  type: table\n  columns:\n    - { header: Word, value: { extractor: word } }\n```\n",
    })
    const configFile = path.join(root, "cudoc.config.mjs")
    fs.writeFileSync(
      configFile,
      `export default ${JSON.stringify({ sourceRoot: docs, outDir })
        .slice(0, -1)
        .concat(
          ', extractors: { word: { version: "1", extract: (row) => ({ text: row.section.title }) } } }',
        )}\n`,
    )
    expect((await run(["collect", "--config", configFile])).code).toBe(0)
    const result = await run(["check", "--config", configFile])
    expect(result.out).not.toMatch(/not registered/)
    expect(result.code).toBe(0)
  })

  it("says to collect first when there is no library", async () => {
    const { configFile } = project(SOURCES)
    const result = await run(["check", "--config", configFile])
    expect(result.code).toBe(1)
    expect(result.errors).toMatch(/collect documents before checking them/)
  })
})

describe("cudoc dataset", () => {
  it("writes the dataset the config describes and prints its summary", async () => {
    const { root, configFile, outDir } = project(SOURCES)
    await run(["collect", "--config", configFile])
    const datasetConfig = path.join(root, "dataset.json")
    fs.writeFileSync(
      datasetConfig,
      JSON.stringify({
        inputDir: path.join(outDir, "documents"),
        outDir: path.join(root, "dataset"),
        library: outDir,
      }),
    )
    const result = await run(["dataset", "--config", datasetConfig])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.out)).toMatchObject({ documentCount: 2 })
    expect(fs.existsSync(path.join(root, "dataset"))).toBe(true)
  })
})

describe("printed failures", () => {
  it("prints cudoc's own errors as they read and keeps the stack otherwise", () => {
    expect(describeError(new Error("cudoc: missing section: nope"))).toBe(
      "cudoc: missing section: nope",
    )
    expect(
      describeError(
        new AggregateError([], "cudoc: 2 embeds could not be prepared:"),
      ),
    ).toBe("cudoc: 2 embeds could not be prepared:")
    expect(describeError(new Error(USAGE))).toBe(USAGE)
    // A block's error names its resolver's; repeating it says nothing new.
    expect(
      describeError(
        new Error("cudoc: c.md, embed 1: missing document x", {
          cause: new Error("cudoc: missing document x"),
        }),
      ),
    ).toBe("cudoc: c.md, embed 1: missing document x")
    expect(
      describeError(
        new Error("cudoc: dataset projection failed for a.json", {
          cause: new Error("unsupported AST version", {
            cause: "missing cudocAstVersion",
          }),
        }),
      ),
    ).toBe(
      "cudoc: dataset projection failed for a.json\n  caused by: unsupported AST version\n  caused by: missing cudocAstVersion",
    )
    const fault = new TypeError("x is not a function")
    expect(describeError(fault)).toBe(fault)
    expect(describeError("text")).toBe("text")
  })
})

describe("usage", () => {
  it.each([
    [[]],
    [["publish", "--config", "x.json"]],
    [["check"]],
    [["check", "--config", "x.json", "--format", "yaml"]],
  ])("rejects %j with the usage line", async (argv) => {
    const result = await run(argv)
    expect(result.code).toBe(1)
    expect(result.errors).toContain(USAGE)
  })
})
