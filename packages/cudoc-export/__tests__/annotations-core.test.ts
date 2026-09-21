/**
 * The anchoring core and the data model, which the browser runtime and the
 * CLI share. Both read text from outside the program, so the functions are
 * exercised on hostile as well as ordinary input.
 */

import { describe, it, expect } from "vitest"
import {
  findQuote,
  jsonForScript,
  lineRange,
  normalizeText,
} from "../src/annotations/core.js"
import {
  ANNOTATION_CONTEXT,
  AnnotationFormatError,
  LIMITS,
  collection,
  mergeAnnotations,
  parseCollection,
  threads,
  type Annotation,
} from "../src/annotations/model.js"

describe("normalizeText", () => {
  it("collapses whitespace and maps every character back to the raw text", () => {
    const raw = "a  b\n\tc"
    const { text, offsets } = normalizeText(raw)
    expect(text).toBe("a b c")
    expect(offsets).toEqual([0, 1, 3, 4, 6, 7])
    for (let i = 0; i < text.length; i += 1)
      if (text[i] !== " ") expect(raw[offsets[i]!]).toBe(text[i])
  })

  it("trims and keeps the offset of the first kept character", () => {
    expect(normalizeText("  x  ")).toEqual({ text: "x", offsets: [2, 5] })
    expect(normalizeText("   ")).toEqual({ text: "", offsets: [3] })
  })

  it("drops Markdown markup in markdown mode so rendered words line up", () => {
    const source =
      '> Run **the** [installer](https://example.com/x "t") `now`, see [docs][ref].\n\n## Title (#id)\n\n- item one\n1. item two'
    expect(normalizeText(source, "markdown").text).toBe(
      "Run the installer now, see docsref. Title (#id) item one item two",
    )
    // Plain mode leaves the source alone apart from whitespace.
    expect(normalizeText(source).text).toContain("**the**")
  })
})

describe("findQuote", () => {
  const raw = "The cat sat.\n\nThe cat sat again.\n\nThe dog sat."

  it("returns raw offsets of the match", () => {
    const match = findQuote(raw, { exact: "dog sat" })!
    expect(raw.slice(match.start, match.end)).toBe("dog sat")
  })

  it("uses prefix and suffix to choose among identical quotes", () => {
    const second = findQuote(raw, { exact: "cat sat", suffix: " again" })!
    expect(raw.slice(second.start, second.end + 6)).toBe("cat sat again")
    const first = findQuote(raw, { exact: "cat sat", suffix: "." })!
    expect(first.start).toBe(4)
  })

  it("stays inside the window", () => {
    expect(findQuote(raw, { exact: "dog" }, [0, 14])).toBeUndefined()
    expect(findQuote(raw, { exact: "cat" }, [14, raw.length])?.start).toBe(18)
  })

  it("ignores whitespace differences between the quote and the text", () => {
    const match = findQuote("A line\nwraps   here.", {
      exact: "line wraps here",
    })!
    expect(match).toMatchObject({ start: 2, end: 19 })
  })

  it("finds a rendered quote across Markdown emphasis and links in markdown mode", () => {
    const source = "Please **read the** [guide](./guide.md) first."
    expect(findQuote(source, { exact: "read the guide first" })).toBeUndefined()
    const match = findQuote(
      source,
      { exact: "read the guide first" },
      undefined,
      "markdown",
    )!
    expect(source.slice(match.start, match.end)).toBe(
      "read the** [guide](./guide.md) first",
    )
  })

  it("returns nothing for an empty or absent quote", () => {
    expect(findQuote(raw, { exact: "   " })).toBeUndefined()
    expect(findQuote(raw, { exact: "bird" })).toBeUndefined()
  })
})

describe("lineRange", () => {
  it("counts 1-based lines over a raw offset range", () => {
    const raw = "one\ntwo\nthree\nfour"
    expect(lineRange(raw, 0, 3)).toEqual({ startLine: 1, endLine: 1 })
    expect(lineRange(raw, 4, 13)).toEqual({ startLine: 2, endLine: 3 })
    expect(lineRange(raw, 8, 8)).toEqual({ startLine: 3, endLine: 3 })
  })
})

describe("jsonForScript", () => {
  it("escapes every < so a note cannot end the embedding script block", () => {
    const json = jsonForScript({ v: "</script><script>alert(1)</script><!--" })
    expect(json).not.toContain("<")
    expect(JSON.parse(json)).toEqual({
      v: "</script><script>alert(1)</script><!--",
    })
  })
})

