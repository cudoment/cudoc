/**
 * Creates the GitHub release, and with it the tag, of every workspace package
 * whose version is on npm but has no release yet.
 *
 * The publish job tags each package as it lands. A tag that fails after the
 * package reached npm is not retried there: the next run's comparison finds
 * the version on npm and leaves the package out. This is the retry, and the
 * workflow runs it on every dispatch that gets past the CI and comparison
 * jobs, whether anything was published or not.
 *
 * npm records the commit a version was published from as `gitHead`. A release
 * is created only when that commit is the one this run checked out, so a run
 * from a later commit never tags an earlier release at the wrong place. A
 * version published from another commit, or with no commit recorded, stops the
 * run naming what npm has, for the owner to tag by hand.
 *
 * The versions this run's publish job put on npm arrive in `PUBLISHED`, and
 * are taken as published from this commit without asking npm, whose read
 * replicas can lag a publish by minutes. Otherwise, as in the comparison, only
 * a definite "not there" counts: a version npm does not have is left alone,
 * and any other failure to ask npm or GitHub stops the run.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { pathToFileURL } from "node:url"
import {
  isPublished,
  publicationOrder,
  readWorkspace,
} from "./unpublished-packages.mjs"

const gh = (args) =>
  execFileSync("gh", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })

/** Whether the release `tag` exists. Only `gh`'s "release not found" means no. */
export function isReleased(tag, view = (tag) => gh(["release", "view", tag])) {
  try {
    view(tag)
    return true
  } catch (error) {
    const stderr = String(error?.stderr ?? "")
    if (/\brelease not found\b/.test(stderr)) return false
    throw new Error(
      `could not ask GitHub about the release ${tag}:\n${stderr.trim() || error?.message || error}`,
    )
  }
}

/** The commit npm recorded for `name@version`, or "" when it has none. */
export const publishedCommit = (name, version) =>
  execFileSync("npm", ["view", `${name}@${version}`, "gitHead"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()

/**
 * The releases to create at `commit`, in publication order, and the versions
 * on npm without a release that were published from somewhere else. `here`
 * holds the tags of the versions this run published.
 */
export function untaggedReleases(
  manifests,
  {
    commit,
    here = new Set(),
    published = isPublished,
    released = isReleased,
    commitOf = publishedCommit,
    log = (line) => console.error(line),
  },
) {
  const create = []
  const foreign = []
  for (const dir of publicationOrder(manifests)) {
    const { name, version, private: isPrivate } = manifests.get(dir)
    if (isPrivate) continue
    const tag = `${name}@${version}`
    if (!here.has(tag) && !published(name, version)) {
      log(`${tag} is not on npm; nothing to tag`)
      continue
    }
    if (released(tag)) continue
    const from = here.has(tag) ? commit : commitOf(name, version)
    if (from === commit) {
      log(`${tag} is on npm without a release; creating it at ${commit}`)
      create.push(tag)
    } else foreign.push({ tag, commit: from })
  }
  return { create, foreign }
}

/**
 * The workflow step: finds the missing releases, creates each with `create`,
 * and returns the step summary and whether a version needs the owner. The
 * commit is `GITHUB_SHA`, and `PUBLISHED` lists this run's publishes.
 *
 * @param {Map<string, { name: string, version: string, private?: boolean }>} manifests
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   create?: (tag: string, commit: string) => unknown,
 *   published?: (name: string, version: string) => boolean,
 *   released?: (tag: string) => boolean,
 *   commitOf?: (name: string, version: string) => string,
 *   log?: (line: string) => void,
 * }} [options]
 */
export function createMissingReleases(
  manifests,
  {
    env = process.env,
    create = (tag, commit) =>
      gh([
        "release",
        "create",
        tag,
        "--target",
        commit,
        "--title",
        tag,
        "--generate-notes",
      ]),
    ...lookups
  } = {},
) {
  const commit = env.GITHUB_SHA
  if (!commit) throw new Error("GITHUB_SHA names the commit to tag")
  const here = new Set((env.PUBLISHED ?? "").split(/\s+/).filter(Boolean))
  const { create: tags, foreign } = untaggedReleases(manifests, {
    ...lookups,
    commit,
    here,
  })
  for (const tag of tags) create(tag, commit)
  const summary = [
    ...(tags.length
      ? ["### Releases created", "", ...tags.map((tag) => `- \`${tag}\``), ""]
      : []),
    ...(foreign.length
      ? [
          "### Versions on npm without a release from this commit",
          "",
          ...foreign.map(({ tag, commit: from }) =>
            from
              ? `- \`${tag}\` was published from \`${from}\`; tag it there with \`gh release create ${tag} --target ${from} --title ${tag} --generate-notes\``
              : `- \`${tag}\` records no commit on npm; find the commit it was published from and tag it there`,
          ),
          "",
        ]
      : []),
  ].join("\n")
  return { summary, failed: foreign.length > 0 }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { summary, failed } = createMissingReleases(readWorkspace())
  if (summary) {
    console.log(summary)
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  }
  if (failed) process.exitCode = 1
}
