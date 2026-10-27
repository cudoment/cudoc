/**
 * Shared link references: a label defined once for every document, used as
 * `[text][label]`, `[label][]` or `[label]` in any of them.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import { presentDocument } from "../src/present.js"
import {
  normalizeDocument,
  normalizeLabel,
  resolveLinkReferences,
  type DocumentNode,
} from "../src/document.js"
import { buildDocuments } from "../src/node/library.js"
import { checkReferences } from "../src/node/check.js"

const linkReferences = {
  logo: "https://example.com/logo.png",
  straße: "https://example.com/street",
  "business-token": "../auth/common.md#business-token",
  Console: { url: "https://console.example.com/app", title: "App console" },
  cdn: "https://(=host)/sdk.js",
}

const links = (source: string, format: "md" | "mdx" = "md") => {
  const { tree } = compileDocument(source, {
    format,
    linkReferences,
    variables: { host: "cdn.example.com" },
  })
  const found: DocumentNode[] = []
  const walk = (node: DocumentNode) => {
    if (node.type === "link") found.push(node)
    node.children?.forEach(walk)
  }
  walk(tree as unknown as DocumentNode)
  return found.map((node) => ({
    url: node.url,
    title: (node as { title?: string }).title,
    text: (node.children ?? [])
      .map((child) => child.value ?? child.type)
      .join(""),
  }))
}

describe("shared link references", () => {
  it("links the full, collapsed and shortcut forms", () => {
    expect(
      links(
        "Get a [business token][business-token], open the [console][], or see [Console].\n",
      ),
    ).toEqual([
      {
        url: "../auth/common.md#business-token",
        title: undefined,
        text: "business token",
      },
      {
        url: "https://console.example.com/app",
        title: "App console",
        text: "console",
      },
      {
        url: "https://console.example.com/app",
        title: "App console",
        text: "Console",
      },
    ])
  })

  it("keeps formatting inside the link text and in MDX", () => {
    expect(links("A [**bold** token][business-token] here.\n", "mdx")).toEqual([
      {
        url: "../auth/common.md#business-token",
        title: undefined,
        text: "strong token",
      },
    ])
  })

  it("leaves a label nobody defined, a document's own definition and code alone", () => {
    const source =
      "[menu] > [path], [x][nowhere], `[console][]`.\n\n[Own][console]\n\n[console]: ./own.md\n"
    expect(links(source)).toEqual([])
    // The document's own definition stays the reference its parser made.
    const { tree } = compileDocument(source, { format: "md", linkReferences })
    expect(JSON.stringify(tree)).toContain('"type":"linkReference"')
    expect(JSON.stringify(tree)).toContain("[menu] > [path], [x][nowhere], ")
  })

  it("leaves brackets the source escapes as text, and links what follows them", () => {
    const source =
      "Write \\[Console\\], \\[a\\]\\[console\\] or &#91;Console&#93; to show the brackets.\n\n> Quoted \\[console\\]\n> and then [Console].\n\nAn escaped backslash \\\\[Console] still links.\n"
    expect(links(source).map((link) => link.text)).toEqual([
      "Console",
      "Console",
    ])
    const { tree } = compileDocument(source, { format: "md", linkReferences })
    expect(JSON.stringify(tree)).toContain(
      "Write [Console], [a][console] or [Console] to show the brackets.",
    )
    expect(JSON.stringify(tree)).not.toMatch(/[\uE000-\uE002]/)
  })

  it("leaves an escaped label as text in a cell list, which is read from its source again", () => {
    const source =
      "| Item | Details |\n| - | - |\n| x | - \\[Console\\]<br>- &#91;Console&#93;<br>- `\\[Console\\]`<br>- [Console] |\n"
    expect(links(source).map((link) => link.text)).toEqual(["Console"])
    const { tree } = compileDocument(source, { format: "md", linkReferences })
    const cell = JSON.stringify(tree)
    expect(cell).toContain('"value":"[Console]"')
    // Code keeps its backslashes, and no stand-in is left anywhere.
    expect(cell).toContain('"value":"\\\\[Console\\\\]"')
    expect(cell).not.toMatch(/[\uE000-\uE002]/)
  })

  it("makes a shared reference after a ! an image, as markdown-it does", () => {
    const { tree } = compileDocument("![Alt][logo] and [logo]\n", {
      format: "md",
      linkReferences: { logo: "https://example.com/logo.png" },
    })
    const paragraph = (tree.children[0] as unknown as DocumentNode).children!
    expect(
      paragraph.map((node) => [node.type, node.alt ?? node.value]),
    ).toEqual([
      ["image", "Alt"],
      ["text", " and "],
      ["link", undefined],
    ])
  })

  it("links after a ! the source escapes, and restores escapes in an image's alt", () => {
    for (const format of ["md", "mdx"] as const) {
      const { tree } = compileDocument(
        "\\![a][logo] &#33;[b][logo] ![c \\[d\\]][logo]\n",
        { format, linkReferences: { logo: "https://example.com/logo.png" } },
      )
      const paragraph = (tree.children[0] as unknown as DocumentNode).children!
      expect(
        paragraph.map((node) => [node.type, node.alt ?? node.value]),
      ).toEqual([
        ["text", "!"],
        ["link", undefined],
        ["text", " !"],
        ["link", undefined],
        ["text", " "],
        ["image", "c [d]"],
      ])
    }
  })

  it("matches a collapsed label as the source writes it", () => {
    // CommonMark matches the label written, `**bold**`, not the text shown.
    for (const format of ["md", "mdx"] as const) {
      const { tree } = compileDocument("[**bold**][] and [bold][]\n", {
        format,
        linkReferences: { bold: "/plain", "**bold**": "/formatted" },
      })
      const found: string[] = []
      const walk = (node: DocumentNode) => {
        if (node.type === "link") found.push(node.url!)
        node.children?.forEach(walk)
      }
      walk(tree as unknown as DocumentNode)
      expect(found).toEqual(["/formatted", "/plain"])
    }
  })

  it("matches a text label with an escape as the source writes it", () => {
    // `[a\\*b][]` names the label `a\\*b`, not the `a*b` it shows.
    for (const format of ["md", "mdx"] as const) {
      const { tree } = compileDocument(
        "[a\\*b][], [a\\*b] and [x &amp; y][]\n",
        {
          format,
          linkReferences: {
            "a\\*b": "/escaped",
            "a*b": "/plain",
            "x &amp; y": "/x",
          },
        },
      )
      const found: string[] = []
      const walk = (node: DocumentNode) => {
        if (node.type === "link") found.push(node.url!)
        node.children?.forEach(walk)
      }
      walk(tree as unknown as DocumentNode)
      expect(found).toEqual(["/escaped", "/escaped", "/x"])
    }
  })

  it("reads a full reference's label and an image's text as the page's own definitions would", () => {
    // `[text][a\\*b]` names `a\\*b`, and `![a [b]][x]` shows `a b`.
    const labels = {
      "a\\*b": "/escaped",
      "a*b": "/plain",
      "x &amp; y": "/entity",
      "x & y": "/decoded",
      b: "/b",
      "**bold**": "/bold",
      "_a_ b": "/ab",
      "`code`": "/code",
    }
    // A label the parser read formatting in spreads over several nodes.
    const text =
      "[1][a\\*b] [2][a*b] [3][x &amp; y] [4][x & y] ![a [b]][a\\*b] ![c *[b]*][b] [5][**bold**] ![6][**bold**] [7][_a_ b] [8][`code`] after\n"
    const own = Object.entries(labels)
      .map(([label, url]) => `[${label}]: ${url}`)
      .join("\n")
    const targets = (
      source: string,
      format: "md" | "mdx",
      shared?: Record<string, string>,
    ) => {
      const { tree } = compileDocument(source, {
        format,
        ...(shared ? { linkReferences: shared } : {}),
      })
      const defined = new Map<string, string>()
      const found: unknown[] = []
      const walk = (node: DocumentNode) => {
        const { identifier } = node as { identifier?: string }
        if (node.type === "definition") defined.set(identifier!, node.url!)
        if (node.type === "link" || node.type === "linkReference")
          found.push(node.url ?? identifier)
        if (node.type === "image" || node.type === "imageReference")
          found.push([node.url ?? identifier, node.alt])
        node.children?.forEach(walk)
      }
      walk(tree as unknown as DocumentNode)
      return found.map((entry) =>
        Array.isArray(entry)
          ? [defined.get(entry[0]) ?? entry[0], entry[1]]
          : (defined.get(entry as string) ?? entry),
      )
    }
    for (const format of ["md", "mdx"] as const) {
      const shared = targets(text, format, labels)
      expect(shared).toEqual(targets(`${text}\n${own}\n`, format))
      expect(shared).toEqual([
        "/escaped",
        "/plain",
        "/entity",
        "/decoded",
        ["/escaped", "a b"],
        ["/b", "c b"],
        "/bold",
        ["/bold", "6"],
        "/ab",
        "/code",
      ])
    }
    // A `[` after the text that makes no full or collapsed reference
    // leaves no shortcut either, and only a full reference may be empty.
    for (const format of ["md", "mdx"] as const)
      for (const page of [
        "[b][ tail",
        "![b][ tail",
        "[b][ ] and ![b][ ]",
        "[b][[a]] tail",
        "[][b] and ![][b] and [][] and []",
      ]) {
        const shared = targets(`${page}\n`, format, labels)
        expect(shared, page).toEqual(targets(`${page}\n\n${own}\n`, format))
      }
    // A badge beside a reference, and a bracket marked escaped before an
    // image's, leave the label read as written, in a cell too.
    const written = { "a\\*b": "/escaped", "a*b": "/plain", x: "/x" }
    const writtenOwn = Object.entries(written)
      .map(([label, url]) => `[${label}]: ${url}`)
      .join("\n")
    for (const format of ["md", "mdx"] as const)
      for (const page of [
        "[t][a\\*b] (@beta)",
        "# Title [t][a\\*b] (@beta)",
        "\\![![t][a\\*b]][x]",
        "&#33;[![t][a\\*b]][x]",
      ]) {
        const shared = targets(`${page}\n`, format, written)
        expect(shared, page).toEqual(
          targets(`${page}\n\n${writtenOwn}\n`, format),
        )
        expect(JSON.stringify(shared), page).toContain("/escaped")
        expect(
          JSON.stringify(
            targets(
              `| h |\n| - |\n| - ${page}${format === "mdx" ? "<br/>" : "<br>"}- two |\n`,
              format,
              written,
            ),
          ),
          page,
        ).toContain("/escaped")
      }
    // A label written across a badge, or after a heading's id marker,
    // which normalization cuts out, is read as written too.
    const marked = {
      "a (@beta)": "/badge",
      "a\\*b": "/escaped",
      "a*b": "/plain",
    }
    const markedOwn = Object.entries(marked)
      .map(([label, url]) => `[${label}]: ${url}`)
      .join("\n")
    for (const format of ["md", "mdx"] as const)
      for (const page of [
        "[t][a (@beta)] and ![t][a (@beta)]",
        "# Title (#a[b]) [t][a\\*b]",
      ]) {
        const shared = targets(`${page}\n`, format, marked)
        expect(shared, page).toEqual(
          targets(`${page}\n\n${markedOwn}\n`, format),
        )
        expect(JSON.stringify(shared), page).not.toContain("/plain")
        expect(shared.length, page).toBeGreaterThan(0)
      }
    // An image the parser made reads its text against the source; an
    // autolink is no link of brackets, so the brackets around it link;
    // labels match on white space as micromark does; a NUL reads as U+FFFD.
    const parsed = {
      b: "/b",
      x: "/x",
      i: "/i",
      r: "/r",
      "a b": "/ab",
      "b c": "/bc",
    }
    const parsedOwn = Object.entries(parsed)
      .map(([label, url]) => `[${label}]: ${url}`)
      .join("\n")
    for (const format of ["md", "mdx"] as const)
      for (const page of [
        "![a [b]](img.png)",
        "[![a [b][b]](img.png)][x]",
        // Code, a link the parser made and lines in a block quote, in the
        // text of an image the parser made.
        "![`[r]`](img.png) and [![`[r]`](img.png)][r]",
        "[![a [b](u)](img.png)][r]",
        "> ![a [b\n> c]](img.png)",
        "![a `]` [b]](img.png)",
        "[a\u00A0b] and [a b]",
        "x\u0000 \\[b]",
        ...(format === "md"
          ? ["[![<https://example.com>][i]][x]", "[x <https://a.b>][r]"]
          : []),
      ])
        expect(targets(`${page}\n`, format, parsed), page).toEqual(
          targets(`${page}\n\n${parsedOwn}\n`, format),
        )
    // An image made of the document's own definition reads its text too.
    for (const format of ["md", "mdx"] as const) {
      const page =
        "![a [r]][own] and [![a [r]][own]][r] and ![x [own]](img.png)\n\n[own]: /image\n"
      expect(targets(page, format, parsed)).toEqual(
        targets(`${page}\n${parsedOwn}\n`, format),
      )
    }
    // A private-use character the author wrote stays as written.
    for (const format of ["md", "mdx"] as const)
      expect(
        renderDocument(
          compileDocument("&#xE000; \uE001 &#57346; \\[b] [b]\n", {
            format,
            linkReferences: { b: "/b" },
          }).tree,
        ),
      ).toBe('<p>\uE000 \uE001 \uE002 [b] <a href="/b">b</a></p>')
    // What the parser made of the text around a shared reference: a label
    // over the lines of a block quote, formatting in a shortcut's text, a
    // link the parser made in an image's text, an image in an image's
    // text, brackets the parser read into emphasis, and references nested
    // deeper, whose labels are read as written too.
    const around = {
      "business token": "/t",
      "*foo* bar": "/u",
      "`useState`": "/s",
      "`code`": "/c",
      "a\\*b": "/esc",
      a: "/a",
      b: "/b",
      i: "/i.png",
      x: "/x",
    }
    const aroundOwn = Object.entries(around)
      .map(([label, url]) => `[${label}]: ${url}`)
      .join("\n")
    for (const format of ["md", "mdx"] as const)
      for (const page of [
        "> See the [token][business\n> token] and [business\n> token].",
        "> - [token][business\n>   token]",
        "[*foo* bar] and [`useState`] and [*foo* bar][]",
        "![x [b](u)][a]",
        "[![x [b]][i]][a]",
        "![a ![b][i]][i]",
        "[a *b]* c][x]",
        "[x [y][`code`]][a] and [see ![x][a\\*b]][a]",
      ])
        expect(targets(`${page}\n`, format, around), page).toEqual(
          targets(`${page}\n\n${aroundOwn}\n`, format),
        )
    // Raw HTML, which `.md` reads, in a label.
    const html = "[x][<em>x</em>] [y][a <b>]\n"
    const tags = { "<em>x</em>": "/em", "a <b>": "/b" }
    const defined = "\n[<em>x</em>]: /em\n[a <b>]: /b\n"
    expect(targets(html, "md", tags)).toEqual(
      targets(`${html}${defined}`, "md"),
    )
    expect(targets(html, "md", tags)).toEqual(["/em", "/b"])
  })

  it("makes a shared image in a link's text, and in a shared link's", () => {
    // CommonMark resolves the inner brackets first, so the image is made
    // whether the link around it is written or shared.
    for (const format of ["md", "mdx"] as const) {
      const { tree } = compileDocument(
        "[![Logo][logo]](https://example.com) [![Alt][logo]][console] [![Lost][logo]][nowhere]\n",
        { format, linkReferences },
      )
      const shape = (node: DocumentNode): unknown =>
        node.type === "text"
          ? node.value
          : [
              node.type,
              node.url ?? "",
              ...(node.type === "image"
                ? [node.alt]
                : (node.children ?? []).map(shape)),
            ]
      expect(
        (tree.children[0] as unknown as DocumentNode).children!.map(shape),
      ).toEqual([
        [
          "link",
          "https://example.com",
          ["image", "https://example.com/logo.png", "Logo"],
        ],
        " ",
        [
          "link",
          "https://console.example.com/app",
          ["image", "https://example.com/logo.png", "Alt"],
        ],
        " [",
        ["image", "https://example.com/logo.png", "Lost"],
        "][nowhere]",
      ])
    }
  })

  it("leaves a shared link's brackets as text when a link forms inside them", () => {
    // The same text with the page's own definitions is what the parser,
    // following CommonMark, makes of it, as references to them.
    const urls: Record<string, string> = { a: "/a", b: "/b" }
    const shape = (node: DocumentNode): unknown =>
      node.type === "text"
        ? node.value
        : [
            node.type.replace("Reference", ""),
            node.url ?? urls[(node as { identifier?: string }).identifier!],
            ...(node.type.startsWith("image")
              ? [node.alt]
              : (node.children ?? []).map(shape)),
          ]
    const paragraph = (source: string, format: "md" | "mdx") =>
      (
        compileDocument(source, {
          format,
          linkReferences: urls,
        }).tree.children[0] as unknown as DocumentNode
      ).children!.map(shape)
    for (const format of ["md", "mdx"] as const)
      for (const text of [
        "[a [b]][a]",
        "[a *[b]*][a]",
        "[a [b] c][a]",
        "[a [b][a]][a]",
        "[a [nobody]][a]",
        "[![x][b]][a]",
      ])
        expect(paragraph(`${text}\n`, format), text).toEqual(
          paragraph(`${text}\n\n[a]: /a\n[b]: /b\n`, format),
        )
    expect(paragraph("[a [b]][a]\n", "md")).toEqual([
      "[a ",
      ["link", "/b", "b"],
      "]",
      ["link", "/a", "a"],
    ])
  })

  it("reads a reference where normalization rebuilt or cut the text", () => {
    const html = (
      source: string,
      linkReferences: Record<string, string> = {
        console: "/c",
        r: "/r",
        x: "/x",
      },
      format: "md" | "mdx" = "md",
    ) =>
      renderDocument(compileDocument(source, { format, linkReferences }).tree)
    // Each piece of a cell's list is read against its own text, so its
    // labels are matched as written there, and text it leaves is not read
    // again against the document.
    const written = { "a\\*b": "/escaped", "a*b": "/plain" }
    for (const [cell, format] of [
      ["- [t][a\\*b]<br>- two", "md"],
      ["- [t][a\\*b]<br/>- two", "mdx"],
    ] as const)
      expect(html(`| h |\n| - |\n| ${cell} |\n`, written, format)).toContain(
        '<li><a href="/escaped">t</a></li>',
      )
    expect(
      html("| h |\n| - |\n| - [t][x &amp; y]<br>- two |\n", {
        "x &amp; y": "/entity",
        "x & y": "/decoded",
      }),
    ).toContain('<li><a href="/entity">t</a></li>')
    expect(
      html("| h |\n| - |\n| - [t][a\\*b]<br>- two |\n", { "a*b": "/plain" }),
    ).toContain("<li>[t][a*b]</li>")
    // A piece is parsed without the document's definitions, which a
    // shared label never overrides.
    for (const [lineBreak, format] of [
      ["<br>", "md"],
      ["<br/>", "mdx"],
    ] as const) {
      const page = html(
        `[a]\n\n| h |\n| - |\n| - [a]${lineBreak}- [b] |\n\n[a]: /own\n`,
        { a: "/shared", b: "/b" },
        format,
      )
      expect(page).toContain('<a href="/own">a</a>')
      expect(page).toContain("<li>[a]</li>")
      expect(page).toContain('<li><a href="/b">b</a></li>')
      expect(page).not.toContain("/shared")
    }
    // The page's definitions are left out by their labels as written, an
    // escape in one kept.
    for (const [lineBreak, format] of [
      ["<br>", "md"],
      ["<br/>", "mdx"],
    ] as const)
      expect(
        html(
          `| H |\n| - |\n| - [a\\*b]${lineBreak}- two |\n\n[a\\*b]: /own\n`,
          { "a\\*b": "/shared" },
          format,
        ),
      ).not.toContain("/shared")
    // A piece is read as the document's own text is: what the parser
    // takes as an address or a title stays as written, a label too, and
    // its badges are split before its references are resolved.
    const cell = (text: string) => `| h |\n| - |\n| ${text} |\n`
    expect(
      html(cell("- [t](https://example.com/a\\!b)<br>- two"), { a: "/a" }),
    ).toContain('<a href="https://example.com/a!b">t</a>')
    expect(
      html(cell('- ![i](/a\\[b\\].png "t\\!")<br>- two'), { a: "/a" }),
    ).toContain('<img src="/a%5Bb%5D.png" alt="i" title="t!">')
    expect(
      html(cell("- [t][a\\!b]<br>- [u][a&#33;b]"), {
        "a\\!b": "/escaped",
        "a&#33;b": "/reference",
      }),
    ).toContain(
      '<li><a href="/escaped">t</a></li>\n<li><a href="/reference">u</a></li>',
    )
    const badged = "[text (@beta)][a] and ![x (@beta)][a]"
    const inCell = html(cell(`- ${badged}<br>- two`), { a: "/a" })
    for (const part of [
      '<a href="/a">text <span class="cudoc-badge">beta</span></a>',
      '<img src="/a" alt="x beta">',
    ]) {
      expect(html(`${badged}\n`, { a: "/a" })).toContain(part)
      expect(inCell).toContain(part)
    }
    // A number decodes as micromark decodes it, U+FFFD for a control
    // character, a surrogate or a noncharacter.
    for (const title of ["&#128;", "&#xD800; t"])
      expect(html(`> [!NOTE] ${title}\n> \\[x]\n`)).toContain("<p>[x]</p>")
    expect(html("> [!TAB] &#xFDD0; T\n> \\[x]\n")).toContain("<p>[x]</p>")
    // A reference that decodes to two characters still lines up.
    expect(html("> [!NOTE] &fjlig;\n> \\[x]\n")).toContain("<p>[x]</p>")
    expect(html("> [!TAB] &NotEqualTilde; T\n> \\[x]\n")).toContain(
      "<p>[x]</p>",
    )
    // What starts a label's later lines counts toward no limit.
    const halves = ["a".repeat(498), "b".repeat(499)]
    expect(
      html(`> [t][${halves.join("\n> ")}]\n`, {
        [halves.join(" ")]: "/long",
      }),
    ).toContain('<a href="/long">t</a>')
    // A cell's list is parsed from the cell's text alone, so what it
    // records is no place in the document.
    expect(
      html(
        "[q][r] see the table.\n\n| h |\n| - |\n| - [t][console]<br>- two |\n",
      ),
    ).toContain('<li><a href="/c">t</a></li>')
    // A callout's text after its marker keeps its place, so an escaped
    // bracket there is still text.
    expect(html("> [!NOTE] Title [x]\n> \\[Console] is escaped.\n")).toContain(
      "<p>[Console] is escaped.</p>",
    )
    expect(html("> [!NOTE] \\[x] first\n> Body.\n")).toContain("[x] first")
    // And a label there is read from where it is written.
    expect(html("> [!NOTE] [x] first\n> Body.\n")).toContain(
      '<a href="/x">x</a> first',
    )
    // Text nested many levels deep is resolved once per level, where it
    // would take seconds resolved again at every level.
    let nested = "x"
    for (let level = 0; level < 24; level++) nested = `[${nested}][r]`
    const started = performance.now()
    expect(html(`${nested}\n`)).toContain('<a href="/r">x</a>')
    expect(performance.now() - started).toBeLessThan(1000)
    // A bracket the parser read into emphasis does not close the text.
    expect(html("[a *b]* c][x]\n")).toContain(
      '<p>[a <em>b]</em> c]<a href="/x">x</a></p>',
    )
  })

  it("stores a heading's text as it would without shared references", () => {
    const heading = (
      source: string,
      references?: Record<string, string>,
      options: Parameters<typeof compileDocument>[1] = {},
    ) => {
      const node = (
        compileDocument(source, { ...options, linkReferences: references }).tree
          .children as DocumentNode[]
      ).find((child) => child.type === "heading")!
      return {
        children: node.children!.map(({ type, value }) => ({ type, value })),
        badge: node.data?.cudoc?.badge,
      }
    }
    // The text an id marker was cut out of is one again, its end trimmed,
    // and a badge keeps text on either side, empty where nothing is written.
    for (const references of [undefined, { x: "/x" }]) {
      expect(
        heading("## Make a request (#request) (@New)\n", references),
      ).toEqual({
        children: [
          { type: "text", value: "Make a request  " },
          { type: "strong", value: undefined },
          { type: "text", value: "" },
        ],
        badge: "New",
      })
      for (const end of ["&#32;", "&#9;", "&nbsp;"])
        expect(heading(`# A (#a)${end}\n`, references).children).toEqual([
          { type: "text", value: "A" },
        ])
      // Text the parser left apart, around an id comment taken out, stays so.
      expect(
        heading("## A (#a) B {/* #a */} C\n", references, {
          format: "mdx",
          host: "docusaurus",
          syntax: { headingAnchor: "both" },
        }).children,
      ).toEqual([
        { type: "text", value: "A  B " },
        { type: "text", value: " C" },
      ])
      // An unresolved label leaves those apart too, and a resolved one keeps
      // them as the page's own definition would.
      const mdx = {
        format: "mdx",
        host: "docusaurus",
        syntax: { headingAnchor: "both" },
      } as const
      expect(
        heading("## A (#a) B {/* #a */} C [z]\n", references, mdx).children,
      ).toEqual([
        { type: "text", value: "A  B " },
        { type: "text", value: " C [z]" },
      ])
      expect(
        heading(
          "## A (#a) B {/* #a */} C [x]\n",
          { x: "/x" },
          mdx,
        ).children.map(({ value }) => value),
      ).toEqual(
        heading(
          "## A (#a) B {/* #a */} C [x]\n\n[x]: /x\n",
          undefined,
          mdx,
        ).children.map(({ value }) => value),
      )
      // A badge's escaped brackets are put back in what the heading records.
      for (const badge of ["\\[new\\]", "&#91;new&#93;"])
        expect(heading(`# Title (@${badge})\n`, references).badge).toBe("[new]")
    }
    // The labels are read across the pieces first.
    expect(heading("# A (#id) B [x]\n", { x: "/x" }).children).toEqual([
      { type: "text", value: "A  B " },
      { type: "link", value: undefined },
    ])
  })

  it("leaves an image as the parser made it where its text does not read again so", () => {
    const alts = (
      source: string,
      references?: Record<string, string>,
      format: "md" | "mdx" = "md",
    ) => {
      const found: unknown[] = []
      const visit = (node: DocumentNode) => {
        if (node.type === "image") found.push(node.alt)
        node.children?.forEach(visit)
      }
      visit(
        compileDocument(source, { format, linkReferences: references })
          .tree as unknown as DocumentNode,
      )
      return found
    }
    const unused = { zzz: "/z" }
    // What MDX reads beyond brackets may end inside the description.
    for (const source of [
      '![[x] {"]"} y](i)\n',
      '![[x] <span title="]">y</span>](i)\n',
    ])
      expect(alts(source, unused, "mdx"), source).toEqual(
        alts(source, undefined, "mdx"),
      )
    // A description whose last line could start a block, whose end is white
    // space, whose later lines are indented or whose code holds emphasis
    // marks reads as the page's own definition would read it.
    for (const source of [
      "![a [b]\n=](i)\n",
      "![a [b]\n-](i)\n",
      "![a [b]\n#](i)\n",
      "![a [b]\n***](i)\n",
      "![a | [b]\n-|-](i)\n",
      "![a\n    - [b]](i)\n",
      "![a\n    > [b]](i)\n",
      "![[b] `` `a`** `c`**d ``](i)\n",
      "![a [b] ](i)\n",
    ]) {
      expect(alts(source, unused), source).toEqual(alts(source))
      expect(alts(source, { b: "/b" }), source).toEqual(
        alts(`${source}\n[b]: /b\n`),
      )
    }
    // One that would read otherwise again, a footnote, a table's `\|` or an
    // autolink holding a `]`, keeps the parser's alt.
    for (const source of [
      "![see [^n]](i)\n\n[^n]: note\n",
      "| h |\n| - |\n| ![`` `a\\|b` `` [b]](i) |\n",
      "![[b] <http://y]> z](i)\n",
      "![a [q] ](i)\n",
    ])
      expect(alts(source, { ...unused, b: "/b" }), source).toEqual(alts(source))
    // The definitions a description names are found without the block
    // quote's markers on its later lines.
    for (const format of ["md", "mdx"] as const) {
      const quoted = "> ![[a\n> b] [r]](i)\n\n[a b]: /ab\n"
      expect(alts(quoted, { r: "/r" }, format)).toEqual(["a\nb r"])
      expect(alts(`${quoted}[r]: /r\n`, undefined, format)).toEqual(["a\nb r"])
    }
    // Only a definition's label counts there, so its address and title
    // are not written again, a line ending decoded in them included.
    for (const format of ["md", "mdx"] as const)
      for (const own of [
        "[own]: </a&#10;b>",
        "[own]: </a&#13;b>",
        '[own]: /a "line&#10;&#10;title"',
      ]) {
        const page = `![[own] [r]](i)\n\n${own}\n`
        expect(alts(page, { r: "/r" }, format), page).toEqual(["own r"])
        expect(alts(`${page}[r]: /r\n`, undefined, format), page).toEqual([
          "own r",
        ])
      }
    // A page's definition is written again under its label as written, the
    // escape or the reference it holds kept.
    for (const format of ["md", "mdx"] as const)
      for (const label of ["a\\*b", "a&amp;b"]) {
        const page = `![[${label}] [r]](i)\n\n[${label}]: /a\n`
        expect(alts(page, { r: "/r" }, format), page).toEqual(
          alts(`${page}[r]: /r\n`, undefined, format),
        )
        expect(alts(page, { r: "/r" }, format), page).not.toContain(
          expect.stringContaining("[r]"),
        )
      }
    // A cell's piece reads its images without the page's definitions too.
    const cell = "| h |\n| - |\n| - ![a [own]](i)<br>- [own] |\n\n[own]: /o\n"
    expect(alts(cell, unused)).toEqual(["a [own]"])
    // so a shared label beside one the page defines resolves there.
    expect(
      alts("| h |\n| - |\n| - ![a [own] [s]](i)<br>- two |\n\n[own]: /o\n", {
        s: "/s",
      }),
    ).toEqual(["a [own] s"])
  })

  it("reads images again in time however many definitions or levels", () => {
    const definitions = Array.from(
      { length: 1000 },
      (_, i) => `[d${i}]: /d${i}`,
    ).join("\n")
    const images = Array.from(
      { length: 200 },
      (_, i) => `![a [b${i}] c](i${i})`,
    ).join("\n\n")
    let started = performance.now()
    compileDocument(`${images}\n\n${definitions}\n`, {
      linkReferences: { zzz: "/z" },
    })
    expect(performance.now() - started).toBeLessThan(1500)
    let nested = "x"
    for (let level = 0; level < 400; level++) nested = `![${nested} [r]](i)`
    started = performance.now()
    compileDocument(`${nested}\n`, { linkReferences: { r: "/r" } })
    expect(performance.now() - started).toBeLessThan(3000)
    // A few levels are read all the way in.
    nested = "x"
    for (let level = 0; level < 3; level++) nested = `![${nested} [r]](i)`
    const alt = (source: string, references?: Record<string, string>) =>
      (
        compileDocument(source, { linkReferences: references }).tree
          .children[0] as DocumentNode
      ).children![0]!.alt
    expect(alt(`${nested}\n`, { r: "/r" })).toBe(alt(`${nested}\n\n[r]: /r\n`))
    // An image reads as deep as it stands, wherever the same text stood
    // before.
    const core = "![![[r]](i)](i)"
    let deep = core
    for (let level = 0; level < 3; level++) deep = `![${deep}](i)`
    const alts = (source: string) =>
      (
        compileDocument(source, { linkReferences: { r: "/r" } }).tree
          .children as DocumentNode[]
      ).map((paragraph) => paragraph.children![0]!.alt)
    expect(alts(`${deep}\n\n${core}\n`)).toEqual(["[r]", "r"])
    expect(alts(`${core}\n\n${deep}\n`)).toEqual(["r", "[r]"])
  })

  it("reads a label's later lines without the quote markers around it only", () => {
    const targets = (source: string, references?: Record<string, string>) => {
      const found: unknown[] = []
      const visit = (node: DocumentNode) => {
        if (node.type === "link") found.push(node.url)
        if (node.type === "linkReference")
          found.push(references ? undefined : `#${node.identifier}`)
        node.children?.forEach(visit)
      }
      visit(
        compileDocument(source, { linkReferences: references })
          .tree as unknown as DocumentNode,
      )
      return found
    }
    const shared = { "a b": "/ab", "a > b": "/agb" }
    const own = "\n[a b]: /ab\n[a > b]: /agb\n"
    for (const [source, url] of [
      ["[a\n    > b][]\n", "/agb"],
      ["[t][a\n    > b]\n", "/agb"],
      ["> [a\n> b][]\n", "/ab"],
      ["> > [t][a\n> > b]\n", "/ab"],
      ["> [a\n>     > b][]\n", "/agb"],
      ["- > [t][a\n  > b]\n", "/ab"],
    ]) {
      expect(targets(source, shared), source).toEqual([url])
      expect(targets(`${source}${own}`), source).toEqual([
        `#${url === "/ab" ? "a b" : "a > b"}`,
      ])
    }
  })

  it("makes no shortcut of brackets a link the parser made follows", () => {
    for (const source of [
      "See [b][the docs](https://e.com).\n",
      "See ![b][the docs](u).\n",
    ]) {
      const urls = (references?: Record<string, string>, own = "") => {
        const found: unknown[] = []
        const visit = (node: DocumentNode) => {
          if (node.type === "link" || node.type === "image")
            found.push(node.url)
          if (node.type === "linkReference" || node.type === "imageReference")
            found.push(`#${node.identifier}`)
          node.children?.forEach(visit)
        }
        visit(
          compileDocument(`${source}${own}`, { linkReferences: references })
            .tree as unknown as DocumentNode,
        )
        return found
      }
      expect(urls({ b: "/b" }), source).toEqual(urls(undefined, "\n[b]: /b\n"))
      expect(urls({ b: "/b" }), source).not.toContain("/b")
    }
  })

  it("keeps every character a page holds through unused shared labels", () => {
    // A stand-in for an escaped bracket is none a component's attribute
    // gives the text either.
    const stored = (source: string, references?: Record<string, string>) =>
      JSON.stringify(
        compileDocument(source, {
          format: "mdx",
          host: "docs",
          syntax: { headingAnchor: "host" },
          linkReferences: references,
        }).tree,
        (key, value) => (key === "position" ? undefined : value),
      )
    for (const source of [
      '# Title <Anchor id="a" badge="&#xE000;" />\n',
      '<Infobox title="&#xE000;">body</Infobox>\n',
    ]) {
      expect(stored(source, { unused: "/u" }), source).toBe(stored(source))
      expect(stored(source, { unused: "/u" }), source).toContain("\uE000")
    }
  })

  it("leaves a page's shared references unresolved where no stand-ins are free", () => {
    // A page holding nearly every private-use character leaves fewer than
    // three to mark its escaped brackets with.
    const used = Array.from({ length: 0x1900 }, (_, i) =>
      String.fromCharCode(0xe000 + i),
    ).join("")
    const source = `~~~text\n${used}\n~~~\n\n\\[literal\\] [x]\n`
    for (const format of ["md", "mdx"] as const) {
      const last = (references?: Record<string, string>) =>
        (
          compileDocument(source, {
            format,
            linkReferences: references,
          }).tree.children.at(-1) as DocumentNode
        ).children!.map(({ type, value }) => ({ type, value }))
      expect(last({ x: "/x" })).toEqual(last())
      expect(last()).toEqual([{ type: "text", value: "[literal] [x]" }])
    }
  })

  it("resolves the labels in a tab's or a callout's title as its text", () => {
    // The title a tab shows and the one a callout records are fixed early,
    // from the title's text with its shared references resolved.
    for (const format of ["md", "mdx"] as const)
      for (const [source, options] of [
        ["> [!TAB] Read [guide][r]\n> body\n", {}],
        ["> [!TAB] \\[x] [guide][r]\n> body\n", {}],
        ["> [!NOTE] Read [guide][r]\n> body\n", {}],
        // A label across lines, its later lines starting with the quote's
        // `>`, the outer quote's too.
        ["> [!TAB] *[x][a\n> b]*\n> body\n", {}],
        ["> [!NOTE] *[x][a\n> b]*\n> body\n", {}],
        ["> > [!TAB] *[x][a\n> > b]*\n> > body\n", {}],
        [
          ":::note[Read [guide][r]]\nbody\n:::\n",
          { host: "docusaurus", syntax: { callout: "host" } },
        ],
      ] as const) {
        const shown = (page: string, references?: Record<string, string>) => {
          const { tree } = compileDocument(page, {
            format,
            linkReferences: references,
            ...options,
          })
          const recorded = (tree.children[0] as DocumentNode).data?.cudoc
          presentDocument(tree, { host: "markdown", format })
          return { recorded, html: renderDocument(tree) }
        }
        const shared = shown(source, { r: "/r", "a b": "/ab" })
        expect(shared, source).toEqual(
          shown(`${source}\n[r]: /r\n[a b]: /ab\n`),
        )
        expect(JSON.stringify(shared), source).not.toMatch(/\[guide\]|\[x\]\[a/)
      }
  })

  it("leaves siblings as they were where no shared label links", () => {
    const point = (offset: number) => ({ line: 1, column: offset + 1, offset })
    const text = (value: string, start: number) => ({
      type: "text",
      value,
      position: { start: point(start), end: point(start + value.length) },
    })
    // Text the source continues, which a parser would have left as one.
    const paragraph = {
      type: "paragraph",
      children: [text("a [", 0), text("z]", 3)],
      position: { start: point(0), end: point(5) },
    }
    normalizeDocument(
      { type: "root", children: [paragraph] } as never,
      "a [z]",
      {
        linkReferences: { x: "/x" },
      },
    )
    expect(paragraph.children.map(({ value }) => value)).toEqual(["a [", "z]"])
  })

  it("protects an escape past a backtick that a longer run does not close", () => {
    // One backtick opens no code span before a run of two.
    const source = "| H |\n| - |\n| - ` \\[Console\\] ``<br>- [Console] |\n"
    expect(links(source).map((link) => link.text)).toEqual(["Console"])
  })

  it("reads escapes past another character reference and beside a badge", () => {
    expect(
      links(
        "## Head \\[Console\\] (@beta)\n\na &lt; b &copy; \\[Console\\] c\n\nWrite \\[Console\\] here (@new), then [Console].\n",
      ).map((link) => link.text),
    ).toEqual(["Console"])
  })

  it("replaces a variable in a shared address", () => {
    expect(links("Load [the SDK][cdn].\n")[0]!.url).toBe(
      "https://cdn.example.com/sdk.js",
    )
  })

  it("matches labels as CommonMark does and validates the table", () => {
    expect(normalizeLabel("  Business   TOKEN ")).toBe("BUSINESS TOKEN")
    // Folded as the parsers fold it: ß upper-cases to SS.
    expect(normalizeLabel("straße")).toBe(normalizeLabel("STRASSE"))
    expect(
      links("[STRASSE] and [the street][Straße]").map((link) => link.url),
    ).toEqual(["https://example.com/street", "https://example.com/street"])
    expect(() => resolveLinkReferences({ "a]": "x" })).toThrow("linkReferences")
    expect(() => resolveLinkReferences({ a: 1 })).toThrow("linkReferences")
    expect(() => resolveLinkReferences({ a: { title: "x" } })).toThrow(
      "linkReferences",
    )
    expect(resolveLinkReferences(undefined)).toBeUndefined()
    // Labels that match each other would pick different addresses on
    // different hosts.
    expect(() => resolveLinkReferences({ ["a".repeat(1000)]: "/a" })).toThrow(
      "longer than the 999 characters",
    )
    expect(() =>
      resolveLinkReferences({ Console: "/first", " console ": "/last" }),
    ).toThrow("Console and  console  are the same label")
    // An address markdown-it refuses in a page's own definition.
    for (const url of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "vbscript:x",
      "file:///etc/hosts",
      "data:text/html,x",
    ])
      expect(() => resolveLinkReferences({ a: { url } })).toThrow(
        "no link address",
      )
    expect(
      resolveLinkReferences({ a: "data:image/png;base64,AA" })?.get("A")?.url,
    ).toBe("data:image/png;base64,AA")
  })
})

