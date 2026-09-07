import { describe, expect, it } from "vitest"
import { cudocRemarkPlugins } from "cudoc-nextra"
import { cudocComponents } from "cudoc-nextra/components"
import { cudocComponents as sharedComponents } from "cudoc-remark/components"

describe("cudocRemarkPlugins", () => {
  it("builds the shared plugin list", () => {
    // The arrangement itself is cudoc-remark's `createHostPlugins`, tested
    // there; this is the wiring around it.
    expect(cudocRemarkPlugins()).toHaveLength(2)
    expect(cudocRemarkPlugins({ promoteHeadingIds: false })).toHaveLength(1)
  })

  it("rejects removed options at the adapter entry point", () => {
    expect(() =>
      cudocRemarkPlugins({ toc: true } as Parameters<
        typeof cudocRemarkPlugins
      >[0]),
    ).toThrow('cudoc-nextra: unknown option "toc"')
  })

  it("rejects an unknown option while the config is loading", () => {
    expect(() =>
      cudocRemarkPlugins({ anchor: {} } as Parameters<
        typeof cudocRemarkPlugins
      >[0]),
    ).toThrow(/unknown option/)
  })
})

describe("cudoc-nextra/components", () => {
  it("re-exports the shared implementations rather than copying them", () => {
    expect(cudocComponents).toEqual(sharedComponents)
    for (const [name, component] of Object.entries(cudocComponents)) {
      expect(component).toBe(
        sharedComponents[name as keyof typeof sharedComponents],
      )
    }
  })
})
