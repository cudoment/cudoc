/**
 * Highlighted code cut into lines: a span highlight.js runs across a line
 * break is closed at the break and opened again on the next line.
 */

import { describe, it, expect } from "vitest"
import hljs from "highlight.js"
import { highlightedLines, splitHighlightedLines } from "../src/code-lines.js"

describe("splitHighlightedLines", () => {
  it("balances a span that runs across lines", () => {
    expect(
      splitHighlightedLines(
        'a <span class="c">/* one\n<b>two</b>\nthree */</span> z',
      ),
    ).toEqual([
      'a <span class="c">/* one</span>',
      '<span class="c"><b>two</b></span>',
      '<span class="c">three */</span> z',
    ])
  })

  it("keeps empty lines, escaped text and nested spans", () => {
    expect(splitHighlightedLines("&lt;a&gt;\n\n<i><b>x\ny</b></i>")).toEqual([
      "&#x3C;a>",
      "",
      "<i><b>x</b></i>",
      "<i><b>y</b></i>",
    ])
  })
})

describe("highlightedLines", () => {
  it("wraps every line and marks the numbered ones on real highlight.js output", () => {
    const html = hljs.highlight("/* a\n b */\nconst x = 1", {
      language: "js",
    }).value
    const out = highlightedLines(html, [2, 3])
    expect(out.split("\n")).toEqual([
      '<span class="line"><span class="hljs-comment">/* a</span></span>',
      '<span class="line highlighted"><span class="hljs-comment"> b */</span></span>',
      '<span class="line highlighted"><span class="hljs-keyword">const</span> x = <span class="hljs-number">1</span></span>',
    ])
  })
})
