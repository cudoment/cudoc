/**
 * How the published pages are written, as CONTRIBUTING.md's "Writing a page"
 * states it: the point first, then the detail. Reads files only.
 *
 * A page opens with one short paragraph that says what the page gives, and
 * that paragraph is what the documentation site writes as the page's
 * description, so it has to be whole within the length a search result
 * shows. Every section opens with a sentence rather than a code block, a
 * table or a list, so a reader who lands on a heading learns the point before
 * the material. A paragraph makes one point in a few sentences, and a sentence
 * says one thing. And a translation keeps the structure of its original,
 * heading for heading and block for block, so the two languages cannot drift
 * apart in what they cover.
 */

import path from "node:path"
import { describe, expect, it } from "vitest"
import type { Paragraph, Root, RootContent } from "mdast"
import {
  DESCRIPTION_LENGTH,
  documentDescription,
  frontmatterOf,
} from "@cudoment/cudoc/query"
import { ROOT } from "./hosts.js"
import { documents, parse, text } from "./documents.js"

/** The most a paragraph says, in code points: one point, a few sentences. */
export const PARAGRAPH_LENGTH = 600

/** The most sentences a paragraph makes its point in, and a list item. */
export const PARAGRAPH_SENTENCES = 5
export const ITEM_SENTENCES = 3

/**
 * The most a sentence says, one thing: an English sentence in words, a Korean
 * one in characters without spaces.
 */
export const SENTENCE_LENGTH = { english: 40, korean: 120 }

/** Separators a line of links is written with: `|`, `·`, `/`, dashes. */
const SEPARATORS = /^[\s|·•/,\-–—]*$/u

/**
 * A paragraph that only links elsewhere, such as the language line under a
 * title, `**English** | [한국어](…) · [All guides](…)`: links and emphasized
 * words between separators, with at least one link.
 */
const linksOnly = (paragraph: Paragraph): boolean =>
  paragraph.children.some((child) => child.type === "link") &&
  paragraph.children.every(
    (child) =>
      child.type === "link" ||
      child.type === "strong" ||
      child.type === "emphasis" ||
      (child.type === "text" && SEPARATORS.test(child.value)),
  )

/** A paragraph that says something in words. */
const prose = (node: RootContent | undefined): node is Paragraph =>
  node?.type === "paragraph" && !linksOnly(node) && text(node).trim().length > 0

const words = (node: Paragraph): string =>
  text(node).replace(/\s+/g, " ").trim()

const heading = (node: RootContent): string =>
  node.type === "heading" ? `${"#".repeat(node.depth)} ${text(node)}` : ""

/**
 * Every paragraph of a tree, inside lists and quotes too, and whether it is
 * a list item's.
 */
const paragraphs = (tree: Root): { paragraph: Paragraph; item: boolean }[] => {
  const found: { paragraph: Paragraph; item: boolean }[] = []
  const walk = (
    node: { type: string; children?: unknown[] },
    item: boolean,
  ) => {
    if (node.type === "paragraph")
      found.push({ paragraph: node as Paragraph, item })
    for (const child of node.children ?? [])
      walk(child as typeof node, item || node.type === "listItem")
  }
  walk(tree, false)
  return found
}

/**
 * A paragraph as it is read: a code span is one word, whatever it holds, a
 * hard line break a space, and an image nothing.
 */
const spoken = (node: {
  type: string
  value?: string
  children?: unknown[]
}): string =>
  node.type === "inlineCode"
    ? "X"
    : node.type === "break"
      ? " "
      : node.type === "image"
        ? ""
        : (node.value ??
          (node.children ?? [])
            .map((child) => spoken(child as typeof node))
            .join(""))

/** A period that ends an abbreviation rather than a sentence. */
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|cf|etc|al|approx)\.$/iu

/** A sentence ended inside quotation marks, as `"is it?" with` is not. */
const QUOTED = /[.!?]["'」』]$/u

/**
 * The sentences of a paragraph: the text splits after `.`, `!` or `?` and
 * any closing bracket or quote, except after an abbreviation such as "e.g."
 * and except inside quotation marks that a lowercase word follows. A bold
 * title that opens a paragraph, `**Title.**`, a callout's marker line,
 * `[!NOTE] Title`, and a `→ [Section](…)` pointer are not sentences.
 */
const sentences = (paragraph: Paragraph): string[] => {
  const [first, ...rest] = paragraph.children
  const title = first?.type === "strong" ? text(first) : ""
  const titled = /[.:]$/.test(title) && !/[.!?]\s/.test(title)
  return spoken({ ...paragraph, children: titled ? rest : paragraph.children })
    .replace(/^\[![^\]]+\][^\n]*\n?/, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?][)\]"'」』]*)\s+/u)
    .reduce<string[]>((joined, piece) => {
      const last = joined.at(-1)
      const continues =
        last !== undefined &&
        (ABBREVIATION.test(last) || (QUOTED.test(last) && /^[a-z]/.test(piece)))
      if (continues) joined[joined.length - 1] = `${last} ${piece}`
      else joined.push(piece)
      return joined
    }, [])
    .filter(
      (sentence) => /[\p{L}\p{N}]/u.test(sentence) && !sentence.startsWith("→"),
    )
}

