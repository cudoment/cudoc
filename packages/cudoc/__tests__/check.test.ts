/**
 * Reference checking across a collected library.
 *
 * These build a real library from temporary files rather than hand-assembling
 * `StoredDocument`s, because the checker depends on what collection actually
 * produces: stripped positions, generated anchor ids, and the source snapshot
 * it recovers coordinates from.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse as parseModule } from "acorn"
import { buildDocuments, loadLibrary } from "../src/node/library.js"
import { checkReferences, type ReferenceIssueCode } from "../src/node/check.js"
import { resolveEmbed } from "../src/node/resolve-embed.js"
import { formatCheckResult } from "../src/node/report.js"
import { compileDocument, importedNamesFromSource } from "../src/markdown.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
})

const collected = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
  roots.push(root)
  const docs = path.join(root, "docs")
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(docs, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return buildDocuments({ sourceRoot: docs, outDir: path.join(root, ".cudoc") })
}

const check = (files: Record<string, string>) =>
  checkReferences(collected(files))

/** A library compiled by `compiler`, as a host's own compiler would. */
const collectedWith = (
  files: Record<string, string>,
  compiler: NonNullable<Parameters<typeof buildDocuments>[0]["compiler"]>,
) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
  roots.push(root)
  const docs = path.join(root, "docs")
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
    fs.writeFileSync(path.join(docs, name), content)
  }
  return buildDocuments({
    sourceRoot: docs,
    outDir: path.join(root, ".cudoc"),
    compiler,
    compilerId: "host",
  })
}

const codes = (result: ReturnType<typeof check>): ReferenceIssueCode[] =>
  result.issues.map((issue) => issue.code)

const REFERENCE = "# Reference\n\n## Limits (#limits)\n\nBody.\n"

