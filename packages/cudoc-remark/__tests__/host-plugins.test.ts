import { describe, expect, it } from "vitest"
import { createHostPlugins } from "cudoc-remark"
import type { HostPluginOptions } from "cudoc-remark"
import { compile } from "@mdx-js/mdx"

const HOST = "cudoc-example"

/** The options an entry was built with, for asserting what was passed through. */
const optionsOf = (
  plugins: ReturnType<typeof createHostPlugins>,
  index: number,
) => (plugins[index] as [unknown, Record<string, unknown>])[1]

describe("createHostPlugins", () => {
  it("returns the transforms and the id promotion, in that order", () => {
    const plugins = createHostPlugins({}, HOST)

    // The promotion reads anchors the transforms create, so it cannot be first.
    expect(plugins).toHaveLength(2)
    expect(plugins[0]).toBeInstanceOf(Array)
    expect(plugins[1]).toBeInstanceOf(Array)
  })

  it("omits the id promotion when it is turned off", () => {
    expect(createHostPlugins({ promoteHeadingIds: false }, HOST)).toHaveLength(
      1,
    )
  })

  it("forces the table of contents off and passes everything else through", () => {
    const plugins = createHostPlugins({ badge: false }, HOST)

    expect(optionsOf(plugins, 0)).toMatchObject({ toc: false, badge: false })
  })

  it("passes width rules and ignored diagnostic codes through", () => {
    const plugins = createHostPlugins(
      {
        tableColumnWidths: [{ widths: { Description: "20rem" } }],
        ignoreDiagnostics: ["DYNAMIC_COMPONENT"],
      },
      HOST,
    )

    expect(optionsOf(plugins, 0)).toMatchObject({
      tableColumnWidths: [{ widths: { Description: "20rem" } }],
      ignoreDiagnostics: ["DYNAMIC_COMPONENT"],
    })
  })

  it("does not leak its own option into the transforms", () => {
    const plugins = createHostPlugins({ promoteHeadingIds: true }, HOST)

    expect(optionsOf(plugins, 0)).not.toHaveProperty("promoteHeadingIds")
  })

  it.each([true, false, undefined, { exportName: "customToc" }])(
    "rejects a removed option regardless of its value: %j",
    (toc) => {
      expect(() =>
        createHostPlugins({ toc } as HostPluginOptions, HOST),
      ).toThrow('cudoc-example: unknown option "toc"')
    },
  )

  it("preserves the host's export without adding another one", async () => {
    const output = String(
      await compile(
        'export const toc = [{ id: "native-heading" }]\n\n## Heading (#native-heading)',
        { remarkPlugins: createHostPlugins({}, HOST) },
      ),
    )
    expect(output.match(/export const toc\b/g)).toHaveLength(1)
    expect(output).toContain('id: "native-heading"')
  })

  it("rejects an unknown option while the config is still loading", () => {
    expect(() =>
      createHostPlugins(
        { badgeDelimiters: ["(@", ")"] } as HostPluginOptions,
        HOST,
      ),
    ).toThrow(/unknown option/)
  })

  it("tells the promotion which anchor element to read", () => {
    const plugins = createHostPlugins(
      {
        headingMetadata: {
          anchor: { name: "HeadingLink", idAttribute: "anchorId" },
        },
      },
      HOST,
    )

    expect(optionsOf(plugins, 1)).toEqual({
      anchorName: "HeadingLink",
      idAttribute: "anchorId",
    })
  })

  it("leaves the promotion on its defaults when the anchor is not renamed", () => {
    expect(optionsOf(createHostPlugins({}, HOST), 1)).toEqual({})
  })
})
