/**
 * The publish transaction, in both its synchronous and asynchronous forms.
 *
 * `publishDirectory` decides which form it is running by looking at what the
 * build callback returned, so these exercise the runtime behaviour rather than
 * the overload types: an asynchronous callback must not have its staging
 * directory renamed or removed before it finishes writing, and a rejection has
 * to leave the previous output exactly as it was.
 */

import { describe, it, expect, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { publishDirectory } from "../src/node/storage.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

const workspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-storage-"))
  roots.push(root)
  const input = path.join(root, "docs")
  fs.mkdirSync(input, { recursive: true })
  return { root, input, output: path.join(root, "out") }
}

/** Every transaction has to leave the lock and the staging directory behind it. */
const residue = (output: string) =>
  fs
    .readdirSync(path.dirname(output))
    .filter((entry) => entry.startsWith(`${path.basename(output)}.`))

const seedOwnedOutput = (output: string, contents: string) => {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, ".cudoc-output"), "cudoc\n")
  fs.writeFileSync(path.join(output, "existing.txt"), contents)
}

describe("synchronous publishing", () => {
  it("commits immediately and returns nothing", () => {
    const { input, output } = workspace()
    const result = publishDirectory(input, output, (staging) => {
      fs.writeFileSync(path.join(staging, "page.txt"), "written")
    })
    expect(result).toBeUndefined()
    expect(fs.readFileSync(path.join(output, "page.txt"), "utf8")).toBe(
      "written",
    )
    expect(residue(output)).toEqual([])
  })

  it("leaves the previous output intact when the build throws", () => {
    const { input, output } = workspace()
    seedOwnedOutput(output, "before")
    expect(() =>
      publishDirectory(input, output, () => {
        throw new Error("build failed")
      }),
    ).toThrow("build failed")
    expect(fs.readFileSync(path.join(output, "existing.txt"), "utf8")).toBe(
      "before",
    )
    expect(residue(output)).toEqual([])
  })
})

describe("asynchronous publishing", () => {
  it("publishes only after the build settles", async () => {
    const { input, output } = workspace()
    const pending = publishDirectory(input, output, async (staging) => {
      fs.writeFileSync(path.join(staging, "early.txt"), "early")
      await new Promise((resolve) => setTimeout(resolve, 10))
      fs.writeFileSync(path.join(staging, "late.txt"), "late")
    })
    expect(pending).toBeInstanceOf(Promise)
    expect(fs.existsSync(output)).toBe(false)
    await pending
    expect(fs.readFileSync(path.join(output, "early.txt"), "utf8")).toBe(
      "early",
    )
    expect(fs.readFileSync(path.join(output, "late.txt"), "utf8")).toBe("late")
    expect(residue(output)).toEqual([])
  })

  it("restores the previous output when the build rejects", async () => {
    const { input, output } = workspace()
    seedOwnedOutput(output, "before")
    await expect(
      publishDirectory(input, output, async (staging) => {
        fs.writeFileSync(path.join(staging, "partial.txt"), "partial")
        await new Promise((resolve) => setTimeout(resolve, 10))
        throw new Error("print failed")
      }),
    ).rejects.toThrow("print failed")
    expect(fs.readFileSync(path.join(output, "existing.txt"), "utf8")).toBe(
      "before",
    )
    expect(fs.existsSync(path.join(output, "partial.txt"))).toBe(false)
    expect(residue(output)).toEqual([])
  })

  it("refuses a second transaction while one is in flight", async () => {
    const { input, output } = workspace()
    const pending = publishDirectory(input, output, async (staging) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      fs.writeFileSync(path.join(staging, "page.txt"), "written")
    })
    expect(() => publishDirectory(input, output, () => {})).toThrow(
      new RegExp(`being written by process ${process.pid}`),
    )
    await pending
    expect(residue(output)).toEqual([])
  })
})

