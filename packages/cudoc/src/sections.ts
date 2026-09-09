import type { Heading, Root } from "mdast"
import { visit } from "unist-util-visit"
import {
  getHeadingAnchorId,
  sliceSectionByAnchorId,
} from "./internal/core/query/sections.js"
import { getNodeText } from "./internal/core/query/nodes.js"
import type { DocumentNode } from "./document.js"

export type SectionSelection = {
  anchors?: string[]
  titles?: string[]
  depth?: number | number[]
  includeChildren?: boolean
}
export type CollectedSection = {
  anchorId: string
  title: string
  tree: Root
  heading: Heading
}

export function collectSections(
  tree: Root,
  select: SectionSelection = {},
): CollectedSection[] {
  const result: CollectedSection[] = []
  const depths =
    select.depth === undefined
      ? undefined
      : Array.isArray(select.depth)
        ? select.depth
        : [select.depth]
  if (depths?.some((d) => !Number.isInteger(d) || d < 1 || d > 6))
    throw new TypeError("cudoc: section depth must be 1-6")
  visit(tree, "heading", (heading) => {
    const anchorId = getHeadingAnchorId(heading)
    const title = getNodeText(
      (heading.children as unknown as DocumentNode[]).filter(
        (n) => !["badge", "permalink"].includes(n.data?.cudoc?.kind ?? ""),
      ) as Heading["children"],
    ).trim()
    if (
      !anchorId ||
      (select.anchors &&
        !select.anchors.map((id) => id.replace(/^#/, "")).includes(anchorId)) ||
      (select.titles && !select.titles.includes(title)) ||
      (depths && !depths.includes(heading.depth))
    )
      return
    const section = structuredClone(sliceSectionByAnchorId(tree, anchorId)!)
    if (select.includeChildren === false) {
      const end = section.children.findIndex(
        (n, i) => i > 0 && n.type === "heading",
      )
      if (end >= 0)
        section.children = [
          ...section.children.slice(0, end),
          ...section.children
            .slice(end)
            .filter(
              (n) => n.type === "definition" || n.type === "footnoteDefinition",
            ),
        ]
    }
    result.push({ anchorId, title, tree: section, heading })
  })
  for (const id of select.anchors ?? [])
    if (!result.some((s) => s.anchorId === id.replace(/^#/, "")))
      throw new Error(`cudoc: missing section: ${id}`)
  return result
}