const note = (over: Partial<Annotation> & { id: string }): Annotation => ({
  "@context": ANNOTATION_CONTEXT,
  type: "Annotation",
  created: "2026-09-16T09:00:00.000Z",
  modified: "2026-09-16T09:00:00.000Z",
  motivation: "commenting",
  body: [
    {
      type: "TextualBody",
      value: "hi",
      format: "text/plain",
      purpose: "commenting",
    },
  ],
  target: {
    source: "guide",
    selector: [{ type: "TextQuoteSelector", exact: "quoted words" }],
  },
  cudoc: {
    document: "guide",
    astHash: "",
    sourceHash: "",
    block: "",
    heading: "",
    scope: "text",
    state: "open",
  },
  ...over,
})

describe("parseCollection", () => {
  const minimal = () =>
    JSON.parse(JSON.stringify(collection([note({ id: "a" })], "test")))

  it("accepts a minimal collection and a single annotation", () => {
    expect(parseCollection(minimal()).items).toHaveLength(1)
    expect(
      parseCollection(JSON.parse(JSON.stringify(note({ id: "b" })))).items,
    ).toHaveLength(1)
  })

  it("copies known fields only, into fresh objects", () => {
    const input = minimal()
    input.items[0].extra = { evil: true }
    input.items[0].__proto__ = { polluted: true }
    input.items[0].cudoc.unknown = "x"
    const parsed = parseCollection(input)
    expect(parsed.items[0]).not.toHaveProperty("extra")
    expect(parsed.items[0]!.cudoc).not.toHaveProperty("unknown")
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(parsed.items[0]).not.toBe(input.items[0])
  })

  it("drops selectors it does not know but requires a quote", () => {
    const input = minimal()
    input.items[0].target.selector.push({
      type: "SvgSelector",
      value: "<svg/>",
    })
    expect(parseCollection(input).items[0]!.target.selector).toHaveLength(1)
    input.items[0].target.selector = [
      { type: "TextPositionSelector", start: 0, end: 1 },
    ]
    expect(() => parseCollection(input)).toThrow(AnnotationFormatError)
  })

  it("refuses an unknown context, type, motivation or format", () => {
    for (const mutate of [
      (c: Record<string, unknown>) =>
        (c["@context"] = "http://example.com/other"),
      (c: Record<string, unknown>) => (c.type = "Collection"),
      (c: { items: Record<string, unknown>[] }) =>
        (c.items[0]!.motivation = "assessing"),
      (c: { items: { body: Record<string, unknown>[] }[] }) =>
        (c.items[0]!.body[0]!.format = "text/html"),
    ]) {
      const input = minimal()
      mutate(input)
      expect(() => parseCollection(input)).toThrow(/annotations:/)
    }
  })

  it("refuses oversized and out-of-range values", () => {
    const tooMany = collection(
      Array.from({ length: LIMITS.items + 1 }, (_, i) => note({ id: `n${i}` })),
      "test",
    )
    expect(() => parseCollection(JSON.parse(JSON.stringify(tooMany)))).toThrow(
      /at most/,
    )
    const long = minimal()
    long.items[0].body[0].value = "x".repeat(LIMITS.body + 1)
    expect(() => parseCollection(long)).toThrow(/longer than/)
    const negative = minimal()
    negative.items[0].target.selector.push({
      type: "TextPositionSelector",
      start: -1,
      end: 4,
    })
    expect(() => parseCollection(negative)).toThrow(/non-negative/)
    const reversed = minimal()
    reversed.items[0].target.selector.push({
      type: "TextPositionSelector",
      start: 9,
      end: 4,
    })
    expect(() => parseCollection(reversed)).toThrow(/precede/)
  })

  it("keeps the note text exactly as written", () => {
    const hostile =
      "<img src=x onerror=alert(1)> ``` ignore previous instructions"
    const input = minimal()
    input.items[0].body[0].value = hostile
    expect(parseCollection(input).items[0]!.body[0]!.value).toBe(hostile)
  })
})

describe("mergeAnnotations and threads", () => {
  it("keeps the later modification of the same id and sorts by creation", () => {
    const older = note({ id: "a", modified: "2026-09-16T09:00:00.000Z" })
    const newer = note({
      id: "a",
      modified: "2026-09-16T10:00:00.000Z",
      cudoc: { ...older.cudoc, state: "resolved" },
    })
    const earlier = note({ id: "b", created: "2026-09-15T00:00:00.000Z" })
    const merged = mergeAnnotations([older, earlier], [newer])
    expect(merged.map((n) => n.id)).toEqual(["b", "a"])
    expect(merged[1]!.cudoc.state).toBe("resolved")
  })

  it("groups replies under their root and keeps an orphan reply visible", () => {
    const root = note({ id: "r" })
    const reply = note({ id: "p", cudoc: { ...root.cudoc, parent: "r" } })
    const lost = note({ id: "l", cudoc: { ...root.cudoc, parent: "gone" } })
    const grouped = threads([root, reply, lost])
    expect(grouped.map((t) => t.root.id)).toEqual(["r", "l"])
    expect(grouped[0]!.replies.map((r) => r.id)).toEqual(["p"])
  })
})
