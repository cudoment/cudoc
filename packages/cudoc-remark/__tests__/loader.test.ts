/**
 * The loader that ties a document to the prepared library. It has to leave
 * the document meaning what it meant, change its text whenever the library
 * changes, and be undone exactly by the embed plugin's freshness check.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { compile } from "@mdx-js/mdx"
import cudocLibraryLoader, {
  LIBRARY_LOADER,
  libraryFingerprint,
  libraryLoader,
  stripLibraryMarker,
} from "../src/loader.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const run = (source: string | Buffer, outDir: string, rootContext?: string) => {
  const dependencies: string[] = []
  const output = cudocLibraryLoader.call(
    {
      getOptions: () => ({ outDir }),
      rootContext,
      addDependency: (file: string) => dependencies.push(file),
    },
    source,
  )
  return { output, dependencies }
}

it("appends a marker that follows the library and declares the dependency", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-loader-"))
  temporary.push(root)
  const outDir = path.join(root, ".cudoc/documents")
  fs.mkdirSync(outDir, { recursive: true })
  expect(libraryFingerprint(outDir)).toBe("")

  fs.writeFileSync(path.join(outDir, "embeds.json"), '{"blocks":{}}')
  const first = libraryFingerprint(outDir)
  expect(first).toMatch(/^[0-9a-f]{64}$/)
  const before = run("# Title\n\nBody.\n", outDir)
  expect(before.output).toBe(
    `# Title\n\nBody.\n\n\n[cudoc-library]: #${first}\n`,
  )
  expect(before.dependencies).toEqual([path.join(outDir, "embeds.json")])
  expect(stripLibraryMarker(before.output)).toBe("# Title\n\nBody.\n")

  // A changed library changes the output, which is what a bundler that
  // compares outputs needs to see; running twice does not stack markers.
  fs.writeFileSync(path.join(outDir, "embeds.json"), '{"blocks":{"a":1}}')
  fs.utimesSync(
    path.join(outDir, "embeds.json"),
    new Date(),
    new Date(Date.now() + 5000),
  )
  const after = run(before.output, outDir)
  expect(after.output).not.toBe(before.output)
  expect(after.output.match(/\[cudoc-library\]/g)).toHaveLength(1)
  expect(stripLibraryMarker(after.output)).toBe("# Title\n\nBody.\n")

  // The rule is plain JSON, with the fingerprint taken when it is built.
  const rule = libraryLoader(outDir)
  expect(rule).toEqual({
    loader: LIBRARY_LOADER,
    options: { outDir, fingerprint: libraryFingerprint(outDir) },
  })
  expect(JSON.parse(JSON.stringify(rule))).toEqual(rule)

  // A relative outDir resolves from the bundler's root, and a Buffer is text.
  const relative = run(Buffer.from("x\n"), ".cudoc/documents", root)
  expect(relative.dependencies).toEqual([path.join(outDir, "embeds.json")])
})

it("renders nothing in Markdown and in MDX", async () => {
  const marker = "\n\n[cudoc-library]: #abc123\n"
  for (const format of ["md", "mdx"] as const) {
    const code = String(
      await compile(
        { value: `# Title\n\nBody.${marker}`, path: `doc.${format}` },
        { format },
      ),
    )
    expect(code).toContain("Body.")
    expect(code).not.toContain("cudoc-library")
    expect(code).not.toContain("abc123")
  }
})
