/**
 * Element names used inside a normalized table cell.
 *
 * These are HTML elements, identical across every MDX host, so they are fixed
 * rather than configurable. `cudoc-core` takes the name as an argument, so an
 * option can be added here later without touching the parser.
 */

import {
  createLineBreakElement,
  isLineBreakElement,
  isMdxTextElementNamed,
} from "cudoc-core"
import type { Node } from "unist"

export const LINE_BREAK_ELEMENT = "br"
export const UNORDERED_LIST_ELEMENT = "ul"
export const ORDERED_LIST_ELEMENT = "ol"

export const createBreak = () => createLineBreakElement(LINE_BREAK_ELEMENT)

export const isBreak = (node: Node): boolean =>
  isLineBreakElement(node, LINE_BREAK_ELEMENT)

export const isJsxListElement = (node: Node): boolean =>
  isMdxTextElementNamed(node, UNORDERED_LIST_ELEMENT) ||
  isMdxTextElementNamed(node, ORDERED_LIST_ELEMENT)
