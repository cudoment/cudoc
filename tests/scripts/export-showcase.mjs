/**
 * The committed export samples must be what the current packages produce.
 *
 * `examples/export/` commits four builds of `examples/export/showcase/`, each
 * from its own configuration: the site with print HTML, a bound PDF and Word
 * files (`showcase.config.mjs` into `showcase-output/`), standalone pages
 * (`standalone.config.mjs`), single pages for review (`annotate.config.mjs`)
 * and a hosted review (`review.config.mjs`), plus the report the annotations
 * command writes from the sample notes in `review-samples/`. This builds the
 * same configurations into a temporary directory and compares every text
 * output byte for byte, so a rendering or stylesheet change that reaches a
 * sample is a visible diff and a stale sample fails release checks. The PDF
 * and Word files carry creation timestamps, so a PDF is compared by its page
 * count and size class and a Word file by its size class; `npm run showcase`
 * in examples/export rewrites them together.
 *
 * Not run in CI: the samples are built on a release machine, and the page
 * count, the contents page numbers baked into the volume's print HTML and the
 * PDF itself follow the fonts installed there.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const EXAMPLE = path.join(ROOT, "examples/export")
const SAMPLES = [
  ["showcase.config.mjs", "showcase-output"],
  ["standalone.config.mjs", "standalone-output"],
  ["annotate.config.mjs", "annotate-output"],
  ["review.config.mjs", "review-output"],
]
const NOTES = "review-samples/getting-started.annotations.json"
const REPORT = "review-samples/report.md"

const load = (file) =>
  import(
    pathToFileURL(path.join(EXAMPLE, "node_modules/cudoc-export/dist", file))
      .href
  ).catch(() => {
    throw new Error("examples/export is not installed; run npm ci there first")
  })
const { buildExport } = await load("index.js")
const { pdfPageCount } = await load("pdf.js")
const { runAnnotationsCommand } = await load("annotations/cli.js")

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-showcase-"))
const previous = process.cwd()
process.chdir(EXAMPLE)
try {
  for (const [file, output] of SAMPLES) {
    const { default: config } = await import(
      pathToFileURL(path.join(EXAMPLE, file)).href
    )
    await buildExport({
      ...config,
      outDir: path.join(scratch, output),
      libraryDir: path.join(scratch, `${output}-library`),
    })
  }
  // The report names its library relative to where the command runs, so it
  // runs from the scratch directory against a library spelled as committed.
  fs.mkdirSync(path.join(scratch, ".cudoc"), { recursive: true })
  fs.renameSync(
    path.join(scratch, "annotate-output-library"),
    path.join(scratch, ".cudoc/annotate-library"),
  )
  fs.mkdirSync(path.join(scratch, "review-samples"))
  fs.copyFileSync(path.join(EXAMPLE, NOTES), path.join(scratch, NOTES))
  process.chdir(scratch)
  const report = runAnnotationsCommand([
    NOTES,
    "--library",
    ".cudoc/annotate-library",
    "--out",
    REPORT,
  ])
  if (report.exitCode !== 0) throw new Error(report.output)
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
const problems = []
let compared = 0
for (const [, output] of SAMPLES) {
  const freshDir = path.join(scratch, output)
  const committedDir = path.join(EXAMPLE, output)
  const fresh = list(freshDir)
  const committed = fs.existsSync(committedDir) ? list(committedDir) : []
  if (fresh.join("\n") !== committed.join("\n"))
    problems.push(
      `${output}: file list differs:\n  fresh only: ${fresh.filter((f) => !committed.includes(f)).join(", ") || "-"}\n  committed only: ${committed.filter((f) => !fresh.includes(f)).join(", ") || "-"}`,
    )
  for (const file of fresh.filter((f) => committed.includes(f))) {
    compared += 1
    const a = fs.readFileSync(path.join(freshDir, file))
    const b = fs.readFileSync(path.join(committedDir, file))
    if (/\.(pdf|docx)$/.test(file)) {
      // Timestamps inside; the size should not move by more than a tenth.
      if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) / 10)
        problems.push(
          `${output}/${file}: size ${b.length} committed, ${a.length} fresh`,
        )
      if (file.endsWith(".pdf") && pdfPageCount(a) !== pdfPageCount(b))
        problems.push(
          `${output}/${file}: ${pdfPageCount(b)} pages committed, ${pdfPageCount(a)} fresh`,
        )
    } else if (!a.equals(b)) problems.push(`${output}/${file}: content differs`)
  }
}
compared += 1
if (
  !fs
    .readFileSync(path.join(scratch, REPORT))
    .equals(fs.readFileSync(path.join(EXAMPLE, REPORT)))
)
  problems.push(`${REPORT}: content differs`)
fs.rmSync(scratch, { recursive: true, force: true })
if (problems.length) {
  console.error(
    `export showcase is stale:\n${problems.map((p) => `- ${p}`).join("\n")}\nRun \`npm run showcase\` in examples/export and commit the result.`,
  )
  process.exit(1)
}
console.log(
  `export samples verified: ${compared} files match the committed samples`,
)