describe("resolvable references", () => {
  it("reports nothing when every link and embed resolves", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide (#guide)\n\n[limits](reference.md#limits)\n",
    })

    expect(result.issues).toEqual([])
    expect(result.documentCount).toBe(2)
    expect(result.checkedReferences).toBe(1)
  })

  it("resolves a link to a directory as that directory's index document", () => {
    // VitePress writes a link to `index.md` as `./`, and to `guide/index.md`
    // as `guide/`; both name the index document, anchors included.
    const result = check({
      "index.md": "# Home (#home)\n",
      "guide/index.md": "# Guide (#guide)\n",
      "reference.md":
        "# Reference\n\n[home](./) [home](./#home) [guide](guide/) [guide](guide/#guide) [guide](guide) [missing](guide/#nope)\n",
    })
    expect(codes(result)).toEqual(["missing-anchor"])
    expect(result.issues[0]!.message).toBe("guide/index has no anchor #nope")
  })

  it("rebases a link to a directory in a copy onto the index document's route", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    fs.mkdirSync(path.join(docs, "guide"), { recursive: true })
    fs.writeFileSync(path.join(docs, "index.md"), "# Home (#home)\n")
    fs.writeFileSync(path.join(docs, "guide/index.md"), "# Guide (#guide)\n")
    fs.writeFileSync(
      path.join(docs, "reference.md"),
      "# Reference\n\n## Limits (#limits)\n\n[home](./) [guide](guide/)\n",
    )
    const library = buildDocuments({
      sourceRoot: docs,
      outDir: path.join(root, ".cudoc"),
      routeBase: "/docs",
    })
    const copy = JSON.stringify(
      resolveEmbed(
        library,
        { sources: ["reference.md#limits"] },
        { documentId: "index" },
      ),
    )
    expect(copy).toContain('"url":"/docs/"')
    expect(copy).toContain('"url":"/docs/guide/"')
  })

  it("reads a trailing slash as the directory beside a document of its name", () => {
    // Routes ending in `.html` keep `guide.md` and `guide/index.md` apart,
    // and VitePress writes a link to the second as `./guide/`.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    fs.mkdirSync(path.join(docs, "guide/sub"), { recursive: true })
    fs.writeFileSync(path.join(docs, "guide.md"), "# Guide (#g)\n")
    fs.writeFileSync(path.join(docs, "guide/index.md"), "# Index (#i)\n")
    fs.writeFileSync(
      path.join(docs, "reference.md"),
      "# Reference\n\n## Limits (#limits)\n\n[index](./guide/#i) [guide](./guide#g) [tab](./guide/?tab=1#i)\n",
    )
    // `..` is a directory too, as a browser reads it.
    fs.writeFileSync(
      path.join(docs, "guide/sub/page.md"),
      "# Page\n\n## Up (#up)\n\n[up](..#i)\n",
    )
    const library = buildDocuments({
      sourceRoot: docs,
      outDir: path.join(root, ".cudoc"),
      routeSuffix: ".html",
    })
    expect(checkReferences(library).issues).toEqual([])
    const copy = JSON.stringify(
      resolveEmbed(
        library,
        { sources: ["reference.md#limits"] },
        { documentId: "guide" },
      ),
    )
    expect(copy).toContain('"url":"/guide/index.html#i"')
    expect(copy).toContain('"url":"/guide.html#g"')
    expect(copy).toContain('"url":"/guide/index.html?tab=1#i"')
    const up = JSON.stringify(
      resolveEmbed(
        library,
        { sources: ["guide/sub/page.md#up"] },
        { documentId: "reference" },
      ),
    )
    expect(up).toContain('"url":"/guide/index.html#i"')
  })

  it("moves the resources raw HTML in a copy loads, attribute by attribute", () => {
    // A value may span lines, and another attribute's text may read like one.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    fs.mkdirSync(path.join(docs, "guide"), { recursive: true })
    fs.writeFileSync(path.join(docs, "index.md"), "# Home\n")
    fs.writeFileSync(
      path.join(docs, "guide/page.md"),
      [
        "# Page",
        "",
        "## Shots (#shots)",
        "",
        "<figure>",
        '<img alt="the data = c" src="media/a.png"',
        '  srcset="media/a.png 1x,',
        '  media/b%20c.png 2x" data-note=\'keep "this"\' id="shot">',
        '<video poster=media/p.png src="media/v.mp4"></video>',
        '<object data="media/d.svg"></object>',
        '<svg><image xlink:href="media/i.png"/></svg>',
        // A bare value runs to white space, `=` and `?` included; another
        // attribute may follow a quoted value with no space, or a stray `/`.
        '<a href=other.md?tab=1#x>Other</a> <img src=https://cdn.example.com/a.png?w=100 alt="cdn">',
        '<img alt="1"src="media/tight.png"> <img / src="media/slash.png">',
        "</figure>",
        "",
        "![Plain](media/plain.png)",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: docs,
      outDir: path.join(root, ".cudoc"),
    })
    // What a lowered MDX element keeps as its properties.
    const page = library.documents.find((doc) => doc.id === "guide/page")!
    const visitAll = (node: Record<string, unknown>) => {
      if (node.type === "image")
        node.data = {
          hProperties: {
            srcSet: "media/a.png 1x, media/b.png 2x",
            poster: "media/p.png",
          },
        }
      for (const child of (node.children as Record<string, unknown>[]) ?? [])
        visitAll(child)
    }
    visitAll(page.tree as unknown as Record<string, unknown>)
    const copy = JSON.stringify(
      resolveEmbed(
        library,
        { sources: ["guide/page.md#shots"] },
        { documentId: "index" },
      ),
    )
    const html = (
      JSON.parse(copy) as { children: { type: string; value?: string }[] }
    ).children
      .filter((node) => node.type === "html")
      .map((node) => node.value)
      .join("\n")
    expect(html).toContain('alt="the data = c" src="/guide/media/a.png"')
    expect(html).toContain(
      'srcset="/guide/media/a.png 1x, /guide/media/b%20c.png 2x"',
    )
    expect(html).toContain(`data-note='keep "this"'`)
    expect(html).toMatch(/ id="embed-1-\d*-?shot"/)
    expect(html).toContain('poster="/guide/media/p.png"')
    expect(html).toContain('data="/guide/media/d.svg"')
    expect(html).toContain('xlink:href="/guide/media/i.png"')
    expect(html).toContain('href="/guide/other.md?tab=1#x"')
    expect(html).toContain('src="https://cdn.example.com/a.png?w=100"')
    expect(html).toContain('alt="1"src="/guide/media/tight.png"')
    expect(html).toContain('<img / src="/guide/media/slash.png">')
    expect(copy).toContain(
      '"srcSet":"/guide/media/a.png 1x, /guide/media/b.png 2x"',
    )
    expect(copy).toContain('"poster":"/guide/media/p.png"')
  })

  it("writes a moved module path back as a string that parses", () => {
    // Docusaurus requires an image relative to its page's own directory, and
    // that directory's name can hold a quote; the path the copy requires from
    // elsewhere has to be escaped again for its string. The module in the
    // second attribute already escapes a quote and a backslash of its own.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    const directories = ['gu"ide', "it's"]
    for (const directory of directories) {
      fs.mkdirSync(path.join(docs, directory), { recursive: true })
      fs.writeFileSync(
        path.join(docs, directory, "source.md"),
        "# Source\n\n## Logo (#logo)\n\n![Logo](./logo.png)\n",
      )
    }
    fs.writeFileSync(path.join(docs, "index.md"), "# Home\n")
    const library = buildDocuments({
      sourceRoot: docs,
      outDir: path.join(root, ".cudoc"),
    })
    // One attribute in each quote, the second already escaping its own.
    const requiring = (node: Record<string, unknown>) => {
      if (node.type === "image") {
        for (const key of Object.keys(node)) delete node[key]
        Object.assign(node, {
          type: "mdxJsxTextElement",
          name: "img",
          attributes: [
            {
              type: "mdxJsxAttribute",
              name: "src",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value:
                  'require("!/x/url-loader.js!./logo.png?w=/../../y").default',
              },
            },
            {
              type: "mdxJsxAttribute",
              name: "data-other",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value:
                  "require('!/x/file-loader.js!./it\\'s \\\\ \\u00e9\\n.png')",
              },
            },
            // Text an author wrote that only looks like a call stays as is.
            {
              type: "mdxJsxAttribute",
              name: "code",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value: `'const x = require("./logo.png")'`,
              },
            },
          ],
          children: [],
          data: { cudocImage: { url: "./logo.png", alt: "Logo", title: null } },
        })
      }
      for (const child of (node.children as Record<string, unknown>[]) ?? [])
        requiring(child)
    }
    for (const doc of library.documents)
      requiring(doc.tree as unknown as Record<string, unknown>)

    for (const directory of directories) {
      const copy = resolveEmbed(
        library,
        { sources: [`${directory}/source.md#logo`] },
        { documentId: "index" },
      )
      const expressions: string[] = []
      const walk = (node: Record<string, unknown>) => {
        for (const attribute of (node.attributes as {
          value?: { value?: string }
        }[]) ?? [])
          if (attribute.value?.value) expressions.push(attribute.value.value)
        for (const child of (node.children as Record<string, unknown>[]) ?? [])
          walk(child)
      }
      walk(copy as unknown as Record<string, unknown>)
      // Each expression parses as the embed plugin parses it, as a module,
      // and requires the file from the page's own directory by its real
      // name, the query the host appended kept as it was.
      for (const expression of expressions)
        expect(() =>
          parseModule(`(${expression})`, {
            ecmaVersion: "latest",
            sourceType: "module",
          }),
        ).not.toThrow()
      const required = expressions.map((expression) => {
        let module = ""
        const value: unknown = new Function("require", `return ${expression}`)(
          (name: string) => {
            module = name.slice(name.lastIndexOf("!") + 1)
            return {}
          },
        )
        return module || value
      })
      expect(required, directory).toEqual([
        `./${directory}/logo.png?w=/../../y`,
        `./${directory}/it's \\ é\n.png`,
        'const x = require("./logo.png")',
      ])
    }
  })

  it("requires a copied image component's file from the page the copy lands on", () => {
    // Docusaurus requires an image's file relative to the page's own
    // directory, so a page elsewhere has to require it by another path.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    const files = {
      "reference/limits.md":
        "# Limits\n\n## Limits (#limits)\n\n![Logo](/img/logo.png) [Sheet](./it's.pdf)\n",
      "reference/other.md": "# Other\n",
      "index.md":
        "# Home\n\n## Shared (#shared)\n\n```cudoc-embed\nsources: [reference/limits.md#limits]\n```\n",
      "deep/er/page.md": "# Page\n",
    }
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
      fs.writeFileSync(path.join(docs, name), content)
    }
    const library = buildDocuments({
      sourceRoot: docs,
      outDir: path.join(root, ".cudoc"),
    })
    const limits = library.documents.find(
      (doc) => doc.id === "reference/limits",
    )!
    const asRequire = (node: Record<string, unknown>) => {
      if (node.type === "image") {
        const image = { url: node.url, alt: node.alt ?? null, title: null }
        for (const key of Object.keys(node)) delete node[key]
        Object.assign(node, {
          type: "mdxJsxTextElement",
          name: "img",
          attributes: [
            {
              type: "mdxJsxAttribute",
              name: "src",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value:
                  'require("!/x/url-loader.js?limit=1!./../../static/img/logo.png").default',
              },
            },
          ],
          children: [],
          data: { cudocImage: image },
        })
      }
      // A link to a local file is required the same way, and its name may
      // hold the other quote.
      if (node.type === "link") {
        const children = node.children
        for (const key of Object.keys(node)) delete node[key]
        Object.assign(node, {
          type: "mdxJsxTextElement",
          name: "a",
          attributes: [
            {
              type: "mdxJsxAttribute",
              name: "href",
              value: {
                type: "mdxJsxAttributeValueExpression",
                value: 'require("!/x/file-loader.js!./it\'s.pdf").default',
              },
            },
          ],
          children,
        })
      }
      for (const child of (node.children as Record<string, unknown>[]) ?? [])
        asRequire(child)
    }
    asRequire(limits.tree as unknown as Record<string, unknown>)
    const required = (documentId: string, source: string) =>
      JSON.stringify(
        resolveEmbed(library, { sources: [source] }, { documentId }),
      ).match(/!(\.[^"\\]*)\\"\)/)?.[1]

    expect(required("index", "reference/limits.md#limits")).toBe(
      "./../static/img/logo.png",
    )
    expect(
      JSON.stringify(
        resolveEmbed(
          library,
          { sources: ["reference/limits.md#limits"] },
          { documentId: "index" },
        ),
      ),
    ).toContain("!./reference/it's.pdf")
    expect(required("reference/other", "limits.md#limits")).toBe(
      "./../../static/img/logo.png",
    )
    // Through an embed in the section copied, still from the final page.
    expect(required("deep/er/page", "../../index.md#shared")).toBe(
      "./../../../static/img/logo.png",
    )
    // The library itself is left as it was collected.
    expect(JSON.stringify(limits.tree)).toContain(
      "!./../../static/img/logo.png",
    )
  })

  it("checks the image behind a host's image component as an image", () => {
    // What a Docusaurus collection holds: each image an `<img>` component,
    // with the image the capture kept beside it. The copy an embed makes of
    // it renders as that image, so it is not an unportable component.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    fs.mkdirSync(docs, { recursive: true })
    fs.writeFileSync(
      path.join(docs, "reference.md"),
      "# Reference\n\n## Limits (#limits)\n\n![Here](./here.png) ![Gone](./gone.png)\n",
    )
    fs.writeFileSync(
      path.join(docs, "guide.md"),
      "# Guide\n\n```cudoc-embed\nsources: [reference.md#limits]\n```\n",
    )
    fs.writeFileSync(path.join(docs, "here.png"), "png")
    const library = buildDocuments({
      sourceRoot: docs,
      outDir: path.join(root, ".cudoc"),
    })
    const asComponent = (node: Record<string, unknown>) => {
      if (node.type === "image") {
        const image = { url: node.url, alt: node.alt ?? null, title: null }
        for (const key of Object.keys(node)) delete node[key]
        Object.assign(node, {
          type: "mdxJsxTextElement",
          name: "img",
          attributes: [],
          children: [],
          data: { cudocImage: image },
        })
      }
      for (const child of (node.children as Record<string, unknown>[]) ?? [])
        asComponent(child)
    }
    asComponent(
      library.documents.find((doc) => doc.id === "reference")!
        .tree as unknown as Record<string, unknown>,
    )
    const result = checkReferences(library)
    expect(codes(result)).toEqual(["missing-asset"])
    expect(result.issues[0]!.message).toContain("./gone.png")
  })

  it("resolves a link into a subdirectory relative to its own document", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide/start.md": "# Start\n\n[limits](../reference.md#limits)\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("broken references", () => {
  it("names the anchors a document really has when one is missing", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide\n\n[typo](reference.md#limit)\n",
    })

    expect(codes(result)).toEqual(["missing-anchor"])
    // The author sees real names rather than a guess that can be wrong.
    expect(result.issues[0]!.available).toContain("limits")
  })

  it("points at the broken link, not an earlier one it is a prefix of", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        "# Guide\n\n[good](reference.md#limits)\n\n[bad](reference.md#limit)\n",
    })

    expect(result.issues[0]!.position?.start.line).toBe(5)
  })

  it("separates a missing document from a missing image", () => {
    const result = check({
      "guide.md": "# Guide\n\n[gone](nowhere.md)\n\n![gone](./none.png)\n",
    })

    expect(codes(result)).toEqual(["missing-document", "missing-asset"])
  })

  it("checks embed sources and their sections", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [reference.md#nosuch]\n```\n\n```cudoc-embed\nsources: [ghost.md]\n```\n",
    })

    expect(codes(result)).toEqual([
      "missing-embed-anchor",
      "missing-embed-source",
    ])
  })

  it("leaves external URLs alone", () => {
    const result = check({
      "guide.md":
        "# Guide\n\n[a](https://example.com/x)\n[b](mailto:a@example.com)\n[c](//cdn.example.com/y)\n",
    })

    expect(result.issues).toEqual([])
    expect(result.checkedReferences).toBe(3)
  })
})

