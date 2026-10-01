/**
 * What the publish workflow relies on before it runs: the comparison with npm
 * that decides what to publish, the step that creates a release npm has and
 * GitHub does not, the decision that a release is complete enough for the
 * documentation site, and manifests that let every package publish without
 * resolving a sibling version that does not exist. Reads files only; the
 * registry and GitHub are replaced by functions standing in for `npm view`,
 * `gh release view` and `git ls-remote`.
 */

import path from "node:path"
import { describe, expect, it } from "vitest"
import { ROOT } from "./hosts.js"
import {
  isPublished,
  publicationOrder,
  readWorkspace,
  unpublishedPackages,
} from "../../scripts/unpublished-packages.mjs"
import {
  createMissingReleases,
  isReleased,
  untaggedReleases,
} from "../../scripts/untagged-releases.mjs"
import {
  guardDeploy,
  later,
  releaseState,
  resolveRelease,
  statedVersion,
} from "../../scripts/site-release.mjs"

type Manifest = {
  name: string
  version: string
  private?: boolean
  engines?: Record<string, string>
} & Partial<
  Record<
    | "dependencies"
    | "peerDependencies"
    | "optionalDependencies"
    | "devDependencies",
    Record<string, string>
  >
>

const manifests = readWorkspace(path.join(ROOT, "packages")) as Map<
  string,
  Manifest
>
const names = new Set([...manifests.values()].map((m) => m.name))

/** A failed `npm view`, as `execFileSync` throws it. */
const failing = (stderr: string) => () => {
  throw Object.assign(new Error("Command failed: npm view"), { stderr })
}

describe("the comparison with npm", () => {
  it("reads a printed version as published and npm's not-found as not", () => {
    expect(isPublished("a", "1.0.0", () => "1.0.0\n")).toBe(true)
    expect(isPublished("a", "1.0.0", () => "")).toBe(false)
    expect(
      isPublished(
        "a",
        "1.0.0",
        failing("npm error code E404\nnpm error 404 No match found"),
      ),
    ).toBe(false)
  })

  it("stops on any other failure instead of listing the package", () => {
    // An outage read as "not published" would send every package to
    // `npm publish`, which then fails about something else.
    for (const stderr of [
      "npm error code ETIMEDOUT",
      "npm error code E403",
      "npm error code ENOTFOUND",
    ])
      expect(() => isPublished("a", "1.0.0", failing(stderr))).toThrow(
        `could not ask npm about a@1.0.0:\n${stderr}`,
      )
    expect(() =>
      unpublishedPackages(
        manifests,
        [],
        () => {
          throw new Error("offline")
        },
        () => {},
      ),
    ).toThrow("offline")
  })

  it("lists every package after the workspace packages it depends on", () => {
    const order = publicationOrder(manifests)
    expect(new Set(order)).toEqual(new Set(manifests.keys()))
    for (const [dir, manifest] of manifests)
      for (const name of Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      }).filter((name) => names.has(name))) {
        const dependency = [...manifests].find(([, m]) => m.name === name)![0]
        expect(
          order.indexOf(dependency),
          `${manifest.name} → ${name}`,
        ).toBeLessThan(order.indexOf(dir))
      }
  })

  it("lists only the selected packages that are missing, in order", () => {
    const lines: string[] = []
    const missing = unpublishedPackages(
      manifests,
      ["cudoc-export", "cudoc-remark", "@cudoment/cudoc"],
      (name: string) => name === "cudoc-remark",
      (line: string) => lines.push(line),
    )
    expect(missing.map((dir: string) => manifests.get(dir)!.name)).toEqual([
      "@cudoment/cudoc",
      "cudoc-export",
    ])
    expect(lines).toHaveLength(3)
  })
})

