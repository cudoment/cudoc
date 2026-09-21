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
/**
 * Every file under `root` with one of the extensions, sorted, as absolute
 * paths. Dot entries and `node_modules` are always skipped; `exclude` is asked
 * about each remaining entry's POSIX path relative to `root`, and a directory
 * it excludes is not entered, so a symlink inside one is never seen.
 */
export function sourceFiles(
  root: string,
  extensions = [".md", ".mdx"],
  options: { exclude?: (relative: string) => boolean } = {},
): string[] {
  const base = path.resolve(root)
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .flatMap((entry) => {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
          return []
        const file = path.join(dir, entry.name)
        if (options.exclude?.(posix(path.relative(base, file)))) return []
        if (entry.isSymbolicLink())
          throw new Error(`cudoc: symlink in source tree: ${file}`)
        if (entry.isDirectory()) return walk(file)
        return extensions.includes(path.extname(file).toLowerCase())
          ? [file]
          : []
      })
  return walk(base)
}
export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

/**
 * Only replace directories bearing our ownership marker. Never delete arbitrary output.
 *
 * `inputRoots` are the directories the build reads; the output may not sit
 * inside or around any of them. A build callback may be synchronous or
 * asynchronous. The return value of `build` is what decides: a thenable defers
 * the commit until it settles and makes this function return a promise,
 * anything else commits immediately and returns nothing. The overloads are a
 * convenience; the runtime check is the authority.
 */
export function publishDirectory(
  inputRoots: string | string[],
  outputRoot: string,
  build: (staging: string) => void,
): void
export function publishDirectory(
  inputRoots: string | string[],
  outputRoot: string,
  build: (staging: string) => Promise<void>,
): Promise<void>
export function publishDirectory(
  inputRoots: string | string[],
  outputRoot: string,
  build: (staging: string) => void | Promise<void>,
): void | Promise<void> {
  if (fs.existsSync(outputRoot) && fs.lstatSync(outputRoot).isSymbolicLink())
    throw new Error("cudoc: output directory must not be a symlink")
  const output = realPath(outputRoot)
  for (const inputRoot of [inputRoots].flat()) {
    const input = realPath(inputRoot)
    if (contained(input, output) || contained(output, input))
      throw new Error("cudoc: input and output directories overlap")
  }
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
  const commit = () => {
    if (fs.existsSync(output)) fs.renameSync(output, backup)
    try {
      fs.renameSync(staging, output)
    } catch (error) {
      if (fs.existsSync(backup)) fs.renameSync(backup, output)
      throw error
    }
    fs.rmSync(backup, { recursive: true, force: true })
  }
  const cleanup = () => {
    fs.rmSync(staging, { recursive: true, force: true })
    fs.closeSync(fd)
    fs.unlinkSync(lock)
  }
  let result: void | Promise<void>
  try {
    fs.writeFileSync(path.join(staging, ".cudoc-output"), "cudoc\n")
    result = build(staging)
  } catch (error) {
    cleanup()
    throw error
  }
  const pending = result as Promise<void> | undefined
  if (typeof pending?.then !== "function") {
    try {
      commit()
    } finally {
      cleanup()
    }
    return
  }
  return pending.then(commit).finally(cleanup)
}
