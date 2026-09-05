/**
 * Single-pass traversal shared by every cudoc transform.
 *
 * Transforms run in one walk rather than one walk each, because ordering
 * between them is a contract: a transform that rewrites a whole table has to
 * see cells that earlier transforms already normalized.
 */

import type { Node, Parent, Root } from "mdast"

/** Where a node sits in its parent, recorded for each ancestor. */
export type AncestorLocation = {
  index: number
  parent: Parent
}

/** State carried through one document. Extend it per plugin. */
export type TransformState = {
  /** Raw source text, when the host provided it. Needed to read table cells. */
  source: string | null
}

export type TransformContext<State extends TransformState = TransformState> = {
  ancestors?: AncestorLocation[]
  index?: number
  node: Node
  parent?: Parent
  state: State
}

export type Transform<State extends TransformState = TransformState> = (
  context: TransformContext<State>,
) => void

const hasChildren = (node: Node): node is Parent =>
  "children" in node && Array.isArray((node as Parent).children)

/**
 * Runs `preTransforms` on the way down and `postTransforms` on the way up.
 *
 * A pre transform may replace the node it was given; the walk re-reads the slot
 * from the parent afterwards so the replacement, not the original, is what gets
 * descended into and what the post transforms see.
 */
export const walk = <State extends TransformState>({
  postTransforms,
  preTransforms,
  state,
  tree,
}: {
  postTransforms: Transform<State>[]
  preTransforms: Transform<State>[]
  state: State
  tree: Root
}): void => {
  const runTransforms = (
    transforms: Transform<State>[],
    context: TransformContext<State>,
  ) => {
    for (const transform of transforms) transform(context)
  }

  const visitNode = (
    node: Node,
    parent?: Parent,
    index?: number,
    ancestors: AncestorLocation[] = [],
  ) => {
    runTransforms(preTransforms, {
      ancestors,
      index,
      node,
      parent,
      state,
    })

    const currentNode =
      parent && typeof index === "number" ? parent.children[index] : node
    if (!currentNode) return

    if (hasChildren(currentNode)) {
      const childAncestors =
        parent && typeof index === "number"
          ? [...ancestors, { index, parent }]
          : ancestors

      for (
        let childIndex = 0;
        childIndex < currentNode.children.length;
        childIndex += 1
      ) {
        const child = currentNode.children[childIndex]
        if (!child) continue
        visitNode(child, currentNode, childIndex, childAncestors)
      }
    }

    runTransforms(postTransforms, {
      ancestors,
      index,
      node: currentNode,
      parent,
      state,
    })
  }

  visitNode(tree)
}
