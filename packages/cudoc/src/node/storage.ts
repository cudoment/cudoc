import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

export const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex")
export const posix = (value: string) => value.split(path.sep).join("/")
export function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}
export function realPath(target: string): string {
  const absolute = path.resolve(target)
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute)
  return path.join(realPath(path.dirname(absolute)), path.basename(absolute))
}
export function safePath(root: string, relative: string): string {
  const target = path.resolve(root, relative)
  if (
    !contained(realPath(root), realPath(target)) ||
    target === path.resolve(root)
  )
    throw new Error(`cudoc: path escapes document root: ${relative}`)
  return target
}
export function sourceFiles(
  root: string,
  extensions = [".md", ".mdx"],
): string[] {
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .flatMap((entry) => {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
          return []
        const file = path.join(dir, entry.name)
        if (entry.isSymbolicLink())
          throw new Error(`cudoc: symlink in source tree: ${file}`)
        if (entry.isDirectory()) return walk(file)
        return extensions.includes(path.extname(file).toLowerCase())
          ? [file]
          : []
      })
  return walk(path.resolve(root))
}
export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

/** Only replace directories bearing our ownership marker. Never delete arbitrary output. */
export function publishDirectory(
  inputRoot: string,
  outputRoot: string,
  build: (staging: string) => void,
): void {
  if (fs.existsSync(outputRoot) && fs.lstatSync(outputRoot).isSymbolicLink())
    throw new Error("cudoc: output directory must not be a symlink")
  const input = realPath(inputRoot),
    output = realPath(outputRoot)
  if (contained(input, output) || contained(output, input))
    throw new Error("cudoc: input and output directories overlap")
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const owner = path.join(output, ".cudoc-output")
  if (
    fs.existsSync(output) &&
    (!fs.existsSync(owner) || fs.readFileSync(owner, "utf8") !== "cudoc\n")
  )
    throw new Error(`cudoc: refusing to replace unowned directory: ${output}`)
  const lock = `${output}.lock`
  const fd = fs.openSync(lock, "wx")
  const staging = fs.mkdtempSync(`${output}.tmp-`)
  const backup = `${output}.previous-${crypto.randomUUID()}`
  try {
    fs.writeFileSync(path.join(staging, ".cudoc-output"), "cudoc\n")
    build(staging)
    if (fs.existsSync(output)) fs.renameSync(output, backup)
    try {
      fs.renameSync(staging, output)
    } catch (error) {
      if (fs.existsSync(backup)) fs.renameSync(backup, output)
      throw error
    }
    fs.rmSync(backup, { recursive: true, force: true })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
    fs.closeSync(fd)
    fs.unlinkSync(lock)
  }
}
