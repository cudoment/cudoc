/**
 * When the documentation site may deploy, and from which commit.
 *
 * The site describes the packages on npm, so it deploys only once a release
 * is complete: every public workspace package's version is on npm, published
 * from the commit being deployed, and its release tag points there. A
 * publish that stopped halfway, a version published from another commit or a
 * tag that failed leaves the site as it was.
 *
 * Three commands, each writing `key=value` lines for `$GITHUB_OUTPUT`:
 *
 * - `state`: after the publish workflow's release job. `GITHUB_SHA` is the
 *   commit, and `PUBLISHED` lists this run's own publishes, trusted over npm's
 *   read replicas as the release job trusts them.
 * - `resolve --version <x.y.z>`: for a manual redeploy. Finds the commit the
 *   version's tags name, which must be one commit for every tag, and checks
 *   that release is complete against the packages that commit holds, which
 *   need not be the packages main holds now.
 * - `guard --version <x.y.z> --deployed <url> [--rollback]`: refuses to
 *   replace a newer deployed version unless rolling back on purpose. The
 *   site carries its version in `version.json`.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isPublished, readWorkspace } from "./unpublished-packages.mjs"
import { publishedCommit } from "./untagged-releases.mjs"

/**
 * The commit a tag names on the remote, or "" when it has no such tag. An
 * annotated tag is followed to its commit.
 */