describe("the releases created after publishing", () => {
  const COMMIT = "a".repeat(40)
  const tags = [...manifests.values()]
    .filter((manifest) => !manifest.private)
    .map((manifest) => `${manifest.name}@${manifest.version}`)
  const [first, second, third] = tags as [string, string, string]
  const nameOf = (tag: string) => tag.slice(0, tag.lastIndexOf("@"))

  it("creates the release a version on npm lacks when npm has it from this commit", () => {
    // The publish job's own release failed after the package reached npm:
    // the next comparison leaves the package out, so only this step
    // creates it.
    const { create, foreign } = untaggedReleases(manifests, {
      commit: COMMIT,
      published: () => true,
      released: (tag: string) => tag !== first,
      commitOf: () => COMMIT,
      log: () => {},
    })
    expect(create).toEqual([first])
    expect(foreign).toEqual([])
  })

  it("leaves alone a version npm does not have and one already released", () => {
    const { create, foreign } = untaggedReleases(manifests, {
      commit: COMMIT,
      published: (name: string) => name !== nameOf(first),
      released: () => true,
      commitOf: () => {
        throw new Error("asked for the commit of a released version")
      },
      log: () => {},
    })
    expect(create).toEqual([])
    expect(foreign).toEqual([])
  })

  it("names a version published from another commit instead of tagging this one", () => {
    const { create, foreign } = untaggedReleases(manifests, {
      commit: COMMIT,
      published: () => true,
      released: (tag: string) => tag !== first && tag !== second,
      commitOf: (name: string) =>
        name === nameOf(first) ? "b".repeat(40) : "",
      log: () => {},
    })
    expect(create).toEqual([])
    expect(foreign).toHaveLength(2)
    expect(foreign).toContainEqual({ tag: first, commit: "b".repeat(40) })
    expect(foreign).toContainEqual({ tag: second, commit: "" })
  })

  it("trusts this run's own publishes over a registry that has not caught up", () => {
    const { create } = untaggedReleases(manifests, {
      commit: COMMIT,
      here: new Set([third]),
      published: () => false,
      released: () => false,
      commitOf: () => {
        throw new Error("asked npm about a version this run published")
      },
      log: () => {},
    })
    expect(create).toEqual([third])
  })

  it("creates each at the run's commit, reads the run's publishes and fails on another commit's", () => {
    const created: string[] = []
    const step = (env: Record<string, string>) =>
      createMissingReleases(manifests, {
        env,
        create: (tag: string, commit: string) =>
          created.push(`${tag} ${commit}`),
        published: () => false,
        released: () => false,
        commitOf: () => "b".repeat(40),
        log: () => {},
      })
    expect(() => step({})).toThrow("GITHUB_SHA names the commit to tag")
    const done = step({ GITHUB_SHA: COMMIT, PUBLISHED: ` ${first}  ${third} ` })
    expect(created.sort()).toEqual(
      [`${first} ${COMMIT}`, `${third} ${COMMIT}`].sort(),
    )
    expect(done.failed).toBe(false)
    expect(done.summary).toContain(`- \`${third}\``)

    const other = createMissingReleases(manifests, {
      env: { GITHUB_SHA: COMMIT },
      create: () => {
        throw new Error("tagged a version from another commit")
      },
      published: (name: string) => name === nameOf(second),
      released: () => false,
      commitOf: () => "b".repeat(40),
      log: () => {},
    })
    expect(other.failed).toBe(true)
    expect(other.summary).toContain(
      `gh release create ${second} --target ${"b".repeat(40)}`,
    )
  })

  it("reads gh's not-found as no release and stops on any other failure", () => {
    expect(isReleased("a@1.0.0", () => "")).toBe(true)
    expect(
      isReleased("a@1.0.0", () => {
        throw Object.assign(new Error("gh"), { stderr: "release not found\n" })
      }),
    ).toBe(false)
    expect(() =>
      isReleased("a@1.0.0", () => {
        throw Object.assign(new Error("gh"), {
          stderr: "HTTP 502: Bad Gateway",
        })
      }),
    ).toThrow("could not ask GitHub about the release a@1.0.0:\nHTTP 502")
  })
})

