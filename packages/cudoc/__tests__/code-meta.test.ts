/**
 * A code block's title and highlighted lines: read from the meta in the
 * forms the syntax mode admits, kept as semantics, and drawn by whoever
 * renders the page, in its own meta where it has a title or in a frame.
 */

import { describe, it, expect } from "vitest"
import type { Root } from "mdast"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import { parseCodeMeta, type DocumentNode, type Host } from "../src/document.js"
import {
  codeMetaRest,
  formatLineRanges,
  parseLineRanges,
} from "../src/internal/markers.js"
import { presentDocument, withoutPresentation } from "../src/present.js"

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]
const codes = (tree: Root) =>
  walk(tree as unknown as DocumentNode).filter((node) => node.type === "code")

describe("line ranges", () => {
  it("reads numbers and ranges in order, each once, and writes them back", () => {
    expect(parseLineRanges("5, 1-3,2")).toEqual([1, 2, 3, 5])
    expect(formatLineRanges([1, 2, 3, 5, 7, 8])).toBe("{1-3,5,7-8}")
    expect(formatLineRanges([4])).toBe("{4}")
  })

  it("reads a range written backwards and skips one too long to mean lines", () => {
    expect(parseLineRanges("5-3, 1-20000, 9")).toEqual([3, 4, 5, 9])
    expect(parseLineRanges("1-10000")).toHaveLength(10000)
    expect(parseLineRanges("1-10001")).toEqual([])
    // Nothing left to highlight is no lines at all.
    expect(parseCodeMeta("{1-20000}", "cudoc", "next")).toEqual({ rest: "" })
    // A number past the exact integers would never let the count end.
    expect(parseLineRanges("9007199254740992,3")).toEqual([3])
    expect(parseLineRanges(`1-${"9".repeat(400)}`)).toEqual([])
    // Lines are numbered from 1, and an empty part names none.
    expect(parseLineRanges("1,,2")).toEqual([1, 2])
    expect(parseLineRanges("0-2, 4")).toEqual([4])
    expect(parseLineRanges("2-,3")).toEqual([3])
  })
})

describe("parseCodeMeta", () => {
  it("reads no key, list or name inside another entry's quoted value", () => {
    expect(
      parseCodeMeta('title="use tab=x {2} [a]" {1}', "both", "vitepress"),
    ).toEqual({ title: "use tab=x {2} [a]", lines: [1], rest: "" })
    // A fence whose title spells a tab is no tab.
    const tree = compileDocument('```js title="use tab=x here"\nx\n```\n').tree
    const [code] = codes(tree)
    expect(code!.data?.cudoc).toMatchObject({ title: "use tab=x here" })
    expect(
      codeMetaRest('title="a {1}" {1} keep', { title: "a {1}", lines: [1] }),
    ).toBe("keep")
    // The `docs` profile's entries, separated by commas, alike.
    expect(
      codeMetaRest(
        'headers="keep {2} here",{1},title=Actual,showLineNumbers',
        { title: "Actual", lines: [1] },
        ",",
      ),
    ).toBe('headers="keep {2} here",showLineNumbers')
  })

  it("reads cudoc's title= and {…} in any order and keeps the rest", () => {
    expect(
      parseCodeMeta('{1,3-4} showLineNumbers title="a b.js"', "cudoc", "next"),
    ).toEqual({
      title: "a b.js",
      lines: [1, 3, 4],
      rest: "showLineNumbers",
    })
    expect(parseCodeMeta("title='it\"s.js'", "cudoc", "next").title).toBe(
      'it"s.js',
    )
    expect(parseCodeMeta("title=bare.js", "cudoc", "next").title).toBe(
      "bare.js",
    )
  })

  it("reads each host's own title form only where the mode admits it", () => {
    expect(parseCodeMeta('filename="a.js"', "host", "nextra")).toEqual({
      title: "a.js",
      rest: "",
    })
    expect(parseCodeMeta('filename="a.js"', "host", "docs").title).toBe("a.js")
    expect(parseCodeMeta('title="a.js"', "host", "docusaurus").title).toBe(
      "a.js",
    )
    expect(parseCodeMeta("[config.ts] {2}", "host", "vitepress")).toEqual({
      title: "config.ts",
      lines: [2],
      rest: "",
    })
    // A cudoc-only mode leaves a host's form to the host.
    expect(parseCodeMeta('filename="a.js"', "cudoc", "nextra")).toEqual({
      rest: 'filename="a.js"',
    })
    // A host-only mode leaves cudoc's title= on a host without one.
    expect(parseCodeMeta('title="a.js"', "host", "nextra")).toEqual({
      rest: 'title="a.js"',
    })
    // Both forms at once: the first one read is the title.
    expect(
      parseCodeMeta('title="cudoc.js" filename="host.js"', "both", "nextra"),
    ).toEqual({ title: "cudoc.js", rest: "" })
  })

  it("leaves a code group's [name] to its tab", () => {
    expect(parseCodeMeta("[npm] {1}", "host", "vitepress", true)).toEqual({
      lines: [1],
      rest: "[npm]",
    })
  })

  it("takes off only the title it read and the lines, whatever the spelling", () => {
    expect(
      codeMetaRest('filename="a.js" {2} showLineNumbers', {
        title: "a.js",
        lines: [2],
      }),
    ).toBe("showLineNumbers")
    // A title form naming something else is the host's, and stays.
    expect(
      codeMetaRest('title="a.js" filename="b.js"', { title: "a.js" }),
    ).toBe('filename="b.js"')
    expect(codeMetaRest("[a.js] {2}", {})).toBe("[a.js] {2}")
  })

  it("leaves braces that are not line ranges alone", () => {
    expect(parseCodeMeta("{.class} {a:1}", "both", "next")).toEqual({
      rest: "{.class} {a:1}",
    })
  })
})