describe("replacement rules that change nothing", () => {
  const embed = (spec: string) =>
    `# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("warns when a rule matches nothing the embed copies", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": embed(
        'sources: [reference.md#limits]\nreplace:\n  - find: "was reworded away"\n    replace: "x"',
      ),
    })

    expect(codes(result)).toEqual(["unmatched-embed-replacement"])
    expect(result.issues[0]!.severity).toBe("warning")
    // Pointed at the rule in the embedding document, not at the source.
    expect(result.issues[0]!.position?.start.line).toBe(6)
  })

  it("stays quiet when a rule matches at least one selected section", () => {
    // A rule list is applied to every selected section, so a rule aimed at one
    // of them misses the others by design. Only matching nothing is a problem.
    const result = check({
      "reference.md":
        "# Reference\n\n## Limits (#limits)\n\nBody.\n\n## Auth (#auth)\n\nOther.\n",
      "guide.md": embed(
        'sources: [reference.md]\nselect:\n  depth: 2\nreplace:\n  - find: "Body"\n    replace: "x"',
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("follows the rules in order, as the resolver does", () => {
    // The second rule can only match what the first one produced.
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": embed(
        'sources: [reference.md#limits]\nreplace:\n  - find: "Body"\n    replace: "MIDDLE"\n  - find: "MIDDLE"\n    replace: "final"',
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("narrows to what includeChildren actually copies", () => {
    const result = check({
      "reference.md":
        "# Reference\n\n## Limits (#limits)\n\nBody.\n\n### Retry (#retry)\n\nOnly in the child.\n",
      "guide.md": embed(
        'sources: [reference.md]\nselect:\n  anchors: [limits]\n  includeChildren: false\nreplace:\n  - find: "Only in the child"\n    replace: "x"',
      ),
    })

    expect(codes(result)).toEqual(["unmatched-embed-replacement"])
  })
})

describe("embed blocks that do not parse", () => {
  it("reports a syntax error as one, at the line inside the file", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        '# Guide\n\nIntro.\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: "unclosed\n```\n',
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    // The fence is on line 5 and the parser's line 3 is the rule, so line 8.
    expect(result.issues[0]!.position?.start.line).toBe(8)
    // The parser's own block-relative coordinate is dropped, not repeated.
    expect(result.issues[0]!.message).not.toMatch(/at line \d+, column/)
  })

  it("names the offending key rather than the whole block", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        '# Guide\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: "a"\n    replace: "b"\n    regexp: true\n```\n',
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    expect(result.issues[0]!.message).toContain('unknown key "regexp"')
    expect(result.issues[0]!.reference).toBe("embed block 1")
  })
})