describe("a build that was killed", () => {
  // A process id no process holds: far above any real one.
  const DEAD = "999999999"

  it("clears the lock and staging directory it left and publishes", () => {
    const { input, output } = workspace()
    seedOwnedOutput(output, "previous")
    fs.writeFileSync(`${output}.lock`, DEAD)
    fs.mkdirSync(`${output}.cudoc-staging-Ab12Cd`)
    fs.writeFileSync(`${output}.cudoc-staging-Ab12Cd/.cudoc-output`, "cudoc\n")
    publishDirectory(input, output, (staging) => {
      fs.writeFileSync(path.join(staging, "page.txt"), "written")
    })
    expect(fs.readFileSync(path.join(output, "page.txt"), "utf8")).toBe(
      "written",
    )
    expect(residue(output)).toEqual([])
  })

  it("puts the previous output back when it was killed between the two renames", () => {
    const { input, output } = workspace()
    const backup = `${output}.previous-${crypto.randomUUID()}`
    seedOwnedOutput(backup, "previous")
    fs.writeFileSync(`${output}.lock`, DEAD)
    expect(() =>
      publishDirectory(input, output, () => {
        throw new Error("stop before committing")
      }),
    ).toThrow("stop before committing")
    expect(fs.readFileSync(path.join(output, "existing.txt"), "utf8")).toBe(
      "previous",
    )
    expect(residue(output)).toEqual([])
  })

  it("recovers a lock that names no process at all", () => {
    // Only a lock written some other way can be empty: cudoc links its lock
    // into place with the id already in it.
    const { input, output } = workspace()
    fs.writeFileSync(`${output}.lock`, "")
    publishDirectory(input, output, (staging) => {
      fs.writeFileSync(path.join(staging, "page.txt"), "written")
    })
    expect(fs.readFileSync(path.join(output, "page.txt"), "utf8")).toBe(
      "written",
    )
    expect(residue(output)).toEqual([])
  })

  it("reports a live holder by its id, whoever it is", () => {
    const { input, output } = workspace()
    fs.writeFileSync(`${output}.lock`, String(process.ppid))
    expect(() => publishDirectory(input, output, () => {})).toThrow(
      `is being written by process ${process.ppid}; wait for it to finish`,
    )
    expect(fs.readFileSync(`${output}.lock`, "utf8")).toBe(String(process.ppid))
    fs.rmSync(`${output}.lock`)
  })

  it("leaves a directory it does not own alone", () => {
    const { input, output } = workspace()
    fs.writeFileSync(`${output}.lock`, DEAD)
    fs.mkdirSync(`${output}.cudoc-staging-Mn45Bv`)
    publishDirectory(input, output, () => {})
    expect(residue(output)).toEqual(["out.cudoc-staging-Mn45Bv"])
  })

  // A backup or staging name with some other marker, or with none, is a
  // directory someone else put there: recovery must neither move it into
  // place, where the next commit would remove it as the old output, nor
  // remove it outright.
  it.each([
    ["a marker with other text", "cudoc"],
    ["a marker that only starts like cudoc's", "cudoc\nmine\n"],
    ["an empty marker", ""],
  ])(
    "keeps a backup whose output is missing when it carries %s",
    (_, marker) => {
      const { input, output } = workspace()
      const backup = `${output}.previous-${crypto.randomUUID()}`
      fs.mkdirSync(backup)
      fs.writeFileSync(path.join(backup, ".cudoc-output"), marker)
      fs.writeFileSync(path.join(backup, "notes.txt"), "the user's")
      fs.writeFileSync(`${output}.lock`, DEAD)
      publishDirectory(input, output, (staging) => {
        fs.writeFileSync(path.join(staging, "page.txt"), "written")
      })
      expect(fs.readFileSync(path.join(backup, "notes.txt"), "utf8")).toBe(
        "the user's",
      )
      expect(fs.existsSync(path.join(output, "notes.txt"))).toBe(false)
      expect(fs.readFileSync(path.join(output, "page.txt"), "utf8")).toBe(
        "written",
      )
    },
  )

  it("keeps a backup and a staging directory it does not own beside an existing output", () => {
    const { input, output } = workspace()
    seedOwnedOutput(output, "previous")
    const backup = `${output}.previous-${crypto.randomUUID()}`
    const staging = `${output}.cudoc-staging-Xy34Zw`
    for (const dir of [backup, staging]) {
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, ".cudoc-output"), "not cudoc\n")
      fs.writeFileSync(path.join(dir, "notes.txt"), "the user's")
    }
    publishDirectory(input, output, () => {})
    for (const dir of [backup, staging])
      expect(fs.readFileSync(path.join(dir, "notes.txt"), "utf8")).toBe(
        "the user's",
      )
  })

  it("does not follow a symlink named like a backup", () => {
    const { root, input, output } = workspace()
    const target = path.join(root, "elsewhere")
    seedOwnedOutput(target, "the user's")
    const backup = `${output}.previous-${crypto.randomUUID()}`
    fs.symlinkSync(target, backup)
    publishDirectory(input, output, () => {})
    expect(fs.lstatSync(backup).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(path.join(target, "existing.txt"), "utf8")).toBe(
      "the user's",
    )
  })

  it("keeps a copy of an output whose name cudoc would not have chosen", () => {
    // cudoc names a backup `.previous-<uuid>` and a staging directory
    // `.cudoc-staging-` and six letters or digits; a copy someone made by
    // hand, carrying the marker it was copied with, is neither.
    const { input, output } = workspace()
    seedOwnedOutput(output, "previous")
    const copies = [
      "out.previous-backup",
      "out.tmp-backup",
      "out.cudoc-staging-backup-copy",
    ]
    for (const name of copies)
      seedOwnedOutput(path.join(path.dirname(output), name), "the user's")
    publishDirectory(input, output, () => {})
    expect(residue(output).sort()).toEqual([...copies].sort())
  })

  it("recovers a staging directory under the name mkdtemp gave it", () => {
    const { input, output } = workspace()
    fs.writeFileSync(`${output}.lock`, DEAD)
    const leftover = fs.mkdtempSync(`${output}.cudoc-staging-`)
    fs.writeFileSync(path.join(leftover, ".cudoc-output"), "cudoc\n")
    publishDirectory(input, output, () => {})
    expect(residue(output)).toEqual([])
  })

  it("does not follow a symlink named like a staging directory", () => {
    const { root, input, output } = workspace()
    const target = path.join(root, "elsewhere")
    seedOwnedOutput(target, "the user's")
    const staging = `${output}.cudoc-staging-Qw12Er`
    fs.symlinkSync(target, staging)
    publishDirectory(input, output, () => {})
    expect(fs.lstatSync(staging).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(path.join(target, "existing.txt"), "utf8")).toBe(
      "the user's",
    )
  })

  it("releases the lock when a leftover cannot be removed, and finishes the removal next time", () => {
    // A file an editor holds open on Windows, or a directory without write
    // permission, stops the removal partway. The marker goes last, so what
    // is left is still recognised, and the lock does not outlive the attempt.
    const { input, output } = workspace()
    const leftover = `${output}.cudoc-staging-Zx98Cv`
    fs.mkdirSync(path.join(leftover, "held"), { recursive: true })
    fs.writeFileSync(path.join(leftover, ".cudoc-output"), "cudoc\n")
    fs.writeFileSync(path.join(leftover, "held/page.txt"), "held")
    const remove = fs.rmSync
    const spy = vi
      .spyOn(fs, "rmSync")
      .mockImplementation((target, options): void => {
        if (path.basename(String(target)) === "held") {
          const busy = new Error(
            "EBUSY: resource busy",
          ) as NodeJS.ErrnoException
          busy.code = "EBUSY"
          throw busy
        }
        return remove(target, options)
      })
    try {
      expect(() => publishDirectory(input, output, () => {})).toThrow(/EBUSY/)
    } finally {
      spy.mockRestore()
    }
    expect(fs.existsSync(`${output}.lock`)).toBe(false)
    expect(fs.readFileSync(path.join(leftover, ".cudoc-output"), "utf8")).toBe(
      "cudoc\n",
    )
    publishDirectory(input, output, (staging) => {
      fs.writeFileSync(path.join(staging, "page.txt"), "written")
    })
    expect(fs.existsSync(leftover)).toBe(false)
    expect(fs.readFileSync(path.join(output, "page.txt"), "utf8")).toBe(
      "written",
    )
    expect(residue(output)).toEqual([])
  })

  it("touches nothing when another process claims the stale lock first", () => {
    // Two processes find the same stale lock. The other one renames it away
    // first, so this one's rename finds nothing; by the time this one looks
    // again, the other holds the lock and has a staging directory of its own.
    // This one must neither remove that directory nor take the lock over.
    const { input, output } = workspace()
    fs.writeFileSync(`${output}.lock`, DEAD)
    const winner = `${output}.cudoc-staging-winner`
    const rename = fs.renameSync
    const spy = vi
      .spyOn(fs, "renameSync")
      .mockImplementation((from, to): void => {
        // The transaction works on the real path, which on macOS differs
        // from the temporary directory's spelling, so match by name.
        if (path.basename(String(from)) !== "out.lock") return rename(from, to)
        fs.writeFileSync(from, String(process.ppid))
        fs.mkdirSync(winner)
        fs.writeFileSync(path.join(winner, ".cudoc-output"), "cudoc\n")
        const gone = new Error("ENOENT: no such file") as NodeJS.ErrnoException
        gone.code = "ENOENT"
        throw gone
      })
    try {
      expect(() => publishDirectory(input, output, () => {})).toThrow(
        `is being written by process ${process.ppid}; wait for it to finish`,
      )
    } finally {
      spy.mockRestore()
    }
    expect(fs.existsSync(path.join(winner, ".cudoc-output"))).toBe(true)
    expect(fs.readFileSync(`${output}.lock`, "utf8")).toBe(String(process.ppid))
    fs.rmSync(`${output}.lock`)
  })
})
