/**
 * Tab groups: read from cudoc's fences and blockquotes and from each host's
 * own components, kept as a group of tabs, and drawn as radio tabs or as a
 * site's own components.
 */

import { describe, it, expect } from "vitest"
import type { Root } from "mdast"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import type { DocumentNode, Host, SyntaxMode } from "../src/document.js"
import {
  presentDocument,
  resolveTabElements,
  withoutPresentation,
} from "../src/present.js"

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]
const groups = (tree: Root) =>
  walk(tree as unknown as DocumentNode).filter(
    (node) => node.data?.cudoc?.kind === "tabs",
  )
/** Each group as its key and its tabs' title, value, default and content types. */
const shape = (tree: Root) =>
  groups(tree).map((group) => ({
    group: group.data!.cudoc!.group,
    tabs: group.children!.map((member) => [
      member.data!.cudoc!.title,
      member.data!.cudoc!.value,
      member.data!.cudoc!.default ?? false,
      member.children!.map((child) => child.type).join(","),
    ]),
  }))

const compile = (
  source: string,
  options: { format?: "md" | "mdx"; host?: Host; tabs?: SyntaxMode } = {},
) =>
  compileDocument(source, {
    format: options.format ?? "md",
    host: options.host,
    syntax: options.tabs ? { tabs: options.tabs } : {},
  })

describe("cudoc's tab forms", () => {
  it("groups consecutive fences labelled with tab=, and takes the labels off the meta", () => {
    const { tree } = compile(
      '```kotlin tab="Kotlin" group=sdk title="Main.kt"\nfun a() = 1\n```\n\n```kotlin tab=\'RxKotlin\'\nval b = 2\n```\n\n```java tab="Java"\nint c;\n```\n\nText.\n\n```js tab="Alone"\nx\n```\n',
    )
    expect(shape(tree)).toEqual([
      {
        group: "sdk",
        tabs: [
          ["Kotlin", "kotlin", false, "code"],
          ["RxKotlin", "rxkotlin", false, "code"],
          ["Java", "java", false, "code"],
        ],
      },
      { group: undefined, tabs: [["Alone", "alone", false, "code"]] },
    ])
    const first = groups(tree)[0]!.children![0]!.children![0]!
    expect(first.meta).toBe('title="Main.kt"')
    expect(first.data?.cudoc).toEqual({ kind: "code", title: "Main.kt" })
  })

  it("groups consecutive [!TAB] blockquotes, with a key on the first", () => {
    const { tree, diagnostics } = compile(
      "> [!TAB sdk] Swift\n> Use `TalkApi`.\n>\n> ```swift\n> x\n> ```\n\n> [!TAB] RxSwift\n> Use the reactive API.\n",
    )
    expect(diagnostics).toEqual([])
    expect(shape(tree)).toEqual([
      {
        group: "sdk",
        tabs: [
          ["Swift", "swift", false, "paragraph,code"],
          ["RxSwift", "rxswift", false, "paragraph"],
        ],
      },
    ])
  })

  it("joins fence and blockquote tabs that follow each other, numbering repeated values", () => {
    const { tree } = compile(
      '```sh tab="npm"\nnpm i\n```\n\n> [!TAB] npm\n> Again.\n',
    )
    expect(shape(tree)[0]!.tabs.map((member) => member[1])).toEqual([
      "npm",
      "npm-1",
    ])
  })

  it("starts a new group at a tab naming another, and repeats of the key join", () => {
    const { tree } = compile(
      '```sh tab="npm" group=install\nnpm i\n```\n\n```sh tab="pnpm" group=install\npnpm add\n```\n\n```sh tab="yarn"\nyarn add\n```\n\n```js tab="ESM" group=import\nimport x\n```\n',
    )
    expect(
      shape(tree).map((group) => [group.group, group.tabs.length]),
    ).toEqual([
      ["install", 3],
      ["import", 1],
    ])
  })

  it("reports a [!TAB] with no label and leaves it a blockquote", () => {
    const { tree, diagnostics } = compile("> [!TAB]\n> Body\n")
    expect(diagnostics.map((entry) => entry.code)).toEqual(["UNLABELED_TAB"])
    expect(groups(tree)).toEqual([])
  })

  it("reads neither form when tabs take host syntax", () => {
    const { tree, diagnostics } = compile(
      '```js tab="A"\nx\n```\n\n> [!TAB] B\n> y\n',
      { tabs: "host" },
    )
    expect(groups(tree)).toEqual([])
    // The tabs' marker is not an unknown callout: it stays a quote.
    expect(diagnostics).toEqual([])
    expect(tree.children.map((node) => node.type)).toEqual([
      "code",
      "blockquote",
    ])
  })
})

