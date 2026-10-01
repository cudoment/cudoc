/**
 * What the guides promise that a file can hold them to. Reads files only.
 *
 * `tests/scripts/guide-consumers.mjs` follows each English host guide in a
 * new project, which needs the registry and minutes; the Korean guides are
 * held to the same steps here instead, block for block, so a fix made in one
 * language cannot leave the other describing a setup that does not build.
 * The supported versions table is held to the example lockfiles, which are
 * the releases continuous integration tests, and to the peer ranges the
 * adapters declare.
 */

import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import type { Root, Table, TableRow } from "mdast"
import { ROOT } from "./hosts.js"
import { readGuide } from "../scripts/guide-steps.mjs"

type Step = ReturnType<typeof readGuide>[number]

const GUIDES = ["next", "docusaurus", "nextra", "vitepress", "eleventy"]

describe("the Korean guides give the steps of the English ones", () => {
  it.each(GUIDES)("docs/%s.ko.md", (guide) => {
    const english = readGuide(path.join(ROOT, `docs/${guide}.md`))
    const korean = readGuide(path.join(ROOT, `docs/${guide}.ko.md`))
    // A guide the check follows has files to write and commands to run.
    expect(english.some((step: Step) => step.kind === "file")).toBe(true)
    expect(korean).toEqual(english)
  })

  it.each([
    ["next", "next-mdx"],
    ["docusaurus", "docusaurus"],
    ["nextra", "nextra"],
    ["vitepress", "vitepress"],
    ["eleventy", "eleventy"],
  ])("docs/%s.md pins what examples/%s pins", (guide, example) => {
    // The example is where a pin is shown to build; the guide check
    // compares the audits of both, and this keeps the two lists one.
    const pinned = Object.assign(
      {},
      ...readGuide(path.join(ROOT, `docs/${guide}.md`))
        .filter((step: Step) => step.kind === "overrides")
        .map((step: Step) => step.overrides),
    )
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "examples", example, "package.json"),
        "utf8",
      ),
    ) as { overrides?: Record<string, string> }
    expect(pinned).toEqual(manifest.overrides ?? {})
  })

  it("docs/export.ko.md starts the first site with the same commands", () => {
    // The two documents are written in each language; the commands are not.
    const commands = (file: string, section: string) =>
      readGuide(path.join(ROOT, file), section).filter(
        (step: Step) => step.kind === "command",
      )
    const english = commands(
      "docs/export.md",
      "Your first site, from an empty directory",
    )
    expect(english.length).toBeGreaterThan(1)
    expect(
      commands("docs/export.ko.md", "빈 디렉터리에서 첫 사이트 만들기"),
    ).toEqual(english)
  })
})

type Manifest = {
  engines?: Record<string, string>
  peerDependencies?: Record<string, string>
}
const read = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as T

/** The version an example's lockfile resolved a package to. */
const locked = (example: string, name: string): string => {
  const lock = read<{ packages: Record<string, { version?: string }> }>(
    `examples/${example}/package-lock.json`,
  )
  const version = lock.packages[`node_modules/${name}`]?.version
  if (!version) throw new Error(`examples/${example} does not lock ${name}`)
  return version
}

/**
 * Each table row: the example that tests the host, the packages whose locked
 * versions the "tested" cell names (the host itself first), and the adapter
 * whose host peers the "declared" cell names.
 */
const ROWS = [
  {
    host: "Next.js",
    example: "next-mdx",
    tested: ["next", "@next/mdx"],
    adapter: "cudoc-remark",
  },
  {
    host: "Docusaurus",
    example: "docusaurus",
    tested: ["@docusaurus/core"],
    adapter: "cudoc-docusaurus",
  },
  {
    host: "Nextra",
    example: "nextra",
    tested: ["nextra", "next"],
    adapter: "cudoc-nextra",
  },
  {
    host: "VitePress",
    example: "vitepress",
    tested: ["vitepress"],
    adapter: "cudoc-vitepress",
  },
  {
    host: "Eleventy",
    example: "eleventy",
    tested: ["@11ty/eleventy"],
    adapter: "cudoc-eleventy",
  },
]