/** How much a sentence says: words in English, characters in Korean. */
const size = (sentence: string, korean: boolean): number =>
  korean
    ? Array.from(sentence.replace(/\s+/g, "")).length
    : sentence.split(/\s+/).filter(Boolean).length

describe.each(documents())("%s", (file) => {
  const tree = parse(path.join(ROOT, file))
  const blocks = tree.children

  it("opens with a lead the site shows whole as the page's description", () => {
    const title = blocks.findIndex(
      (node) => node.type === "heading" && node.depth === 1,
    )
    expect(title, "a `#` title").toBeGreaterThan(-1)
    // What follows the title and the line of links under it.
    const lead = blocks
      .slice(title + 1)
      .find((node) => !(node.type === "paragraph" && linksOnly(node)))
    expect(
      prose(lead) ? "a paragraph" : `${lead?.type ?? "nothing"}`,
      "the first block after the title is a paragraph that says what the page gives",
    ).toBe("a paragraph")
    const description = documentDescription(tree, frontmatterOf(tree))
    expect(
      description,
      `the lead is the description, whole, within ${DESCRIPTION_LENGTH} characters`,
    ).toBe(words(lead as Paragraph))
    expect(Array.from(description).length).toBeLessThanOrEqual(
      DESCRIPTION_LENGTH,
    )
  })

  it("opens every section with a sentence, or with its first subsection", () => {
    const opened = blocks
      .map((node, index) => {
        if (node.type !== "heading" || node.depth === 1) return undefined
        // An `<a id>` written before a section's text is not its content.
        const next = blocks
          .slice(index + 1)
          .find((candidate) => candidate.type !== "html")
        return next?.type === "heading" || prose(next)
          ? undefined
          : `${node.position?.start.line}: ${heading(node)} opens with ${next?.type ?? "nothing"}`
      })
      .filter(Boolean)
    expect(opened).toEqual([])
  })

  it(`makes one point per paragraph, within ${PARAGRAPH_LENGTH} characters`, () => {
    const long = paragraphs(tree)
      .map(({ paragraph }) => ({
        line: paragraph.position?.start.line,
        length: Array.from(words(paragraph)).length,
      }))
      .filter(({ length }) => length > PARAGRAPH_LENGTH)
      .map(({ line, length }) => `${line}: ${length} characters`)
    expect(long).toEqual([])
  })

  it(`says one thing per sentence, in ${PARAGRAPH_SENTENCES} sentences per paragraph and ${ITEM_SENTENCES} per list item`, () => {
    const korean = file.endsWith(".ko.md")
    const limit = korean ? SENTENCE_LENGTH.korean : SENTENCE_LENGTH.english
    const unit = korean ? "characters" : "words"
    const long = paragraphs(tree).flatMap(({ paragraph, item }) => {
      const line = paragraph.position?.start.line
      const found = sentences(paragraph)
      const most = item ? ITEM_SENTENCES : PARAGRAPH_SENTENCES
      return [
        ...(found.length > most
          ? [
              `${line}: ${item ? "a list item" : "a paragraph"} of ${found.length} sentences`,
            ]
          : []),
        ...found
          .filter((sentence) => size(sentence, korean) > limit)
          .map(
            (sentence) =>
              `${line}: a sentence of ${size(sentence, korean)} ${unit}: ${sentence.slice(0, 60)}…`,
          ),
      ]
    })
    expect(long).toEqual([])
  })
})

/** Each English page beside its Korean translation. */
const translated = documents()
  .filter((file) => file.endsWith(".ko.md"))
  .map((korean) => [korean.replace(/\.ko\.md$/, ".md"), korean] as const)
  .filter(([english]) => documents().includes(english))

describe("a translation has the structure of its original", () => {
  /** What a page is made of, block for block, with the text left out. */
  const shape = (file: string) =>
    parse(path.join(ROOT, file))
      .children.filter((node) => node.type !== "html")
      .map((node) =>
        node.type === "heading"
          ? `${"#".repeat(node.depth)}`
          : node.type === "list"
            ? `list of ${node.children.length}`
            : node.type === "table"
              ? `table of ${node.children.length}`
              : node.type,
      )

  it("pairs every Korean page with an English one", () => {
    expect(translated.length).toBe(
      documents().filter((file) => file.endsWith(".ko.md")).length,
    )
    expect(translated.length).toBeGreaterThan(10)
  })

  it.each(translated)("%s and %s", (english, korean) => {
    expect(shape(korean)).toEqual(shape(english))
  })
})
