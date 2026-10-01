/**
 * The committed showcase output must be what the current packages produce.
 *
 * `examples/export/showcase-output/` is the sample linked from the guides: the
 * site, the print HTML, a bound PDF and Word files built from
 * `examples/export/showcase/` with `showcase.config.mjs`. This builds the same
 * configuration into a temporary directory and compares every text output
 * byte for byte, so a rendering or stylesheet change that reaches the sample
 * is a visible diff and a stale sample fails release checks. The PDF and Word
 * files carry creation timestamps, so a PDF is compared by its page count and
 * size class and a Word file by its size class; `npm run showcase` in
 * examples/export rewrites them together.
 *
 * Not run in CI: the sample is built on a release machine, and the page count,
 * the contents page numbers baked into the volume's print HTML and the PDF
 * itself follow the fonts installed there.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const EXAMPLE = path.join(ROOT, "examples/export")
const COMMITTED = path.join(EXAMPLE, "showcase-output")

const { buildExport } = await import(
  pathToFileURL(path.join(EXAMPLE, "node_modules/cudoc-export/dist/index.js"))
    .href
).catch(() => {
  throw new Error("examples/export is not installed; run npm ci there first")
})
const { pdfPageCount } = await import(
  pathToFileURL(path.join(EXAMPLE, "node_modules/cudoc-export/dist/pdf.js"))
    .href
)
const { default: config } = await import(
  pathToFileURL(path.join(EXAMPLE, "showcase.config.mjs")).href
)

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-showcase-"))
const previous = process.cwd()
process.chdir(EXAMPLE)
try {
  await buildExport({
    ...config,
    outDir: path.join(scratch, "out"),
    libraryDir: path.join(scratch, "library"),
  })
} finally {
  process.chdir(previous)
}

const list = (dir) =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name)),
    )
    .sort()
const fresh = list(path.join(scratch, "out"))
const committed = list(COMMITTED)
const problems = []
if (fresh.join("\n") !== committed.join("\n"))
  problems.push(
    `file list differs:\n  fresh only: ${fresh.filter((f) => !committed.includes(f)).join(", ") || "-"}\n  committed only: ${committed.filter((f) => !fresh.includes(f)).join(", ") || "-"}`,
  )
for (const file of fresh.filter((f) => committed.includes(f))) {
  const a = fs.readFileSync(path.join(scratch, "out", file))
  const b = fs.readFileSync(path.join(COMMITTED, file))
  if (/\.(pdf|docx)$/.test(file)) {
    // Timestamps inside; the size should not move by more than a tenth.
    if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) / 10)
      problems.push(`${file}: size ${b.length} committed, ${a.length} fresh`)
    if (file.endsWith(".pdf") && pdfPageCount(a) !== pdfPageCount(b))
      problems.push(
        `${file}: ${pdfPageCount(b)} pages committed, ${pdfPageCount(a)} fresh`,
      )
  } else if (!a.equals(b)) problems.push(`${file}: content differs`)
}
fs.rmSync(scratch, { recursive: true, force: true })
if (problems.length) {
  console.error(
    `export showcase is stale:\n${problems.map((p) => `- ${p}`).join("\n")}\nRun \`npm run showcase\` in examples/export and commit the result.`,
  )
  process.exit(1)
}
console.log(
  `export showcase verified: ${fresh.length} files match the committed sample`,
)