describe("each host's own tab components", () => {
  it("reads the docs profile's Tabs and TabsContent", () => {
    const { tree } = compile(
      '<Tabs>\n  <TabsContent id="sdk" label="Swift" default>\n\n```swift\nx\n```\n\n  </TabsContent>\n  <TabsContent id="rx-swift" label="RxSwift">One line.</TabsContent>\n</Tabs>\n',
      { format: "mdx", host: "docs", tabs: "both" },
    )
    expect(shape(tree)).toEqual([
      {
        group: undefined,
        tabs: [
          ["Swift", "sdk", true, "code"],
          ["RxSwift", "rx-swift", false, "paragraph"],
        ],
      },
    ])
  })

  it("reads Docusaurus's Tabs and TabItem with groupId and defaultValue", () => {
    const { tree } = compile(
      '<Tabs groupId="os" defaultValue="mac">\n  <TabItem value="win" label="Windows">Win</TabItem>\n  <TabItem value="mac">Mac</TabItem>\n</Tabs>\n',
      { format: "mdx", host: "docusaurus", tabs: "host" },
    )
    expect(shape(tree)).toEqual([
      {
        group: "os",
        tabs: [
          ["Windows", "win", false, "paragraph"],
          ["mac", "mac", true, "paragraph"],
        ],
      },
    ])
  })

  it("keeps a given value on its first tab and numbers what would repeat it", () => {
    const { tree } = compile(
      '<Tabs>\n  <TabItem value="mac" label="Mac">A</TabItem>\n  <TabItem label="mac">B</TabItem>\n  <TabItem value="mac" label="Again">C</TabItem>\n</Tabs>\n',
      { format: "mdx", host: "docusaurus", tabs: "host" },
    )
    expect(shape(tree)[0]!.tabs.map((member) => member[1])).toEqual([
      "mac",
      "mac-1",
      "mac-2",
    ])
  })

  it("reads Nextra's items list, written as JavaScript, and its defaultIndex", () => {
    const { tree, diagnostics } = compile(
      "<Tabs items={['pnpm', `npm`]} defaultIndex={1}>\n  <Tabs.Tab>pnpm add x</Tabs.Tab>\n  <Tabs.Tab>npm i x</Tabs.Tab>\n</Tabs>\n",
      { format: "mdx", host: "nextra", tabs: "host" },
    )
    expect(diagnostics).toEqual([])
    expect(shape(tree)).toEqual([
      {
        group: undefined,
        tabs: [
          ["pnpm", "pnpm", false, "paragraph"],
          ["npm", "npm", true, "paragraph"],
        ],
      },
    ])
  })

  it("leaves the components alone, without a word, under cudoc's syntax", () => {
    const { tree, diagnostics } = compile(
      "<Tabs items={labels}>\n  <Tabs.Tab>a</Tabs.Tab>\n</Tabs>\n",
      { format: "mdx", host: "nextra" },
    )
    expect(groups(tree)).toEqual([])
    expect(diagnostics).toEqual([])
  })

  it("reports a group whose labels are not literal, and keeps it", () => {
    const { tree, diagnostics } = compile(
      "<Tabs items={labels}>\n  <Tabs.Tab>a</Tabs.Tab>\n</Tabs>\n",
      { format: "mdx", host: "nextra", tabs: "host" },
    )
    expect(groups(tree)).toEqual([])
    expect(diagnostics.map((entry) => entry.code)).toEqual([
      "DYNAMIC_COMPONENT",
    ])
  })
})