describe("when the documentation site deploys", () => {
  const COMMIT = "a".repeat(40)
  const OTHER = "b".repeat(40)
  const packages = [...manifests.values()].filter((m) => !m.private)
  const version = packages[0]!.version
  const tags = packages.map((m) => `${m.name}@${version}`)
  const [first, second] = tags as [string, string]
  const nameOf = (tag: string) => tag.slice(0, tag.lastIndexOf("@"))
  const complete = {
    commit: COMMIT,
    published: () => true,
    commitOf: () => COMMIT,
    tagged: () => COMMIT,
  }

  it("deploys once every public package is on npm from this commit and tagged here", () => {
    expect(releaseState(manifests, complete)).toEqual({
      complete: true,
      version,
      missing: [],
    })
  })

  it("leaves the site alone when publishing stopped partway", () => {
    const state = releaseState(manifests, {
      ...complete,
      published: (name: string) => name !== nameOf(second),
      tagged: (tag: string) => (tag === second ? "" : COMMIT),
    })
    expect(state.complete).toBe(false)
    expect(state.missing).toEqual([`${second} is not on npm`])
  })

  it("leaves it alone for a version published from another commit, or a tag elsewhere or missing", () => {
    const foreign = releaseState(manifests, {
      ...complete,
      commitOf: (name: string) => (name === nameOf(first) ? OTHER : COMMIT),
    })
    expect(foreign.missing).toEqual([`${first} was published from ${OTHER}`])
    const unrecorded = releaseState(manifests, {
      ...complete,
      commitOf: (name: string) => (name === nameOf(first) ? "" : COMMIT),
    })
    expect(unrecorded.missing).toEqual([
      `${first} was published from an unrecorded commit`,
    ])
    const tagged = releaseState(manifests, {
      ...complete,
      tagged: (tag: string) =>
        tag === first ? OTHER : tag === second ? "" : COMMIT,
    })
    expect(tagged.complete).toBe(false)
    expect(tagged.missing).toEqual([
      `${first} is tagged at ${OTHER}`,
      `${second} is tagged nowhere`,
    ])
  })

  it("refuses manifests that do not share one version", () => {
    const split = new Map(manifests)
    const [dir, manifest] = [...split].find(([, m]) => !m.private)!
    split.set(dir, { ...manifest, version: "0.0.1" })
    expect(() => releaseState(split, complete)).toThrow(
      "the public packages do not share one version",
    )
  })

  it("finds a released version's commit from its tags, and checks the packages that commit holds", () => {
    // An older release may hold other packages than main does now: the
    // commit's own manifests decide what has to be complete.
    const older = new Map([
      ["packages/a", { name: "a", version: "0.4.0" }],
      ["packages/b", { name: "b", version: "0.4.0" }],
    ])
    const tags = new Map([
      ["a@0.4.0", COMMIT],
      ["b@0.4.0", COMMIT],
    ])
    const checked: string[] = []
    const commit = resolveRelease("0.4.0", {
      tags: () => tags,
      manifestsAt: (at: string) => {
        checked.push(at)
        return older
      },
      state: (manifests: typeof older, options: { commit: string }) =>
        releaseState(manifests, { ...complete, ...options }),
    })
    expect(commit).toBe(COMMIT)
    expect(checked).toEqual([COMMIT])
    const resolve = (over: Record<string, unknown>) => () =>
      resolveRelease("0.4.0", {
        tags: () => tags,
        manifestsAt: () => older,
        state: (manifests: typeof older, options: { commit: string }) =>
          releaseState(manifests, { ...complete, ...options }),
        ...over,
      })
    expect(resolve({ tags: () => new Map() })).toThrow(
      "no tag names the version 0.4.0",
    )
    expect(
      resolve({
        tags: () =>
          new Map([
            ["a@0.4.0", COMMIT],
            ["b@0.4.0", OTHER],
          ]),
      }),
    ).toThrow(
      `the tags of 0.4.0 do not name one commit:\n  a@0.4.0: ${COMMIT}\n  b@0.4.0: ${OTHER}`,
    )
    expect(
      resolve({
        state: (manifests: typeof older, options: { commit: string }) =>
          releaseState(manifests, {
            ...complete,
            ...options,
            published: (name: string) => name !== "b",
          }),
      }),
    ).toThrow("the release 0.4.0 is not complete:\n  b@0.4.0 is not on npm")
    expect(
      resolve({
        manifestsAt: () =>
          new Map([["packages/a", { name: "a", version: "0.5.0" }]]),
      }),
    ).toThrow(`the tags of 0.4.0 name ${COMMIT}, whose packages are 0.5.0`)
  })

  it("reads the deployed version only when it is a release version", () => {
    expect(statedVersion('{"version":"0.8.0","commit":"abc"}')).toBe("0.8.0")
    // The site from before version.json, or a file this workflow did not
    // write, states nothing, so it never blocks a deploy.
    for (const text of ["<!doctype html>", "{}", '{"version":"next"}', ""])
      expect(statedVersion(text)).toBe("")
  })

  it("refuses to put an older version over a newer one unless rolling back", () => {
    expect(later("0.10.0", "0.9.9")).toBe(true)
    expect(later("1.0.0", "0.99.0")).toBe(true)
    expect(later("0.8.0", "0.8.0")).toBe(false)
    expect(later("0.7.1", "0.8.0")).toBe(false)
    expect(() => later("0.8", "0.8.0")).toThrow("not a release version: 0.8")
    expect(() => guardDeploy({ version: "0.8.0", deployed: "" })).not.toThrow()
    expect(() =>
      guardDeploy({ version: "0.8.0", deployed: "0.8.0" }),
    ).not.toThrow()
    expect(() =>
      guardDeploy({ version: "0.9.0", deployed: "0.8.0" }),
    ).not.toThrow()
    expect(() => guardDeploy({ version: "0.7.0", deployed: "0.8.0" })).toThrow(
      "the site serves 0.8.0, newer than 0.7.0",
    )
    expect(() =>
      guardDeploy({ version: "0.7.0", deployed: "0.8.0", rollback: true }),
    ).not.toThrow()
  })
})

describe("the workspace manifests", () => {
  const published = [...manifests.values()].filter((m) => !m.private)
  const version = published[0]!.version

  it("share one version", () => {
    expect(
      Object.fromEntries(published.map((m) => [m.name, m.version])),
    ).toEqual(Object.fromEntries(published.map((m) => [m.name, version])))
  })

  it("pin every sibling to exactly that version", () => {
    // A range would let a published package resolve a sibling from another
    // release, or one that does not exist yet.
    for (const manifest of published)
      for (const field of [
        "dependencies",
        "peerDependencies",
        "optionalDependencies",
        "devDependencies",
      ] as const)
        for (const [name, range] of Object.entries(manifest[field] ?? {}))
          if (names.has(name))
            expect(range, `${manifest.name} ${field} ${name}`).toBe(version)
  })

  it("declare one supported Node range", () => {
    const ranges = new Set(published.map((m) => m.engines?.node))
    expect([...ranges]).toEqual([published[0]!.engines?.node])
    expect(published[0]!.engines?.node).toMatch(/^>=\d+/)
  })
})
