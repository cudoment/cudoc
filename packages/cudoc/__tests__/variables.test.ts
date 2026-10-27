/**
 * Document variables: `(=name)` replaced from one table of values everywhere
 * an author can write it, and a marker naming nothing left and reported.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import type { Root } from "mdast"
import {
  nodeText,
  normalizeDocument,
  replaceVariables,
  resolveVariables,
  type DocumentNode,
} from "../src/document.js"
import { buildDocuments } from "../src/node/library.js"
import { checkReferences } from "../src/node/check.js"

const variables = {
  "sdk.version": "2.8.3",
  host: "cdn.example.com",
  integrity: "sha384-abc",
}

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]

describe("replaceVariables", () => {
  it("replaces the names it knows and passes the others on", () => {
    const missing: string[] = []
    expect(
      replaceVariables(
        "v(=sdk.version) on (=host), (=nope) and ${KEEP} {x}",
        variables,
        (name) => missing.push(name),
      ),
    ).toBe("v2.8.3 on cdn.example.com, (=nope) and ${KEEP} {x}")
    expect(missing).toEqual(["nope"])
  })

  it("rejects names a marker cannot spell and values that are not text", () => {
    expect(() => resolveVariables({ "1x": "a" })).toThrow("variables must map")
    expect(() => resolveVariables({ ok: 1 })).toThrow("variables must map")
    expect(() => resolveVariables(["a"])).toThrow("variables must map")
    expect(resolveVariables(undefined)).toBeUndefined()
  })
})

describe("variables in a compiled document", () => {
  const source = [
    "# SDK (=sdk.version)",
    "",
    "Load `sdk.min.js` (=sdk.version) from [the CDN](https://(=host)/js/(=sdk.version)/sdk.min.js).",
    "",
    "![Logo (=sdk.version)](/img/(=sdk.version).png)",
    "",
    '```html title="v(=sdk.version)"',
    '<script src="https://(=host)/(=sdk.version).js" integrity="(=integrity)"></script>',
    "```",
    "",
    "Inline `(=sdk.version)`.",
    "",
    "```cudoc-embed",
    "sources: [other.md]",
    "# (=sdk.version) stays: an embed block is an instruction",
    "```",
    "",
  ].join("\n")

  it("replaces text, code, addresses and meta, and leaves embed blocks alone", () => {
    const { tree, diagnostics } = compileDocument(source, {
      format: "md",
      variables,
    })
    expect(diagnostics).toEqual([])
    const nodes = walk(tree as unknown as DocumentNode)
    const heading = nodes.find((node) => node.type === "heading")!
    expect(heading.data?.hProperties?.id).toBe("sdk-283")
    const link = nodes.find((node) => node.type === "link")!
    expect(link.url).toBe("https://cdn.example.com/js/2.8.3/sdk.min.js")
    const image = nodes.find((node) => node.type === "image")!
    expect([image.url, image.alt]).toEqual(["/img/2.8.3.png", "Logo 2.8.3"])
    const [code, embed] = nodes.filter((node) => node.type === "code")
    expect(code!.value).toBe(
      '<script src="https://cdn.example.com/2.8.3.js" integrity="sha384-abc"></script>',
    )
    expect(code!.meta).toBe('title="v2.8.3"')
    expect(embed!.value).toContain("(=sdk.version) stays")
    expect(
      nodes
        .filter((node) => node.type === "inlineCode")
        .map((node) => node.value),
    ).toEqual(["sdk.min.js", "2.8.3"])
  })

  it("replaces in raw HTML and in static component attributes", () => {
    const html = compileDocument(
      '<a href="https://(=host)/">CDN</a>\n\n<Sri tag="(=sdk.version)" integrity="(=integrity)" />\n',
      { format: "mdx", variables },
    )
    const nodes = walk(html.tree as unknown as DocumentNode)
    const sri = nodes.find((node) => node.name === "Sri")!
    expect(
      (sri.attributes as { name: string; value: string }[]).map((a) => [
        a.name,
        a.value,
      ]),
    ).toEqual([
      ["tag", "2.8.3"],
      ["integrity", "sha384-abc"],
    ])
    const link = nodes.find((node) => node.type === "link")!
    expect(link.url).toBe("https://cdn.example.com/")
    expect(
      renderDocument(
        compileDocument('<div title="(=host)">x</div>\n', {
          format: "md",
          variables,
        }).tree,
      ),
    ).toContain('title="cdn.example.com"')
  })

  it("replaces a component's attributes before normalization reads them", () => {
    // What normalization makes from an attribute, a callout's type, its
    // class and its default title, is made from the value.
    const options = {
      format: "mdx" as const,
      host: "nextra" as const,
      syntax: { callout: "host" as const },
      variables: { kind: "warning", label: "(=kind)" },
    }
    const { tree, diagnostics } = compileDocument(
      '<Callout type="(=kind)">Body</Callout>\n\n<Callout type="tip" title="(=label)">Body</Callout>\n',
      options,
    )
    const [warning, tip] = tree.children as unknown as DocumentNode[]
    expect(warning!.data?.cudoc).toMatchObject({
      kind: "callout",
      type: "warning",
    })
    expect(warning!.data?.hProperties).toEqual({
      className: ["cudoc-callout", "cudoc-callout-warning"],
      "data-callout": "warning",
    })
    expect(renderDocument(tree)).toContain(">WARNING<")
    // Replaced once: a value that spells a marker is the value.
    expect(tip!.data?.cudoc?.title).toBe("(=kind)")
    expect(diagnostics).toEqual([])

    const tabbed = compileDocument(
      '<Tabs>\n  <Tab label="(=label)">A</Tab>\n  <Tab label="Other" value="(=kind)">B</Tab>\n</Tabs>\n',
      {
        format: "mdx",
        syntax: { tabs: "host" },
        components: {
          Tabs: { kind: "tabs" },
          Tab: { kind: "tab", titleAttribute: "label" },
        },
        variables: options.variables,
      },
    )
    const group = tabbed.tree.children[0] as unknown as DocumentNode
    expect(
      group.children!.map((member) => [
        member.data?.cudoc?.title,
        member.data?.cudoc?.value,
      ]),
    ).toEqual([
      ["(=kind)", "kind"],
      ["Other", "warning"],
    ])

    // A JSON string expression is a static attribute too.
    const expressed = compileDocument(
      '<Callout type={"(=kind)"} title={"(=label)"}>Body</Callout>\n\n<Callout title={"(=missing)"}>Body</Callout>\n',
      options,
    )
    const [expressedWarning] = expressed.tree
      .children as unknown as DocumentNode[]
    expect(expressedWarning!.data?.cudoc).toMatchObject({
      type: "warning",
      title: "(=kind)",
    })
    expect(expressed.diagnostics.map((entry) => entry.message)).toEqual([
      "(=missing) names no variable; define missing in variables or write the text without the marker",
    ])
    const linked = compileDocument(
      '<Link href={"./(=page).md"}>Guide</Link> and <Sri tag={"(=page)"} />\n',
      {
        format: "mdx",
        host: "docs",
        syntax: { link: "host" },
        variables: { page: "intro" },
      },
    )
    const linkedNodes = walk(linked.tree as unknown as DocumentNode)
    expect(linkedNodes.find((node) => node.type === "link")!.url).toBe(
      "./intro.md",
    )
    const sri = linkedNodes.find((node) => node.name === "Sri")!
    expect(
      (sri.attributes as { value: { value: string } }[])[0]!.value.value,
    ).toBe('"intro"')

    // A list in a table cell is parsed again from the source, components
    // and all, and their attributes are replaced before they are read too.
    const listed = compileDocument(
      '| C |\n| --- |\n| - Item <Infobox type="(=kind)">Body</Infobox><br />- Other <Infobox type={"(=kind)"} title={"(=label)"}>Body</Infobox> |\n',
      {
        format: "mdx",
        host: "docs",
        syntax: { callout: "host" },
        variables: options.variables,
      },
    )
    expect(
      walk(listed.tree as unknown as DocumentNode)
        .filter((node) => node.data?.cudoc?.kind === "callout")
        .map((node) => [
          node.data!.cudoc!.type,
          node.data!.cudoc!.title,
          (node.data!.hProperties!.className as string[]).join(" "),
          nodeText(node.children![0]!),
        ]),
    ).toEqual([
      ["warning", "", "cudoc-callout cudoc-callout-warning", "WARNING"],
      ["warning", "(=kind)", "cudoc-callout cudoc-callout-warning", "(=kind)"],
    ])
    expect(listed.diagnostics).toEqual([])
    // A marker naming nothing there is reported once, where it is written.
    const unnamed = compileDocument(
      '| C |\n| --- |\n| - Item <Infobox type="(=missing)">Body</Infobox><br />- Other |\n',
      {
        format: "mdx",
        host: "docs",
        syntax: { callout: "host" },
        variables: {},
      },
    )
    expect(
      unnamed.diagnostics.map((entry) => [
        entry.code,
        entry.position?.start.line,
      ]),
    ).toEqual([["UNDEFINED_VARIABLE", 3]])

    // An Anchor's id and badge are attribute values, replaced once.
    const anchored = compileDocument(
      '## Heading <Anchor id="(=anchor)" badge="(=label)" />\n',
      {
        format: "mdx",
        host: "docs",
        syntax: { headingAnchor: "host", badge: "host" },
        variables: {
          anchor: "(=suffix)",
          suffix: "actual",
          label: "(=kind)",
          kind: "tip",
        },
      },
    )
    const heading = anchored.tree.children[0] as unknown as DocumentNode
    expect(heading.data?.hProperties?.id).toBe("(=suffix)")
    expect(
      nodeText(
        walk(heading).find((node) => node.data?.cudoc?.kind === "badge")!,
      ),
    ).toBe("(=kind)")
    expect(heading.data?.cudoc?.badge).toBe("(=kind)")

    const misspelled = compileDocument(
      '<Callout type="(=kidn)">Body</Callout>\n',
      options,
    )
    expect(misspelled.diagnostics.map((entry) => entry.message)).toEqual([
      "(=kidn) names no variable; define kidn in variables or write the text without the marker",
    ])
  })

  it("records the badge a host component shows on its heading", () => {
    const { tree, diagnostics } = compileDocument(
      '## Install <Badge>(=sdk.version)</Badge>\n\n## Remove <Anchor id="remove" badge="Old" />\n',
      {
        format: "mdx",
        host: "docusaurus",
        syntax: { headingAnchor: "host", badge: "host" },
        variables,
      },
    )
    expect(
      (tree.children as unknown as DocumentNode[]).map(
        (heading) => heading.data?.cudoc?.badge,
      ),
    ).toEqual(["2.8.3", "Old"])
    expect(diagnostics).toEqual([])
  })

  it("leaves the code of MDX expressions and imports as written", () => {
    const { tree, diagnostics } = compileDocument(
      'export const tag = "(=sdk.version)"\n\nVersion {"(=sdk.version)"} and (=sdk.version).\n\n{"(=nope)"}\n',
      { format: "mdx", variables },
    )
    const nodes = walk(tree as unknown as DocumentNode)
    expect(
      nodes
        .filter((node) => node.type.startsWith("mdx"))
        .map((node) => node.value),
    ).toEqual(['"(=sdk.version)"', '"(=nope)"'])
    expect(nodes.some((node) => node.value === " and 2.8.3.")).toBe(true)
    expect(diagnostics).toEqual([])
  })

  it("reports each marker that names no variable once per node, and keeps it", () => {
    const { tree, diagnostics } = compileDocument(
      "Uses (=sdk.versoin) and (=sdk.versoin).\n",
      { format: "md", variables },
    )
    expect(diagnostics.map((entry) => entry.code)).toEqual([
      "UNDEFINED_VARIABLE",
    ])
    expect(renderDocument(tree)).toContain("(=sdk.versoin)")
  })

  it("reports from the address an adapter replaced already, and replaces nothing in it again", () => {
    // A markdown-it adapter replaces a link's or image's address before the
    // host's link rules read it and keeps the one written in `data`.
    const node = (type: "link" | "image", url: string, written: string) => ({
      type,
      url,
      ...(type === "image" && { alt: "(=host)" }),
      children: type === "link" ? [{ type: "text", value: "(=host)" }] : [],
      data: {
        cudocWrittenAddress: written,
        hProperties: { [type === "link" ? "href" : "src"]: url },
      },
    })
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            node("link", "./(=host).html", "(=nested)(=nope)"),
            node("image", "./(=host).png", "(=nested)"),
          ],
        },
      ],
    } as unknown as Root
    const diagnostics = normalizeDocument(tree, "", {
      host: "vitepress",
      variables: { ...variables, nested: "(=host)" },
    })
    expect(diagnostics.map((entry) => entry.message)).toEqual([
      expect.stringMatching(/^\(=nope\) names no variable/),
    ])
    const [link, image] = walk(tree as unknown as DocumentNode).filter(
      (entry) => entry.type === "link" || entry.type === "image",
    )
    expect([link!.url, link!.data]).toEqual([
      "./(=host).html",
      { hProperties: { href: "./(=host).html" } },
    ])
    expect([image!.url, image!.alt, image!.data]).toEqual([
      "./(=host).png",
      "cdn.example.com",
      { hProperties: { src: "./(=host).png" } },
    ])
    expect(walk(link!).at(-1)!.value).toBe("cdn.example.com")
  })

  it("replaces nothing without the option", () => {
    const { tree, diagnostics } = compileDocument("(=sdk.version)\n", {
      format: "md",
    })
    expect(diagnostics).toEqual([])
    expect(renderDocument(tree)).toContain("(=sdk.version)")
  })
})

describe("undefined variables in the checker", () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
  })

  it("reports a marker the library still holds, with the nearest name", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-variables-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      "# Page\n\nVersion (=sdk.version), host (=sdk.versoin).\n",
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      variables,
    })
    const result = checkReferences(library)
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.suggestions,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([
      ["undefined-variable", "(=sdk.versoin)", ["(=sdk.version)"], 3, 30],
    ])
  })

  it("reports a marker in a tab's label, which normalization moved out of the meta", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-variables-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      '# Page\n\n```sh tab="SDK (=sdk.versoin)"\nnpm i sdk\n```\n\n```sh tab="CDN"\ncurl x\n```\n',
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      variables,
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start.line,
      ]),
    ).toEqual([["undefined-variable", "(=sdk.versoin)", 3]])
  })
})
