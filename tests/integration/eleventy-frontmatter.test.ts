/**
 * Eleventy's front matter split.
 *
 * Eleventy strips front matter with gray-matter before markdown-it sees a page,
 * and `cudoc-eleventy` collects without depending on it, splitting the file by
 * the same rules. This compares the two on the installed Eleventy, with the
 * front matter options Eleventy configures itself: the text the collector
 * renders has to be the text Eleventy renders, or every collected position is
 * off by the difference.
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { describe, it, expect, beforeAll } from "vitest"
import type MarkdownIt from "markdown-it"
import type { DocumentCompiler } from "@cudoment/cudoc/node/library"
import { HOST_CASES, ROOT } from "./hosts.js"

const SITE = path.join(ROOT, "examples/eleventy")
const ELEVENTY = path.join(SITE, "node_modules/@11ty/eleventy")
const host = HOST_CASES.find((h) => h.name === "eleventy")!

const SOURCES: Record<string, string> = {
  "no front matter": "# Title\n",
  "a YAML block": "---\ntitle: Guide\n---\n\n# Guide\n",
  "Windows line endings": "---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n",
  "a byte order mark": "\uFEFF---\ntitle: Guide\n---\n# Guide\n",
  "four dashes": "----\ntitle: x\n----\n# Guide\n",
  "a yml block": "---yml\ntitle: Y\n---\n# Y\n",
  "a JSON block": '---json\n{"title": "J"}\n---\n# J\n',
  "a space after the opening dashes": "--- \ntitle: S\n---\n# S\n",
  "a block that never closes": "---\ntitle: U\n# U\n",
  "comment lines alone": "---\n# only a comment\n---\nBody\n",
  "an empty block": "---\n---\nBody\n",
  "text after the closing dashes": "---\ntitle: C\n---trailing\nBody\n",
  "four closing dashes": "---\ntitle: C\n----\nBody\n",
  "spaces after the closing dashes": "---\ntitle: T\n---  \nBody\n",
  "a thematic break further down": "Intro\n\n---\n\nAfter\n",
  "the opening dashes alone": "---",
  "an empty JSON block": "---json\n# c\n---\nBody\n",
  "an empty JavaScript block": "---js\n---\nBody\n",
}

type Matter = (
  text: string,
  options: object,
) => { content: string; data: Record<string, unknown> }

const suite = host.compiler ? describe : describe.skip

suite("eleventy: front matter split as Eleventy splits it", () => {
  let matter: Matter
  let options: object
  let compile: DocumentCompiler
  const rendered: string[] = []

  beforeAll(async () => {
    // The collector is the built package. A build from before the split was
    // written would call gray-matter itself and agree with it trivially.
    const built = path.join(SITE, "node_modules/cudoc-eleventy/dist")
    if (!fs.existsSync(path.join(built, "frontmatter.js")))
      throw new Error(
        `${built} has no front matter split of its own; run npm run build`,
      )
    // gray-matter is Eleventy's dependency, resolved from Eleventy itself, and
    // the options are the ones a new Eleventy configuration starts with.
    matter = createRequire(path.join(ELEVENTY, "package.json"))("gray-matter")
    const { default: UserConfig } = await import(
      pathToFileURL(path.join(ELEVENTY, "src/UserConfig.js")).href
    )
    options = new UserConfig().frontMatterParsingOptions
    const { createRenderer } = await import(
      pathToFileURL(path.join(SITE, "markdown.mjs")).href
    )
    const { createDocumentCompiler } = await import(
      pathToFileURL(
        path.join(SITE, "node_modules/cudoc-eleventy/dist/index.js"),
      ).href
    )
    const md: MarkdownIt = createRenderer()
    const render = md.render.bind(md)
    md.render = (text, env) => {
      rendered.push(text)
      return render(text, env)
    }
    compile = createDocumentCompiler(md)
  })

  for (const [name, source] of Object.entries(SOURCES))
    it(`renders the body and reads the data Eleventy does: ${name}`, () => {
      const expected = matter(source, { ...options })
      rendered.length = 0
      const result = compile(source, {
        id: "guide",
        filePath: "docs/guide.md",
        options: {},
      })
      expect(rendered).toEqual([expected.content])
      expect(result.frontmatter).toEqual(expected.data)
    })
})

if (!host.compiler)
  it.skip(`eleventy: front matter split needs ${host.unavailable}`, () => {})
