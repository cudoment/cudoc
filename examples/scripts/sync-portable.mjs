import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
)
const target = process.argv[2] ?? "docs"
fs.mkdirSync(target, { recursive: true })
for (const name of ["portable.md", "reference.md"]) {
  const source = fs.readFileSync(path.join(fixtures, name), "utf8")
  const output = path.join(target, name)
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== source)
    fs.writeFileSync(output, source)
}
