import { describe, expect, it } from "vitest"
import { resolveOptions } from "cudoc-remark"

describe("unknown options", () => {
  it("rejects a misspelled key instead of ignoring it", () => {
    expect(() => resolveOptions({ headingMetdata: {} } as never)).toThrow(
      /unknown option "headingMetdata"/,
    )
  })

  it("lists every unknown key", () => {
    expect(() => resolveOptions({ foo: 1, bar: 2 } as never)).toThrow(
      /unknown options "foo", "bar"/,
    )
  })
})

describe("defaults", () => {
  it("enables syntax features and leaves the table of contents off", () => {
    const resolved = resolveOptions()

    expect(resolved.tableCellList).toBe(true)
    expect(resolved.headingMetadata).not.toBeNull()
    expect(resolved.badge).not.toBeNull()
    expect(resolved.toc).toBeNull()
    expect(resolved.tableColumnLayout).toEqual([])
    expect(resolved.tableColumnWidths).toEqual([])
  })

  it("accepts width rules and ignored diagnostic codes", () => {
    expect(
      resolveOptions({
        tableColumnWidths: [{ widths: { A: "4rem" } }],
        ignoreDiagnostics: ["DYNAMIC_COMPONENT"],
      }).tableColumnWidths,
    ).toMatchObject([{ widths: { A: "4rem" }, ignoreElements: ["Badge"] }])
    expect(() =>
      resolveOptions({ tableColumnWidths: { A: "4rem" } } as never),
    ).toThrow(/tableColumnWidths must be an array of rules/)
  })

  it("treats true as the defaults for a feature", () => {
    expect(resolveOptions({ headingMetadata: true }).headingMetadata).toEqual(
      resolveOptions().headingMetadata,
    )
  })

  it("treats false as off", () => {
    expect(
      resolveOptions({ headingMetadata: false }).headingMetadata,
    ).toBeNull()
    expect(resolveOptions({ badge: false }).badge).toBeNull()
  })
})

describe("validation", () => {
  it("rejects a delimiter that is not a pair of strings", () => {
    expect(() =>
      resolveOptions({ headingMetadata: { idDelimiters: ["(#"] as never } }),
    ).toThrow(/must be a pair of strings/)
  })

  it("rejects an empty delimiter", () => {
    expect(() =>
      resolveOptions({ headingMetadata: { idDelimiters: ["(#", ""] } }),
    ).toThrow(/must not contain an empty delimiter/)
  })

  it("rejects an out-of-range heading depth", () => {
    expect(() => resolveOptions({ headingMetadata: { depths: [0] } })).toThrow(
      /must be a non-empty array of 1-6/,
    )
  })

  it("rejects a layout rule without a section", () => {
    expect(() =>
      resolveOptions({
        tableColumnLayout: [{ columnHeaders: ["A"] } as never],
      }),
    ).toThrow(/tableColumnLayout\[0\]\.section must be an object/)
  })

  it("rejects a layout rule without column headers", () => {
    expect(() =>
      resolveOptions({
        tableColumnLayout: [{ section: { titles: ["A"] }, columnHeaders: [] }],
      }),
    ).toThrow(/columnHeaders must be a non-empty string array/)
  })

  it("rejects fewer than two split columns", () => {
    expect(() =>
      resolveOptions({
        tableColumnLayout: [
          {
            section: { titles: ["A"] },
            columnHeaders: ["B"],
            split: { columns: 1 },
          },
        ],
      }),
    ).toThrow(/split\.columns must be an integer of 2 or more/)
  })

  it("rejects a threshold below the column count", () => {
    expect(() =>
      resolveOptions({
        tableColumnLayout: [
          {
            section: { titles: ["A"] },
            columnHeaders: ["B"],
            split: { columns: 3, minItems: 2 },
          },
        ],
      }),
    ).toThrow(/split\.minItems must be an integer of at least/)
  })

  it("rejects more than two table-of-contents depths", () => {
    expect(() => resolveOptions({ toc: { depths: [2, 3, 4] } })).toThrow(
      /toc\.depths must be one or two heading depths/,
    )
  })
})

describe("serializability", () => {
  it("accepts a configuration that survives a JSON round trip", () => {
    // A bundler may hand this config to a worker, so it must contain no
    // functions or RegExp objects.
    const config = {
      headingMetadata: {
        depths: [2, 3, 4, 5],
        idDelimiters: ["(#", ")"],
        badgeDelimiters: ["(@", ")"],
        anchor: { levelAttribute: "headerLevel" },
      },
      toc: { titleDepth: 1, depths: [2, 3] },
      tableColumnLayout: [
        {
          section: { depth: 5, titles: ["Requirements"] },
          columnHeaders: ["Prerequisites"],
          split: { minItems: 4, columns: 2 },
        },
      ],
    }

    expect(JSON.parse(JSON.stringify(config))).toEqual(config)
    expect(() => resolveOptions(config as never)).not.toThrow()
  })
})