export const tagCommit = (tag, remote = "origin") => {
  const lines = execFileSync(
    "git",
    ["ls-remote", "--tags", remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
  const peeled = lines.find(([, ref]) => ref.endsWith("^{}"))
  return (peeled ?? lines[0])?.[0] ?? ""
}

/** Every tag of `version` on the remote, each with the commit it names. */
export const versionTags = (version, remote = "origin") => {
  const tags = new Map()
  const lines = execFileSync(
    "git",
    ["ls-remote", "--tags", remote, `*@${version}`, `*@${version}^{}`],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
  for (const [commit, ref] of lines) {
    const peeled = ref.endsWith("^{}")
    const name = ref.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, "")
    if (!name.endsWith(`@${version}`)) continue
    // An annotated tag is followed to its commit.
    if (peeled || !tags.has(name)) tags.set(name, commit)
  }
  return tags
}

/** The workspace manifests as `commit` holds them, read from Git. */
export function readWorkspaceAt(commit) {
  const git = (args) =>
    execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  const manifests = new Map()
  for (const entry of git(["ls-tree", "--name-only", `${commit}:packages`])
    .split("\n")
    .filter(Boolean)) {
    let text
    try {
      text = git(["show", `${commit}:packages/${entry}/package.json`])
    } catch {
      continue
    }
    manifests.set(path.join("packages", entry), JSON.parse(text))
  }
  return manifests
}

/** The public packages and the one version they share. */
function release(manifests) {
  const packages = [...manifests.values()].filter((m) => !m.private)
  const versions = new Set(packages.map((m) => m.version))
  if (versions.size !== 1)
    throw new Error(
      `the public packages do not share one version: ${[...versions].join(", ")}`,
    )
  return { packages, version: [...versions][0] }
}

/**
 * Whether every public package's version is on npm from `commit` with its
 * tag at `commit`, and what is missing when not.
 */
export function releaseState(
  manifests,
  {
    commit,
    here = new Set(),
    published = isPublished,
    commitOf = publishedCommit,
    tagged = tagCommit,
  },
) {
  const { packages, version } = release(manifests)
  const missing = []
  for (const { name } of packages) {
    const tag = `${name}@${version}`
    const fromHere = here.has(tag)
    if (!fromHere && !published(name, version)) {
      missing.push(`${tag} is not on npm`)
      continue
    }
    const from = fromHere ? commit : commitOf(name, version)
    if (from !== commit)
      missing.push(
        `${tag} was published from ${from || "an unrecorded commit"}`,
      )
    const at = tagged(tag)
    if (at !== commit)
      missing.push(`${tag} is tagged ${at ? `at ${at}` : "nowhere"}`)
  }
  return { complete: missing.length === 0, version, missing }
}

/**
 * The one commit every tag of `version` names, once the release there is
 * complete: each public package that commit holds is on npm from it and
 * tagged there, at that version.
 */
export function resolveRelease(
  version,
  {
    tags = versionTags,
    manifestsAt = readWorkspaceAt,
    state = releaseState,
  } = {},
) {
  const found = tags(version)
  if (!found.size) throw new Error(`no tag names the version ${version}`)
  const commits = new Set(found.values())
  if (commits.size !== 1)
    throw new Error(
      `the tags of ${version} do not name one commit:\n${[...found]
        .map(([tag, at]) => `  ${tag}: ${at}`)
        .join("\n")}`,
    )
  const commit = [...commits][0]
  const result = state(manifestsAt(commit), { commit })
  if (result.version !== version)
    throw new Error(
      `the tags of ${version} name ${commit}, whose packages are ${result.version}`,
    )
  if (!result.complete)
    throw new Error(
      `the release ${version} is not complete:\n${result.missing.map((line) => `  ${line}`).join("\n")}`,
    )
  return commit
}

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/

const parts = (version) => {
  const match = RELEASE.exec(version)
  if (!match) throw new Error(`not a release version: ${version}`)
  return match.slice(1).map(Number)
}

/** Whether `a` is a later release than `b`. */
export const later = (a, b) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/** Refuses to put an older version over a newer deployed one, unless rolling back. */
export function guardDeploy({ version, deployed, rollback = false }) {
  if (deployed && later(deployed, version) && !rollback)
    throw new Error(
      `the site serves ${deployed}, newer than ${version}; dispatch with rollback to replace it on purpose`,
    )
}

/**
 * The release a deployed `version.json` states, or "" when it states none:
 * the site from before the file existed, or anything but a release version.
 */
export function statedVersion(text) {
  let version = ""
  try {
    version = String(JSON.parse(text).version ?? "")
  } catch {
    // Not a version.json this workflow wrote.
  }
  return RELEASE.test(version) ? version : ""
}

/** The version the deployed site states, or "" when it states none. */
export async function deployedVersion(url) {
  const response = await fetch(url)
  if (response.status === 404) return ""
  if (!response.ok)
    throw new Error(`could not read ${url}: HTTP ${response.status}`)
  return statedVersion(await response.text())
}

const option = (args, name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, ...args] = process.argv.slice(2)
  const output = (lines) => {
    const text = `${lines.join("\n")}\n`
    process.stdout.write(text)
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, text)
  }
  const summary = (text) => {
    console.error(text)
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
  const manifests = readWorkspace()
  if (command === "state") {
    const commit = process.env.GITHUB_SHA
    if (!commit) throw new Error("GITHUB_SHA names the released commit")
    const here = new Set(
      (process.env.PUBLISHED ?? "").split(/\s+/).filter(Boolean),
    )
    const state = releaseState(manifests, { commit, here })
    if (!state.complete)
      summary(
        `### The documentation site stays as it is\n\n${state.missing.map((line) => `- ${line}`).join("\n")}\n`,
      )
    output([
      `complete=${state.complete}`,
      `version=${state.version}`,
      `sha=${commit}`,
    ])
  } else if (command === "resolve") {
    const version = option(args, "--version")
    if (!version) throw new Error("resolve needs --version")
    const commit = resolveRelease(version)
    output([`complete=true`, `version=${version}`, `sha=${commit}`])
  } else if (command === "guard") {
    const version = option(args, "--version")
    const url = option(args, "--deployed")
    if (!version || !url)
      throw new Error("guard needs --version and --deployed")
    guardDeploy({
      version,
      deployed: await deployedVersion(url),
      rollback: args.includes("--rollback"),
    })
  } else
    throw new Error(
      "usage: site-release.mjs state | resolve --version x.y.z | guard --version x.y.z --deployed url [--rollback]",
    )
}
