/**
 * Character references, read through each host's own compiler. Every host
 * stores `&copy;` as the character it stands for, in prose and in a callout
 * title; VitePress keeps the reference as written in its text tokens, for
 * Vue, so its adapter decodes them, or a page would show `&copy;` itself. A
 * brace stays a reference there, in the tree and in the strings cudoc
 * writes back into a page, and reads as the brace wherever text is only read.
 */

import { describe, it, expect, beforeAll } from "vitest"
import type { Root } from "mdast"
import {
  nodeText,
  readableText,
  visibleHeadingText,
  type DocumentNode,
} from "@cudoment/cudoc/document"
import { documentTitle, getNodeText } from "@cudoment/cudoc/query"
import { renderDocument } from "@cudoment/cudoc/render"
import { HOST_CASES } from "./hosts.js"

const SOURCE = [
  "# Entities &#123;&#123; t &#125;&#125;",
  "",
  "> [!NOTE] Note &copy; title",
  "> Body &copy;",
  "",
  "A &copy; B &amp; C &#169; D \\&copy; E",
  "",
  "Vue &#123;&#123; x &#125;&#125; stays text.",
  "",
  "::: tip Tip &copy; \\&copy;",
  "Tip body.",
  ":::",
  "",
  "| Field | Detail |",
  "| --- | --- |",
  "| list | - In &#123;&#123; y &#125;&#125;<br>- two |",
  "",
  "[[toc]]",
  "",
  "## Use &#123;&#123; z &#125;&#125;",
  "",
].join("\n")

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: character references`, () => {
    let tree: Root
    let html: string

    beforeAll(async () => {
      const compile = await host.compiler!()
      const result = await compile(SOURCE, {
        id: "entities",
        filePath: "entities.md",
        options: { format: "md" },
      })
      tree = result.tree
      html = renderDocument(tree)
    })

    it("stores each reference as the character it stands for", () => {
      const paragraph = tree.children.find((node) => node.type === "paragraph")
      // An escaped `\&` keeps the reference as text.
      expect(nodeText(paragraph as unknown as DocumentNode)).toBe(
        "A © B & C © D &copy; E",
      )
      expect(html).toContain("A © B &#x26; C © D &#x26;copy; E")
    })

    it("decodes a callout title as its body", () => {
      expect(html).toContain("Note © title")
      expect(html).toContain("Body ©")
    })

    it("keeps a brace written as a reference out of Vue's reach", () => {
      const vue = tree.children.find(
        (node) =>
          node.type === "paragraph" &&
          nodeText(node as unknown as DocumentNode).startsWith("Vue"),
      )
      const use = tree.children.find(
        (node) => node.type === "heading" && node.depth === 2,
      ) as unknown as DocumentNode
      if (host.name === "vitepress") {
        // VitePress compiles the page as a Vue template, where `{{` would
        // run. A container's title is Markdown there, so `\&` escapes. A
        // list in a table cell is parsed apart from the page's text.
        expect(html).toContain("Vue &#123;&#123; x &#125;&#125; stays text.")
        expect(html).toContain("Tip © &#x26;copy;")
        expect(html).toContain("In &#123;&#123; y &#125;&#125;</li>")
        // The `[[toc]]` label, which cudoc writes back as a string, keeps
        // the reference too, as do `nodeText` and `visibleHeadingText`.
        expect(html).toContain("table-of-contents")
        expect(html).not.toMatch(/\{\{ [xyz]/)
        expect(nodeText(vue as unknown as DocumentNode)).toBe(
          "Vue &#123;&#123; x &#125;&#125; stays text.",
        )
        expect(visibleHeadingText(use)).toBe("Use &#123;&#123; z &#125;&#125;")
      } else {
        expect(html).toContain("In {{ y }}</li>")
        expect(visibleHeadingText(use)).toBe("Use {{ z }}")
      }
      // Text that is only read has the braces on every host.
      expect(readableText(vue as unknown as DocumentNode)).toBe(
        "Vue {{ x }} stays text.",
      )
      expect(visibleHeadingText(use, readableText)).toBe("Use {{ z }}")
      expect(getNodeText([vue!])).toBe("Vue {{ x }} stays text.")
      expect(documentTitle(tree)).toBe("Entities {{ t }}")
    })
  })
}
