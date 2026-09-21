/**
 * The publish transaction, in both its synchronous and asynchronous forms.
 *
 * `publishDirectory` decides which form it is running by looking at what the
 * build callback returned, so these exercise the runtime behaviour rather than
 * the overload types: an asynchronous callback must not have its staging
 * directory renamed or removed before it finishes writing, and a rejection has
 * to leave the previous output exactly as it was.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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
    expect(() => publishDirectory(input, output, () => {})).toThrow()
    await pending
    expect(residue(output)).toEqual([])
  })
})