describe("presented tabs", () => {
  const SOURCE =
    '```kotlin tab="Kotlin"\na\n```\n\n```java tab="Java"\nb\n```\n'

  it("draws radio tabs with the default one marked, and no radio checked", () => {
    const { tree } = compile(SOURCE)
    presentDocument(tree, { host: "next" })
    const html = renderDocument(tree)
    expect(html).toContain(
      '<div class="cudoc-tabs">\n<input type="radio" name="cudoc-tabs-1" id="cudoc-tabs-1-0" class="cudoc-tab-input cudoc-tab-default">\n<label for="cudoc-tabs-1-0" class="cudoc-tab-label">Kotlin</label>\n<div class="cudoc-tab">',
    )
    expect(html).toContain(
      '<input type="radio" name="cudoc-tabs-1" id="cudoc-tabs-1-1" class="cudoc-tab-input">',
    )
    expect(html).not.toContain("checked")
  })

  it("names a group spliced in later after the ones already drawn", () => {
    const { tree } = compile(SOURCE)
    presentDocument(tree, { host: "next" })
    const once = JSON.stringify(tree)
    presentDocument(tree, { host: "next" })
    expect(JSON.stringify(tree)).toBe(once)
    const { tree: later } = compile(SOURCE)
    tree.children.push(...later.children)
    presentDocument(tree, { host: "next" })
    expect(renderDocument(tree)).toContain('name="cudoc-tabs-2"')
  })

  it("draws the docs host's tabs with its own components", () => {
    const { tree } = compile(
      '```swift tab="Swift" group=sdk\na\n```\n\n```swift tab="RxSwift"\nb\n```\n',
      { host: "docs" },
    )
    presentDocument(tree, { host: "docs" })
    const [group] = groups(tree)
    expect([group!.data!.hName, group!.data!.hProperties]).toEqual([
      "Tabs",
      { group: "sdk" },
    ])
    expect(
      group!.children!.map((member) => [
        member.data!.hName,
        member.data!.hProperties,
      ]),
    ).toEqual([
      ["TabsContent", { id: "swift", label: "Swift" }],
      ["TabsContent", { id: "rxswift", label: "RxSwift" }],
    ])
  })

  it("names the props a site's components take", () => {
    const { tree } = compile(SOURCE)
    presentDocument(tree, {
      host: "docusaurus",
      tabElements: {
        tabs: { name: "Tabs", group: "groupId" },
        tab: { name: "TabItem", value: "value" },
      },
    })
    expect(groups(tree)[0]!.children![1]!.data!.hProperties).toEqual({
      value: "java",
      label: "Java",
    })
  })

  it("is taken off again, either way, leaving the stored group", () => {
    for (const target of [
      { host: "next" as const },
      { host: "docs" as const },
    ]) {
      const { tree } = compile(SOURCE)
      const stored = JSON.stringify(tree)
      presentDocument(tree, target)
      withoutPresentation(tree)
      expect(JSON.stringify(tree)).toBe(stored)
    }
  })

  it("validates the site's components", () => {
    expect(resolveTabElements(undefined)).toBeUndefined()
    expect(resolveTabElements(false)).toBe(false)
    expect(() => resolveTabElements({ tabs: "Tabs" })).toThrow("tabElements")
    expect(() =>
      resolveTabElements({ tabs: "Tabs", tab: { name: "Tab", id: "x" } }),
    ).toThrow("tabElements")
    expect(() => resolveTabElements({ tabs: "my tabs", tab: "Tab" })).toThrow(
      "tabElements",
    )
  })
})
