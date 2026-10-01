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
 * Creates the lock already holding this process's id, or fails with `EEXIST`.
 *
 * The id is written to a file of this process's own and linked into place:
 * `link` fails when the lock exists, as an exclusive open does, and no other
 * process ever reads the lock before the id is in it. A file system without
 * hard links gets the exclusive open instead, and the id right after it.
 */
function createLock(lock: string): void {
  const pending = `${lock}.${process.pid}-${crypto.randomUUID()}`
  fs.writeFileSync(pending, String(process.pid))
  try {
    fs.linkSync(pending, lock)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw error
    const fd = fs.openSync(lock, "wx")
    try {
      fs.writeSync(fd, String(process.pid))
    } finally {
      fs.closeSync(fd)
    }
  } finally {
    fs.rmSync(pending, { force: true })
  }
}

/** The process id a lock file names, or `NaN` when it names none. */
const holderOf = (lock: string): number => {
  try {
    return Number.parseInt(fs.readFileSync(lock, "utf8"), 10)
  } catch {
    return Number.NaN
  }
}

const busy = (output: string, holder: number) =>
  new Error(
    `cudoc: ${output} is being written by process ${holder}; wait for it to finish`,
  )

/**
 * Takes the lock beside an output directory, holding this process's id, and
 * then recovers what a killed build left there.
 *
 * A lock whose process is gone was left by a build that was killed. A lock
 * held by a live process is a build still running, which is reported by name
 * rather than as `EEXIST`. A stale lock is claimed by renaming it, which only
 * one process can do to that file, and the lock is then taken again before
 * anything else is touched. A process that found the same stale lock but
 * renames after another has already taken the lock over finds a live id in
 * what it moved, puts it back and reports that build instead of taking the
 * lock from it; one that finds the stale lock already gone tries the lock
 * again, and gets either the lock or the name of the process that did.
 *
 * The staging directory and the backup a killed build was working with are
 * recovered only by the process holding the lock. A running build's own
 * directories exist only while it holds the lock, so whatever recovery finds
 * belongs to no build, and a process that lost the lock cannot remove the
 * staging directory of the one that won it. The one window left is between
 * reading a dead id and renaming: a rename that moves a lock another process
 * took over in that moment is put back, but a third process can create the
 * lock while it is away. Closing that would need a rename conditioned on the
 * file's identity, which the file system does not offer.
 */
function acquireLock(lock: string, output: string): void {
  for (;;) {
    try {
      createLock(lock)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    const holder = holderOf(lock)
    if (Number.isInteger(holder) && holder > 0 && processAlive(holder))
      throw busy(output, holder)
    const claimed = `${lock}.stale-${process.pid}-${crypto.randomUUID()}`
    try {
      fs.renameSync(lock, claimed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      // Another process claimed the stale lock first. Whoever takes the lock
      // next recovers the leftovers; this one touches nothing until then.
      continue
    }
    const moved = holderOf(claimed)
    if (
      moved !== holder &&
      Number.isInteger(moved) &&
      moved > 0 &&
      processAlive(moved)
    ) {
      try {
        fs.linkSync(claimed, lock)
      } catch {
        // A lock is back in place already; the one moved here is not needed.
      }
      fs.rmSync(claimed, { force: true })
      throw busy(output, moved)
    }
    fs.rmSync(claimed, { force: true })
  }
  // A leftover that cannot be moved or removed ends this publication, and
  // the lock goes with it, so the next one in this process can try again.
  try {
    recoverLeftovers(output)
  } catch (error) {
    fs.rmSync(lock, { force: true })
    throw error
  }
}

const OWNER_MARKER = ".cudoc-output"
const OWNER_TEXT = "cudoc\n"

/**
 * Whether `dir` is a directory cudoc wrote: a real directory, not a link to
 * one, holding the ownership marker with exactly cudoc's text. Replacing an
 * output and recovering a killed build's leftovers both ask this, so nothing
 * is moved or removed on a weaker test than the one that guards the output.
 */
function ownedDirectory(dir: string): boolean {
  try {
    if (!fs.lstatSync(dir).isDirectory()) return false
    const marker = path.join(dir, OWNER_MARKER)
    return (
      fs.lstatSync(marker).isFile() &&
      fs.readFileSync(marker, "utf8") === OWNER_TEXT
    )
  } catch {
    return false
  }
}

/**
 * Removes a directory `ownedDirectory` accepts, its marker last. A removal
 * that stops partway, a process killed or a file that cannot go, leaves a
 * directory that is still owned, which the next recovery finishes.
 */
function removeOwned(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir))
    if (entry !== OWNER_MARKER)
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
  fs.rmSync(dir, { recursive: true, force: true })
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** The staging prefix; `mkdtempSync` appends six letters or digits to it. */
const STAGING = ".cudoc-staging-"

/**
 * Puts back the backup and removes the staging directory a killed build left
 * beside `output`. Called only with the lock held, so nothing found here is a
 * running build's.
 *
 * Only the names this module gives are considered, `<output>.previous-<uuid>`
 * for a backup and `<output>.cudoc-staging-` and the six letters or digits
 * `mkdtemp` appends for a staging directory, and only when the directory is
 * owned, so a copy of an output someone made by hand under another name is
 * never touched.
 */
function recoverLeftovers(output: string): void {
  const dir = path.dirname(output)
  const name = escape(path.basename(output))
  const backup = new RegExp(`^${name}\\.previous-${UUID}$`)
  const staging = new RegExp(`^${name}${escape(STAGING)}[A-Za-z0-9]{6}$`)
  for (const entry of fs.readdirSync(dir)) {
    const leftover = path.join(dir, entry)
    if (backup.test(entry) && ownedDirectory(leftover)) {
      if (!fs.existsSync(output)) fs.renameSync(leftover, output)
      else removeOwned(leftover)
    } else if (staging.test(entry) && ownedDirectory(leftover))
      removeOwned(leftover)
  }
}

/** Whether a process id names a running process this user can see. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: it exists but belongs to someone else, which still means running.
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
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
  if (fs.existsSync(output) && !ownedDirectory(output))
    throw new Error(`cudoc: refusing to replace unowned directory: ${output}`)
  const lock = `${output}.lock`
  acquireLock(lock, output)
  let staging: string
  try {
    staging = fs.mkdtempSync(`${output}${STAGING}`)
  } catch (error) {
    fs.unlinkSync(lock)
    throw error
  }
  const backup = `${output}.previous-${crypto.randomUUID()}`
  const commit = () => {
    if (fs.existsSync(output)) fs.renameSync(output, backup)
    try {
      fs.renameSync(staging, output)
    } catch (error) {
      if (fs.existsSync(backup)) fs.renameSync(backup, output)
      throw error
    }
    removeOwned(backup)
  }
  const cleanup = () => {
    removeOwned(staging)
    fs.unlinkSync(lock)
  }
  let result: void | Promise<void>
  try {
    fs.writeFileSync(path.join(staging, OWNER_MARKER), OWNER_TEXT)
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