/** Peers that are the host or its parser, not React or type packages. */
const hostPeers = (adapter: string): [string, string][] =>
  Object.entries(
    read<Manifest>(`packages/${adapter}/package.json`).peerDependencies ?? {},
  ).filter(([name]) => name !== "react" && !name.startsWith("@types/"))

const text = (node: { value?: string; children?: unknown[] }): string =>
  node.value ??
  (node.children ?? []).map((child) => text(child as typeof node)).join("")

/** The rows of the first table under a `##` heading, as cell text. */
const tableUnder = (file: string, title: string): string[][] => {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as Root
  const start = tree.children.findIndex(
    (node) =>
      node.type === "heading" && node.depth === 2 && text(node) === title,
  )
  expect(start, `${file} has a "${title}" section`).toBeGreaterThan(-1)
  const table = tree.children
    .slice(start + 1)
    .find((node) => node.type === "table") as Table
  return table.children.map((row: TableRow) =>
    row.children.map((cell) => text(cell)),
  )
}

describe.each([
  ["docs/README.md", "Supported versions", "no host peer"],
  ["docs/README.ko.md", "지원 버전", "호스트 피어 없음"],
])("%s", (file, title, none) => {
  const rows = tableUnder(file, title)
  const row = (host: string) => {
    const found = rows.find((cells) => cells[0] === host)
    expect(found, `a ${host} row`).toBeDefined()
    return found!
  }

  it("lists every host once", () => {
    expect(rows.slice(1).map((cells) => cells[0])).toEqual(
      ROWS.map(({ host }) => host),
    )
  })

  it.each(ROWS)(
    "names the $host release the example locks, and a range from it on",
    ({ host, example, tested }) => {
      const [, testedCell, supportedCell] = row(host)
      for (const name of tested)
        expect(testedCell).toContain(locked(example, name))
      const [major, minor] = locked(example, tested[0]!).split(".")
      expect(supportedCell).toContain(`${major}.${minor}`)
      expect(supportedCell).toContain(`${major}.x`)
    },
  )

  it.each(ROWS)(
    "gives the peer range $adapter declares for $host",
    ({ host, adapter }) => {
      const declared = row(host)[3]!
      const peers = hostPeers(adapter)
      if (!peers.length) expect(declared.startsWith(none)).toBe(true)
      for (const [name, range] of peers) {
        expect(declared).toContain(name)
        expect(declared).toContain(range)
      }
    },
  )

  it.each(ROWS.filter(({ adapter }) => hostPeers(adapter).length))(
    "declares a $host peer range that starts where support starts",
    ({ host, tested, adapter }) => {
      // A range that starts lower accepts a release nothing tests, and npm
      // installs it without a word.
      const [, , supportedCell] = row(host)
      const range = Object.fromEntries(hostPeers(adapter))[tested[0]!]
      expect(range, `${adapter} names ${tested[0]} as a peer`).toBeDefined()
      const floor = range!.match(/^\^(\d+)\.(\d+)\.(\d+)$/)
      expect(floor, `${adapter}: ${range}`).not.toBeNull()
      const [, major, minor, patch] = floor!
      expect(supportedCell.split(/\s+/)).toContain(
        patch === "0" ? `${major}.${minor}` : `${major}.${minor}.${patch}`,
      )
    },
  )

  it("names the Node.js version every package requires", () => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    expect(source).toContain("Node.js 20")
    const packages = fs
      .readdirSync(path.join(ROOT, "packages"))
      .filter((dir) =>
        fs.existsSync(path.join(ROOT, "packages", dir, "package.json")),
      )
    expect(packages.length).toBeGreaterThan(0)
    for (const dir of packages)
      expect(
        read<Manifest>(`packages/${dir}/package.json`).engines?.node,
        dir,
      ).toBe(">=20")
  })
})
