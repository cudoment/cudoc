/**
 * The components are what stands between a configured feature and a render-time
 * crash, so these check that every emitted name exists and produces the markup
 * the hosts style against.
 */

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Anchor, Badge, cudocComponents } from "cudoc-remark/components"

describe("the default components", () => {
  it("covers the elements a host does not already provide", () => {
    // A laid-out table is rebuilt as `table`/`td`, which every host maps
    // already, so only the two genuinely new elements need an implementation.
    expect(Object.keys(cudocComponents).sort()).toEqual(["Anchor", "Badge"])
  })

  it("renders a badge with the class the hosts style", () => {
    expect(renderToStaticMarkup(<Badge>beta</Badge>)).toBe(
      '<span class="cudoc-badge">beta</span>',
    )
  })

  it("renders an anchor's badge and nothing else", () => {
    // The id belongs on the heading; a second element carrying it would make a
    // deep link ambiguous.
    expect(renderToStaticMarkup(<Anchor badge="beta" />)).toBe(
      '<span class="cudoc-badge">beta</span>',
    )
    expect(renderToStaticMarkup(<Anchor />)).toBe("")
  })
})
