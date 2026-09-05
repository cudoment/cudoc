/** Factories and guards for the MDX JSX nodes cudoc produces. */

import type { PhrasingContent } from "mdast"
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from "mdast-util-mdx-jsx"
import type { Node } from "unist"

export const createMdxAttribute = (
  name: string,
  value: string,
): MdxJsxAttribute => ({
  type: "mdxJsxAttribute",
  name,
  value,
})

export const createMdxTextElement = (
  name: string,
  children: PhrasingContent[],
  attributes: MdxJsxAttribute[] = [],
): MdxJsxTextElement => ({
  type: "mdxJsxTextElement",
  name,
  attributes,
  children,
})

type NamedMdxJsxTextElement<Name extends string> = MdxJsxTextElement & {
  name: Name
}

export const isMdxTextElementNamed = <Name extends string>(
  node: Node,
  name: Name,
): node is NamedMdxJsxTextElement<Name> =>
  node.type === "mdxJsxTextElement" && (node as MdxJsxTextElement).name === name

/**
 * The element an author uses for an explicit line break inside a cell. The name
 * is configurable because it is host markup, not cudoc syntax.
 */
export const createLineBreakElement = (name: string): MdxJsxTextElement =>
  createMdxTextElement(name, [])

export const isLineBreakElement = (node: Node, name: string): boolean =>
  isMdxTextElementNamed(node, name)

type MdxJsxTextElementLike = Omit<MdxJsxTextElement, "children"> & {
  children: unknown[]
}

export const asFlowChildren = (
  children: MdxJsxTextElementLike[],
): MdxJsxFlowElement["children"] =>
  children as unknown as MdxJsxFlowElement["children"]

export const createMdxFlowElement = (
  name: string,
  children: MdxJsxFlowElement["children"] = [],
  attributes: MdxJsxAttribute[] = [],
): MdxJsxFlowElement => ({
  type: "mdxJsxFlowElement",
  name,
  attributes,
  children,
})

export const setStringAttribute = (
  attributes: MdxJsxTextElement["attributes"],
  name: string,
  value: string,
): void => {
  const attribute = createMdxAttribute(name, value)
  const index = attributes.findIndex(
    (candidate): candidate is MdxJsxAttribute =>
      candidate.type === "mdxJsxAttribute" && candidate.name === name,
  )
  if (index === -1) attributes.push(attribute)
  else attributes[index] = attribute
}

export const readStringAttribute = (
  element: MdxJsxTextElement | undefined,
  name: string,
): string | undefined => {
  if (!element) return undefined

  const attribute = element.attributes.find(
    (candidate) => "name" in candidate && candidate.name === name,
  )
  if (!attribute || typeof attribute.value !== "string") return undefined

  return attribute.value
}