describe("components an embed would copy", () => {
  const WIDGET = [
    "# Widget (#widget)",
    "",
    "## Live (#live)",
    "",
    "<Chart data={points} />",
    "",
    "## Static (#static)",
    "",
    "Plain prose.",
    "",
  ].join("\n")
  const embed = (spec: string) =>
    `# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("warns when the copied section carries a component", () => {
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed("sources: [widget.mdx#live]"),
    })

    expect(codes(result)).toEqual(["unportable-embed-component"])
    expect(result.issues[0]!.severity).toBe("warning")
    // Named, because the fix is either to move that component or to supply a
    // renderer for it, and both need to know which one it is.
    expect(result.issues[0]!.message).toContain("<Chart>")
  })

  it("stays quiet when the component sits outside the copied section", () => {
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed("sources: [widget.mdx#static]"),
    })

    expect(result.issues).toEqual([])
  })

  it("stays quiet for a summary table, which copies heading text only", () => {
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed(
        "sources: [widget.mdx]\nselect:\n  depth: 2\nrender:\n  type: table",
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("narrows with includeChildren the way the resolver does", () => {
    const result = check({
      "widget.mdx":
        "# Widget (#widget)\n\n## Outer (#outer)\n\nProse.\n\n### Inner (#inner)\n\n<Chart />\n",
      "guide.md": embed(
        "sources: [widget.mdx]\nselect:\n  anchors: [outer]\n  includeChildren: false",
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("combines a section named in the source with select, as the resolver does", () => {
    // The resolver applies `select` to the section the source names, so the
    // copy of `#outer` stops before its child here and the component in the
    // child never travels. Inspecting the whole section would report it.
    const result = check({
      "widget.mdx":
        "# Widget (#widget)\n\n## Outer (#outer)\n\nProse.\n\n### Inner (#inner)\n\n<Chart />\n",
      "guide.md": embed(
        "sources: [widget.mdx#outer]\nselect:\n  includeChildren: false",
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("reports a select anchor that names no section", () => {
    // collectSections throws here and the build raises the same error, so
    // swallowing it would make the checker pass something the build rejects.
    const result = check({
      "widget.mdx": WIDGET,
      "guide.md": embed("sources: [widget.mdx]\nselect:\n  anchors: [nosuch]"),
    })

    expect(codes(result)).toEqual(["missing-embed-anchor"])
    expect(result.issues[0]!.available).toContain("live")
  })
})

describe("anchors a document declares", () => {
  it("reports a duplicate explicit anchor at the later declaration", () => {
    const result = check({
      "dup.md":
        "# Dup\n\n## Alpha (#same)\n\nOne.\n\n## Beta (#same)\n\nTwo.\n",
    })

    expect(codes(result)).toEqual(["duplicate-anchor"])
    expect(result.issues[0]!.position?.start.line).toBe(7)
  })

  it("reports an anchor marker that carries no id", () => {
    // `(#)` never becomes an anchor. It stays in the heading text and joins the
    // generated slug, so the heading gets an id nobody meant to write.
    const result = check({ "empty.md": "# Guide (#)\n\ntext\n" })

    expect(codes(result)).toEqual(["empty-anchor"])
  })

  it("accepts repeated headings, which hosts disambiguate the same way", () => {
    const result = check({
      "repeat.md": "# R\n\n## Over\n\nx\n\n## Over\n\ny\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("generated anchors that move", () => {
  it("warns when a link depends on a slugger suffix", () => {
    const result = check({
      "reference.md": "# R\n\n## Over\n\nx\n\n## Over\n\ny\n",
      "guide.md": "# Guide\n\n[unstable](reference.md#over-1)\n",
    })

    expect(codes(result)).toEqual(["unstable-anchor-link"])
    expect(result.issues[0]!.severity).toBe("warning")
  })

  it("stays quiet when the target heading declares its own anchor", () => {
    const result = check({
      "reference.md": "# R\n\n## Over\n\nx\n\n## Over (#second)\n\ny\n",
      "guide.md": "# Guide\n\n[stable](reference.md#second)\n",
    })

    expect(result.issues).toEqual([])
  })

  it("does not mistake an explicit anchor that ends in a number", () => {
    const result = check({
      "reference.md": "# R\n\n## Step (#step-2)\n\nx\n",
      "guide.md": "# Guide\n\n[explicit](reference.md#step-2)\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("options", () => {
  it("drops ignored codes from the result entirely", () => {
    const files = {
      "reference.md": "# R\n\n## Over\n\nx\n\n## Over\n\ny\n",
      "guide.md": "# Guide\n\n[unstable](reference.md#over-1)\n",
    }
    expect(codes(check(files))).toEqual(["unstable-anchor-link"])

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(docs, { recursive: true })
      fs.writeFileSync(path.join(docs, name), content)
    }
    const result = checkReferences(
      buildDocuments({ sourceRoot: docs, outDir: path.join(root, ".cudoc") }),
      { ignore: ["unstable-anchor-link"] },
    )

    expect(result.issues).toEqual([])
  })
})

describe("formatCheckResult", () => {
  it("says so plainly when nothing is wrong", () => {
    const text = formatCheckResult({
      issues: [],
      documentCount: 3,
      checkedReferences: 9,
    })

    expect(text).toBe("checked 9 references in 3 documents; no problems found")
  })

  it("groups by document and summarises the counts", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide\n\n[typo](reference.md#limit)\n",
    })
    const text = formatCheckResult(result)

    expect(text).toContain("guide.md")
    expect(text).toContain("missing-anchor")
    expect(text).toContain("available: #reference, #limits")
    expect(text.trim().endsWith("1 error in 1 of 2 documents")).toBe(true)
  })
})

describe("components a source file imports for itself", () => {
  const CHART = [
    'import Chart from "./chart.jsx"',
    'import { Legend as Key } from "./legend.jsx"',
    "",
    "# Widget (#widget)",
    "",
    "## Live (#live)",
    "",
    "<Chart points={3} />",
    "",
    "<Key />",
    "",
    "## Plain (#plain)",
    "",
    "Prose only.",
    "",
  ].join("\n")
  const embed = (spec: string, imports = "") =>
    `${imports}# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("records what a document imports", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(path.join(root, "docs/widget.mdx"), CHART)
    fs.writeFileSync(path.join(root, "docs/plain.mdx"), "# Plain\n")
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
    })
    expect(library.documents.find((d) => d.id === "widget")!.imports).toEqual([
      "Chart",
      "Key",
    ])
    expect(library.documents.find((d) => d.id === "plain")).not.toHaveProperty(
      "imports",
    )
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, ".cudoc/manifest.json"), "utf8"),
    )
    expect(
      manifest.documents.find((d: { id: string }) => d.id === "widget").imports,
    ).toEqual(["Chart", "Key"])
  })

  it("reports a copied component whose import stays behind", () => {
    const result = check({
      "widget.mdx": CHART,
      "guide.mdx": embed("sources: [widget.mdx#live]"),
    })

    expect(codes(result)).toEqual([
      "unportable-embed-component",
      "imported-embed-component",
    ])
    const imported = result.issues[1]!
    expect(imported.severity).toBe("error")
    expect(imported.message).toContain("<Chart>, <Key>")
    expect(imported.message).toContain("guide has no such import")
  })

  it("stays quiet when the embedding document imports the same names", () => {
    const result = check({
      "widget.mdx": CHART,
      "guide.mdx": embed(
        "sources: [widget.mdx#live]",
        'import Chart from "./chart.jsx"\nimport { Legend as Key } from "./legend.jsx"\n\n',
      ),
    })

    expect(codes(result)).toEqual(["unportable-embed-component"])
  })

  it("says which hosts can render a copied component", () => {
    const files = {
      "widget.mdx": CHART,
      "guide.mdx": embed("sources: [widget.mdx#plain]\nrender: section"),
      "page.mdx": embed("sources: [widget.mdx#live]"),
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true })
      fs.writeFileSync(path.join(root, "docs", name), content)
    }
    const message = (host: "next" | "html") =>
      checkReferences(
        buildDocuments({
          sourceRoot: path.join(root, "docs"),
          outDir: path.join(root, `.cudoc-${host}`),
          host,
        }),
      ).issues.find((issue) => issue.code === "unportable-embed-component")!
        .message
    expect(message("next")).toContain("The host renders them")
    expect(message("html")).toContain("Neither this host")
  })
})

describe("imports read from source", () => {
  it("finds top-level import statements and ignores code and prose", () => {
    const source = [
      'import Chart from "./chart.jsx"',
      "import {",
      "  Legend as Key,",
      "  Axis,",
      '} from "./legend.jsx"',
      'import "./side-effect.css"',
      "",
      "# Title",
      "",
      "import this sentence is prose, not a statement.",
      "",
      "```js",
      'import Ghost from "./ghost.js"',
      "```",
      "",
      "````md",
      "```js",
      'import Nested from "./nested.js"',
      "```",
      "````",
      "",
    ].join("\n")
    expect(importedNamesFromSource(source)).toEqual(["Chart", "Key", "Axis"])
    expect(importedNamesFromSource("# Plain\n")).toEqual([])
  })
})

describe("embed sources read the way the resolver reads them", () => {
  it.each([
    ["an escaped space the resolver does not decode", "../my%20doc.md"],
    ["a compiled .html link form", "../reference.html"],
    ["a path climbing out of the library", "../../reference.md"],
    ["a malformed percent-escape in the section", "../reference.md#li%zz"],
  ])("reports %s as the build would fail on it", (_, source) => {
    const result = check({
      "reference.md": REFERENCE,
      "my doc.md": "# Mine\n",
      "guide/start.md": `# Start\n\n\`\`\`cudoc-embed\nsources: [${source}]\n\`\`\`\n`,
    })

    expect(codes(result)).toEqual(["missing-embed-source"])
  })

  it("accepts the same sources written the way the resolver reads them", () => {
    const result = check({
      "reference.md": REFERENCE,
      "my doc.md": "# Mine\n",
      "guide/start.md":
        "# Start\n\n```cudoc-embed\nsources: [../my doc.md, ../reference.md#limits]\n```\n",
    })

    expect(result.issues).toEqual([])
  })

  it("accepts a percent-encoded section name, which the resolver decodes", () => {
    const result = check({
      "reference.md": "# Reference\n\n## 개요\n\nBody.\n",
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [reference.md#%EA%B0%9C%EC%9A%94]\n```\n",
    })

    expect(result.issues).toEqual([])
  })

  it("reports a selection that matches no section", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [reference.md]\nselect:\n  depth: 4\n```\n",
    })

    expect(codes(result)).toEqual(["missing-embed-anchor"])
    expect(result.issues[0]!.message).toBe("reference: no sections matched")
  })

  it("reports a select that excludes the section the source names", () => {
    // `#limits` exists, but `depth: 3` filters the depth-2 section out and the
    // build fails on the section it then cannot find; a checker that dropped
    // `select` beside a source anchor would pass this embed.
    const result = check({
      "reference.md": REFERENCE,
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [reference.md#limits]\nselect:\n  depth: 3\n```\n",
    })

    expect(codes(result)).toEqual(["missing-embed-anchor"])
    expect(result.issues[0]!.message).toBe("reference: missing section: limits")
  })
})

describe("embeds that copy themselves", () => {
  it("reports a cycle through copied sections, as the build would", () => {
    const result = check({
      "a.md": "# A\n\n```cudoc-embed\nsources: [b.md]\n```\n",
      "b.md": "# B\n\n```cudoc-embed\nsources: [a.md]\n```\n",
    })

    expect(codes(result)).toEqual(["cyclic-embed", "cyclic-embed"])
    expect(result.issues[0]!.message).toContain("b#* -> a#* -> b#*")
    expect(result.issues[0]!.position?.start.line).toBe(3)
  })

  it("stays quiet when the embed back sits outside the copied section", () => {
    const result = check({
      "a.md": "# A\n\n```cudoc-embed\nsources: [b.md#one]\n```\n",
      "b.md":
        "# B\n\n## One (#one)\n\nBody.\n\n## Two (#two)\n\n```cudoc-embed\nsources: [a.md]\n```\n",
    })

    expect(result.issues).toEqual([])
  })

  it("follows the copy a replace rule leaves, not the section as collected", () => {
    // `b.md#loop` embeds itself, which is b's own cycle. The rule in `a.md`
    // turns that fence into an ordinary code block in a's copy, so the
    // resolver never expands it there and a's embed finishes.
    const files = {
      "b.md":
        "# B\n\n## Loop (#loop)\n\n```cudoc-embed\nsources: [b.md#loop]\n```\n",
      "a.md":
        "# A\n\n```cudoc-embed\nsources: [b.md#loop]\nreplace:\n  - find: cudoc-embed\n    replace: text\n```\n",
    }
    const library = collected(files)
    expect(() =>
      resolveEmbed(
        library,
        {
          sources: ["b.md#loop"],
          replace: [{ find: "cudoc-embed", replace: "text" }],
        },
        { documentId: "a" },
      ),
    ).not.toThrow()

    const result = checkReferences(library)
    expect(
      result.issues.map((issue) => [issue.sourcePath, issue.code]),
    ).toEqual([["b.md", "cyclic-embed"]])
  })

  it("reports a cycle that only the replaced copy makes", () => {
    // The section embeds c; the rule points that nested embed back at a.
    const files = {
      "c.md": "# C\n\nPlain.\n",
      "b.md":
        "# B\n\n## Loop (#loop)\n\n```cudoc-embed\nsources: [c.md]\n```\n",
      "a.md":
        "# A\n\n```cudoc-embed\nsources: [b.md#loop]\nreplace:\n  - find: c.md\n    replace: a.md\n```\n",
    }
    const library = collected(files)
    expect(() =>
      resolveEmbed(
        library,
        {
          sources: ["b.md#loop"],
          replace: [{ find: "c.md", replace: "a.md" }],
        },
        { documentId: "a" },
      ),
    ).toThrow("cudoc: cyclic embed: b#loop -> a#* -> b#loop")

    const result = checkReferences(library)
    expect(
      result.issues.map((issue) => [issue.sourcePath, issue.code]),
    ).toEqual([["a.md", "cyclic-embed"]])
    expect(result.issues[0]!.message).toContain("b#loop -> a#* -> b#loop")
  })
})

describe("copies a replace rule rewrites", () => {
  const embed = (spec: string) =>
    `# Guide\n\n\`\`\`cudoc-embed\n${spec}\n\`\`\`\n`

  it("inspects components in the rewritten copy", () => {
    // Replacing a component with prose is how an author makes an embedded
    // section portable; the copy then carries no component to report.
    const result = check({
      "widget.mdx":
        "import Chart from './chart'\n\n# Widget (#widget)\n\n## Live (#live)\n\n<Chart />\n",
      "guide.md": embed(
        'sources: [widget.mdx#live]\nreplace:\n  - find: "<Chart />"\n    replace: "A chart of the week."',
      ),
    })

    expect(result.issues).toEqual([])
  })

  it("reads table cells from the rewritten copy", () => {
    // The rule removes the only paragraph, so the row the resolver builds
    // has no summary; the section as collected would have one.
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": embed(
        'sources: [reference.md#limits]\nreplace:\n  - find: "Body."\n    replace: ""\nrender:\n  type: table\n  columns:\n    - { header: Summary, value: summary }',
      ),
    })

    expect(codes(result)).toEqual(["empty-embed-cell"])
  })

  it("leaves out a copy it cannot build rather than reading the section as collected", () => {
    // A host compiler that accepts `{#id}` collected the library; `cudoc
    // check` loads it without one, and the standalone MDX compiler refuses
    // `{#id}`. Reading the section as collected would report the component
    // the rule removed, as a warning and as an import error.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
    roots.push(root)
    const docs = path.join(root, "docs")
    fs.mkdirSync(docs)
    fs.writeFileSync(
      path.join(docs, "widget.mdx"),
      "import Chart from './chart'\n\n# Widget {#widget}\n\n## Live {#live}\n\n<Chart />\n",
    )
    fs.writeFileSync(
      path.join(docs, "guide.md"),
      embed(
        'sources: [widget.mdx#live]\nreplace:\n  - find: "<Chart />"\n    replace: "A chart of the week."',
      ),
    )
    const outDir = path.join(root, ".cudoc")
    const collectedWithHost = buildDocuments({
      sourceRoot: docs,
      outDir,
      compilerId: "braces",
      compiler: (text, context) =>
        compileDocument(
          text.replace(/\{#([\w-]+)\}/g, "(#$1)"),
          context.options,
        ),
    })
    // With the host compiler the copy is exact, and it holds no component.
    const copy = resolveEmbed(
      collectedWithHost,
      {
        sources: ["widget.mdx#live"],
        replace: [{ find: "<Chart />", replace: "A chart of the week." }],
      },
      { documentId: "guide" },
    )
    expect(JSON.stringify(copy)).not.toContain('Chart"')
    expect(checkReferences(collectedWithHost).issues).toEqual([])

    expect(checkReferences(loadLibrary(outDir)).issues).toEqual([])
  })
})

describe("links the build and the checker must agree on", () => {
  it("reports a link with a malformed percent-escape instead of stopping", () => {
    const result = check({ "guide.md": "# Guide\n\n[x](./100%.md)\n" })

    expect(codes(result)).toEqual(["missing-document"])
  })

  it("does not resolve a link that climbs out of the library", () => {
    const result = check({
      "reference.md": REFERENCE,
      "guide.md": "# Guide\n\n[up](../../reference.md)\n",
    })

    expect(codes(result)).toEqual(["missing-document"])
  })

  it("accepts an id that raw HTML declares", () => {
    const result = check({
      "reference.md": '# Reference\n\n<a id="legacy"></a>\n\nOld name.\n',
      "guide.md": "# Guide\n\n[old](reference.md#legacy)\n",
    })

    expect(result.issues).toEqual([])
  })

  it("does not offer an id raw HTML declares as a section to embed", () => {
    // The resolver cuts sections at headings, so the embed would fail with a
    // missing section; the check says so, and lists the headings instead.
    const result = check({
      "reference.md":
        '# Reference\n\n<a id="legacy"></a>\n\n## Limits\n\nBody.\n',
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [reference.md#legacy]\n```\n",
    })

    expect(codes(result)).toEqual(["missing-embed-anchor"])
    expect(result.issues[0]!.message).toBe(
      "reference has no section #legacy to embed",
    )
    expect(result.issues[0]!.available).toEqual(["reference", "limits"])
  })

  it("accepts a heading anchor spelled percent-encoded", () => {
    const result = check({
      "reference.md": "# Reference\n\n## 개요\n\nBody.\n",
      "guide.md": "# Guide\n\n[개요](reference.md#%EA%B0%9C%EC%9A%94)\n",
    })

    expect(result.issues).toEqual([])
  })

  it("does not call a heading ending in a number a slugger suffix", () => {
    const result = check({
      "reference.md": "# Reference\n\n## Version 2\n\nBody.\n",
      "guide.md": "# Guide\n\n[v2](reference.md#version-2)\n",
    })

    expect(result.issues).toEqual([])
  })
})

describe("positions of embed errors", () => {
  it("skips a fence that only shows the syntax inside a longer fence", () => {
    const result = check({
      "guide.md":
        "# Guide\n\n````md\n```cudoc-embed\nsources: [x.md]\n```\n````\n\n```cudoc-embed\nsources: [missing.md\n```\n",
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    // The unclosed list on line 10 of the real fence, not line 5 of the shown one.
    expect(result.issues[0]!.position?.start.line).toBe(10)
  })

  it("does not read a fence inside an indented code block as an embed", () => {
    // Four spaces make a code block of their own, whose text shows the
    // syntax; the fence after it is the embed.
    const result = check({
      "guide.md":
        "# Guide\n\nAn example:\n\n    ```cudoc-embed\n    sources: [x.md]\n    ```\n\n```cudoc-embed\nsources: [missing.md\n```\n",
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    expect(result.issues[0]!.position?.start).toEqual({ line: 10, column: 21 })
  })

  it("counts an embed inside a callout, so the next one keeps its line", () => {
    // The embed in the quote is a block too; missing it would move every
    // later error onto the wrong fence.
    const result = check({
      "reference.md": "# Reference\n\n## Limits (#limits)\n\nBody.\n",
      "guide.md":
        "# Guide\n\n> [!NOTE]\n> ```cudoc-embed\n> sources: [reference.md#limits]\n> ```\n\n- A list item\n\n  ```cudoc-embed\n  sources: [missing.md\n  ```\n",
    })

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    expect(result.issues[0]!.position?.start).toEqual({ line: 11, column: 23 })
  })

  it("counts the column from the start of the line the error is on", () => {
    // Markdown lets a content line stand less indented than its fence, and a
    // quote's `>` needs no space after it.
    expect(
      check({
        "guide.md":
          "# Guide\n\n  ```cudoc-embed\nsources: [missing.md\n  ```\n",
      }).issues[0]!.position?.start,
    ).toEqual({ line: 4, column: 21 })
    expect(
      check({
        "guide.md":
          "# Guide\n\n> ```cudoc-embed\n>sources: [missing.md\n> ```\n",
      }).issues[0]!.position?.start,
    ).toEqual({ line: 4, column: 22 })
  })

  it("gives no position when the host reads other blocks as embeds than Markdown does", () => {
    // VitePress ends an HTML block of a component at the next blank line and
    // one of a self-closing component with its own line, so it reads the
    // second fence as an embed and the first as HTML, where Markdown reads
    // them the other way round. This compiler does the same.
    const text =
      '# Guide\n\n<Demo @ready="x">\n```cudoc-embed\nsources: [reference.md#limits]\n```\n\n<MyWidget />\n```cudoc-embed\nsources: [missing.md\n```\n'
    const docs = collectedWith({ "guide.md": text }, (source, { options }) =>
      compileDocument(
        source
          .replace(
            '<Demo @ready="x">\n```cudoc-embed',
            '<Demo @ready="x">\n```text',
          )
          .replace("<MyWidget />\n", "\n"),
        options,
      ),
    )
    const result = checkReferences(docs)

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    // One fence each, but not the same one: Markdown's is line 4, the valid
    // embed, and the host's error is on line 10.
    expect(result.issues[0]!.position).toBeUndefined()
  })

  it("finds the fences of a CRLF source line by line when Markdown refuses it", () => {
    // MDX refuses the stray brace, which this host's compiler drops.
    const docs = collectedWith(
      {
        "guide.mdx":
          "# Guide\r\n\r\nA stray { brace.\r\n\r\n```cudoc-embed title\r\nsources: [missing.md\r\n```\r\n",
      },
      (source, { options }) =>
        compileDocument(source.replace("{", ""), { ...options, format: "md" }),
    )
    const result = checkReferences(docs)

    expect(codes(result)).toEqual(["invalid-embed-spec"])
    expect(result.issues[0]!.position?.start).toEqual({ line: 6, column: 21 })
  })
})
