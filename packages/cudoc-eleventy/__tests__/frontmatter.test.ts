import { describe, it, expect } from "vitest"
import { splitFrontmatter } from "../src/frontmatter.js"

/**
 * Each body is what Eleventy's gray-matter leaves for markdown-it, read from
 * Eleventy 3.1 with its own front matter options;
 * `tests/integration/eleventy-frontmatter.test.ts` compares the same split with
 * the copy an installed Eleventy carries.
 */
const CASES: [string, string, string, Record<string, unknown>][] = [
  ["no front matter", "# Title\n", "# Title\n", {}],
  [
    "a YAML block",
    "---\ntitle: Guide\n---\n\n# Guide\n",
    "\n# Guide\n",
    { title: "Guide" },
  ],
  [
    "Windows line endings",
    "---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n",
    "\r\n# Guide\r\n",
    { title: "Guide" },
  ],
  [
    "a byte order mark",
    "\uFEFF---\ntitle: Guide\n---\n# Guide\n",
    "# Guide\n",
    { title: "Guide" },
  ],
  [
    "four dashes, which open nothing",
    "----\ntitle: x\n----\n# Guide\n",
    "----\ntitle: x\n----\n# Guide\n",
    {},
  ],
  ["a yml block", "---yml\ntitle: Y\n---\n# Y\n", "# Y\n", { title: "Y" }],
  [
    "a JSON block",
    '---json\n{"title": "J"}\n---\n# J\n',
    "# J\n",
    { title: "J" },
  ],
  [
    "a space after the opening dashes",
    "--- \ntitle: S\n---\n# S\n",
    "# S\n",
    { title: "S" },
  ],
  ["a block that never closes", "---\ntitle: U\n# U\n", "", { title: "U" }],
  ["comment lines alone", "---\n# only a comment\n---\nBody\n", "Body\n", {}],
  ["an empty block", "---\n---\nBody\n", "Body\n", {}],
  [
    "text after the closing dashes",
    "---\ntitle: C\n---trailing\nBody\n",
    "trailing\nBody\n",
    { title: "C" },
  ],
  [
    "four closing dashes",
    "---\ntitle: C\n----\nBody\n",
    "-\nBody\n",
    { title: "C" },
  ],
  [
    "spaces after the closing dashes",
    "---\ntitle: T\n---  \nBody\n",
    "  \nBody\n",
    { title: "T" },
  ],
  [
    "a thematic break further down",
    "Intro\n\n---\n\nAfter\n",
    "Intro\n\n---\n\nAfter\n",
    {},
  ],
  ["the opening dashes alone", "---", "", {}],
  // An empty block is never parsed, so a language that cannot be read is not
  // reached either.
  ["an empty JSON block", "---json\n# c\n---\nBody\n", "Body\n", {}],
  ["an empty JavaScript block", "---js\n---\nBody\n", "Body\n", {}],
]

describe("front matter split the way Eleventy splits it", () => {
  for (const [name, source, body, data] of CASES)
    it(`leaves the body Eleventy renders: ${name}`, () => {
      expect(splitFrontmatter(source, "docs/guide.md")).toEqual({ body, data })
    })

  it("reads a date as the text it was written as, as the other hosts do", () => {
    // Eleventy's own loader would make this a Date.
    expect(
      splitFrontmatter("---\ndate: 2024-01-02\n---\nBody\n", "docs/guide.md")
        .data,
    ).toEqual({ date: "2024-01-02" })
  })

  it("reads `<<` as an ordinary key, as YAML 1.2 does", () => {
    expect(
      splitFrontmatter(
        "---\nbase: &x\n  a: 1\nmerged:\n  <<: *x\n---\nBody\n",
        "docs/guide.md",
      ).data,
    ).toEqual({ base: { a: 1 }, merged: { "<<": { a: 1 } } })
  })

  it("refuses JavaScript front matter rather than running it", () => {
    expect(() =>
      splitFrontmatter(
        '---js\n{ title: "From code" }\n---\nBody\n',
        "docs/guide.md",
      ),
    ).toThrow(
      "cudoc-eleventy: docs/guide.md has js front matter; collection reads YAML and JSON front matter, and does not run code",
    )
  })

  it("refuses front matter that is not a mapping, naming the file", () => {
    expect(() =>
      splitFrontmatter("---\n- one\n- two\n---\nBody\n", "docs/guide.md"),
    ).toThrow(
      "cudoc-eleventy: the front matter of docs/guide.md must be a mapping",
    )
  })
})