describe("code blocks in a compiled document", () => {
  it("keeps the title and lines as semantics, and the meta as written", () => {
    const { tree } = compileDocument(
      '```js title="retry.js" {2}\nconst a = 1\nconst b = 2\n```\n\n```js\nplain\n```\n\n```cudoc-embed\nsources: [a.md]\n```\n',
      { format: "md" },
    )
    const [titled, plain, embed] = codes(tree)
    expect(titled!.data?.cudoc).toEqual({
      kind: "code",
      title: "retry.js",
      lines: [2],
    })
    expect(titled!.meta).toBe('title="retry.js" {2}')
    expect(plain!.data?.cudoc).toBeUndefined()
    expect(embed!.data?.cudoc).toBeUndefined()
  })

  it("reads no title with codeMeta set to host on a host without one", () => {
    const { tree } = compileDocument('```js title="a.js" {1}\nx\n```\n', {
      format: "md",
      host: "next",
      syntax: { codeMeta: "host" },
    })
    expect(codes(tree)[0]!.data?.cudoc).toEqual({ kind: "code", lines: [1] })
  })
})

describe("presentDocument", () => {
  const SOURCE = '> ```js title="retry.js" {2,3} showLineNumbers\n> a\n> ```\n'
  const presented = (host: Host) => {
    const { tree } = compileDocument(SOURCE, { format: "md", host })
    presentDocument(tree, { host })
    return tree
  }

  it("hands a host with a title of its own the title in its own meta", () => {
    for (const [host, meta] of [
      ["docusaurus", 'title="retry.js" {2-3} showLineNumbers'],
      ["nextra", 'filename="retry.js" {2-3} showLineNumbers'],
      // The docs profile's code component splits at commas and shows a
      // quote as written.
      ["docs", "filename=retry.js,{2-3},showLineNumbers"],
    ] as const) {
      const tree = presented(host)
      const [code] = codes(tree)
      expect(code!.meta).toBe(meta)
      expect(
        walk(tree as unknown as DocumentNode).some(
          (node) => node.data?.cudoc?.presentation,
        ),
      ).toBe(false)
    }
  })

  it("frames the block under its title for every other renderer", () => {
    const tree = presented("next")
    const quote = tree.children[0] as unknown as DocumentNode
    const frame = quote.children![0]!
    expect(frame.data?.cudoc).toEqual({ kind: "codeFrame", presentation: true })
    expect(frame.children!.map((node) => node.type)).toEqual([
      "paragraph",
      "code",
    ])
    expect(frame.children![1]!.meta).toBe("{2-3} showLineNumbers")
    expect(renderDocument(tree)).toContain(
      '<div class="cudoc-code">\n<div class="cudoc-code-title">retry.js</div>\n<pre><code class="language-js">',
    )
  })

  it("frames the block on a Nextra .md page, whose meta Nextra drops", () => {
    const { tree } = compileDocument(SOURCE, { format: "md", host: "nextra" })
    presentDocument(tree, { host: "nextra", format: "md" })
    const quote = tree.children[0] as unknown as DocumentNode
    expect(quote.children![0]!.data?.cudoc?.kind).toBe("codeFrame")
  })

  it("leaves a framed block alone on a second run", () => {
    const tree = presented("next")
    const once = JSON.stringify(tree)
    presentDocument(tree, { host: "next" })
    expect(JSON.stringify(tree)).toBe(once)
  })

  it("keeps a host form normalization did not read", () => {
    // Under cudoc's syntax Nextra's filename= is the host's to read.
    const { tree } = compileDocument('```js filename="a.js" {2}\nx\n```\n', {
      format: "mdx",
      host: "nextra",
    })
    presentDocument(tree, { host: "nextra", format: "mdx" })
    expect(codes(tree)[0]!.meta).toBe('{2} filename="a.js"')
  })

  it("keeps the docs profile's own filename= as that profile writes it", () => {
    const { tree } = compileDocument("```swift filename=Podfile\nx\n```\n", {
      format: "mdx",
      host: "docs",
      syntax: { codeMeta: "both" },
    })
    presentDocument(tree, { host: "docs", format: "mdx" })
    expect(codes(tree)[0]!.meta).toBe("filename=Podfile")
  })

  it("reads and writes the docs profile's meta as entries joined by commas", () => {
    // The profile splits at commas alone, so a value runs to the next one.
    expect(
      parseCodeMeta("filename=Podfile,{2, 4},headers=a", "host", "docs"),
    ).toEqual({ title: "Podfile", lines: [2, 4], rest: "headers=a" })
    expect(parseCodeMeta("filename=My File.swift", "host", "docs")).toEqual({
      title: "My File.swift",
      rest: "",
    })
    for (const [syntax, source, meta, title, lines] of [
      [
        "both",
        "filename=Podfile,showLineNumbers",
        "filename=Podfile,showLineNumbers",
        "Podfile",
        undefined,
      ],
      ["both", "filename=Podfile,{2}", "filename=Podfile,{2}", "Podfile", [2]],
      ["both", "filename=a b.js,{2}", "filename=a b.js,{2}", "a b.js", [2]],
      [
        "both",
        "showLineNumbers,filename=Podfile",
        "filename=Podfile,showLineNumbers",
        "Podfile",
        undefined,
      ],
      [
        "both",
        "filename=a.js,headers=Content-Type: text/plain",
        "filename=a.js,headers=Content-Type: text/plain",
        "a.js",
        undefined,
      ],
      // cudoc's own form, written with spaces, leaves an entry each.
      [
        "cudoc",
        'title="a b.js" {2} showLineNumbers foo="x y"',
        'filename=a b.js,{2},showLineNumbers,foo="x y"',
        "a b.js",
        [2],
      ],
      ["cudoc", 'title="a,b.js" x', 'filename="a,b.js",x', "a,b.js", undefined],
    ] as const) {
      const { tree } = compileDocument(`\`\`\`swift ${source}\nx\n\`\`\`\n`, {
        format: "mdx",
        host: "docs",
        syntax: { codeMeta: syntax },
      })
      presentDocument(tree, { host: "docs", format: "mdx" })
      const presented = String(codes(tree)[0]!.meta)
      expect(presented).toBe(meta)
      // What the page is handed reads back as the same title and lines,
      // and the profile's own parser, which splits at every comma, sees the title
      // in its filename entry unless the title holds a comma.
      const read = parseCodeMeta(presented, "host", "docs")
      expect([read.title, read.lines]).toEqual([title, lines])
      const docs = Object.fromEntries(
        presented.split(",").map((entry) => entry.split("=")),
      )
      if (!title.includes(",")) expect(docs.filename).toBe(title)
      withoutPresentation(tree)
      expect(codes(tree)[0]!.meta).toBe(source)
    }
  })

  it("picks the quote the title does not hold", () => {
    const { tree } = compileDocument("```js title='say \"hi\".js'\nx\n```\n", {
      format: "md",
      host: "nextra",
    })
    presentDocument(tree, { host: "nextra" })
    expect(codes(tree)[0]!.meta).toBe("filename='say \"hi\".js'")
  })

  it("is taken off again by withoutPresentation, leaving the tree as compiled", () => {
    for (const host of ["next", "nextra"] as const) {
      const { tree } = compileDocument(SOURCE, { format: "md", host })
      const stored = JSON.stringify(tree)
      presentDocument(tree, { host })
      withoutPresentation(tree)
      expect(JSON.stringify(tree)).toBe(stored)
    }
    const tree = presented("next")
    withoutPresentation(tree)
    const quote = tree.children[0] as unknown as DocumentNode
    expect(quote.children!.map((node) => node.type)).toEqual(["code"])
    expect(quote.children![0]!.data?.cudoc).toEqual({
      kind: "code",
      title: "retry.js",
      lines: [2, 3],
    })
  })
})