describe("shared link references in the checker", () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
  })

  it("places a broken shared address at its label and names an unknown label", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-references-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs", "guide"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "docs", "guide", "page.md"),
      "# Page\n\nUse a [token][business-token] and the [console][consle].\n\nThe [consoel][] and the written \\[a\\]\\[nowhere\\] or [b][0].\n\nCode `[a][nowhere]` is no reference either.\n",
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      linkReferences: {
        "business-token": "../auth/common.md#business-token",
        console: "https://console.example.com/app",
      },
    })
    const result = checkReferences(library)
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.severity,
        issue.position?.start.line,
        issue.position?.start.column,
        issue.suggestions,
      ]),
    ).toEqual([
      ["missing-document", "error", 3, 14, undefined],
      ["undefined-link-reference", "warning", 3, 48, ["[console]"]],
      ["undefined-link-reference", "warning", 5, 5, ["[console]"]],
    ])
    expect(result.issues[0]!.message).toContain(
      "the shared link reference [business-token]",
    )
  })

  it("names an unknown label after an escaped backslash", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-references-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    // `\\\\` is a backslash, so the `]` after it closes the link text; one
    // backslash before `]` escapes it, and that is no reference.
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      "# Page\n\nNot [a\\][missing] but [a\\\\][missing].\n",
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      linkReferences: { console: "https://console.example.com/app" },
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["undefined-link-reference", 3, 28]])
  })

  it("places an unknown label past code blocks and spans over lines", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-references-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    // A fenced example and a code span over two lines show the label as
    // code; the reference the reader sees is the last one.
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      "# Page\n\n```md\n[x][consle]\n```\n\nSee `a\n[x][consle]` here.\n\n    [x][consle]\n\n[x][consle]\n",
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      linkReferences: { console: "https://console.example.com/app" },
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["undefined-link-reference", 12, 4]])
  })

  it("places a shared reference's issue past a code example that shows it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-references-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(path.join(root, "docs", "install.md"), "# Install\n")
    fs.writeFileSync(
      path.join(root, "docs", "guide.md"),
      "# Guide\n\n```md\n[install]\n```\n\nActual: [install]\n",
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      linkReferences: { install: "./install.md#bad" },
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["missing-anchor", 7, 9]])
  })

  it("places an unknown label past a code span opened by a longer run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-references-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    // The single backtick inside the double ones closes nothing.
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      "# Page\n\n`` ` [x][consle] ``\n\n[x][consle]\n",
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      linkReferences: { console: "https://console.example.com/app" },
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["undefined-link-reference", 5, 4]])
  })
})
