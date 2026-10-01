/**
 * The build command as a reader types it: modes, picked documents, strict
 * single pages, a YAML configuration and the retired flag. Runs the built
 * command, and skips naming the command that builds it.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
const built = fs.existsSync(cli)
if (!built)
  console.log(
    "cli: command not built; run npm run build --workspace packages/cudoc-export",
  )
const suite = built ? describe : describe.skip

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-cli-"))
  roots.push(root)
  fs.mkdirSync(path.join(root, "docs"))
  fs.writeFileSync(
    path.join(root, "docs/a.md"),
    "# A\n\n[B](b.md) [Spec](spec.txt)\n",
  )
  fs.writeFileSync(path.join(root, "docs/b.md"), "# B\n\nText.\n")
  fs.writeFileSync(path.join(root, "docs/spec.txt"), "spec")
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, "build", ...args], {
      cwd: root,
      encoding: "utf8",
    })
  return { root, run }
}

suite("cudoc-export build", () => {
  it("writes the documents it is given as standalone pages and names what they need", () => {
    const p = project()
    const result = p.run(
      "docs",
      "--out-dir",
      "out",
      "--mode",
      "standalone",
      "--document",
      "a",
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).files.html).toEqual(["a.html"])
    expect(result.stderr).toContain(
      "cudoc-export: a: needs a file beside it: spec.txt",
    )
    expect(result.stderr).toContain(
      "cudoc-export: a: needs a page beside it: b.md",
    )
    const strict = p.run(
      "docs",
      "--out-dir",
      "out",
      "--mode",
      "standalone",
      "--document",
      "a",
      "--strict",
    )
    expect(strict.status).toBe(1)
    expect(strict.stderr).toMatch(/strict: the pages need what is outside them/)
  })

  it("reads a YAML configuration, and names the replacement of the retired flag", () => {
    const p = project()
    fs.writeFileSync(
      path.join(p.root, "site.yml"),
      "sourceRoot: docs\noutDir: site\ntitle: From YAML\nnavigation:\n  - a.md\n  - b.md\n",
    )
    const result = p.run("--config", "site.yml")
    expect(result.status).toBe(0)
    expect(fs.readFileSync(path.join(p.root, "site/a.html"), "utf8")).toContain(
      "<title>A · From YAML</title>",
    )
    const retired = p.run("docs", "--annotations")
    expect(retired.status).toBe(1)
    expect(retired.stderr).toMatch(
      /--annotations was replaced by --mode annotate/,
    )
  })
})
