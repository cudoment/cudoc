/**
 * Pipe tables as the library's own parser reads them: micromark, through
 * remark, on every host but VitePress and Eleventy, and markdown-it there,
 * loaded from the site. The parser places every table, whatever block quotes
 * and list items hold it and however its lines are indented, and keeps every
 * cell a row has, the ones the page drops included. The line reader in
 * `source-tables.ts` answers for a source that does not parse, or when no
 * markdown-it can be loaded.
 *
 * A header row the delimiter row below it disagrees with makes no table, so
 * no parser shows one. Such a pair is found by giving the delimiter row as
 * many cells as the header has and parsing again: a table there means its
 * cell count was all that kept it from being one.
 */

import { createRequire } from "node:module"
import path from "node:path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkDirective from "remark-directive"
import remarkMdx from "remark-mdx"
import {
  headerIssue,
  isDelimiterRow,
  rowIssues,
  HTML_BLOCK_TAGS,
  LINE_ENDING,
  sourceLines,
  sourceTableIssues,
  sourceTables,
  splitRow,
  withoutFrontMatter,
  type SourceRow,
  type SourceTable,
  type SourceTableIssue,
  type TableParser,
} from "./source-tables.js"

/** A document's tables and their problems, in order. */
export type TableReading = {
  tables: SourceTable[]
  issues: SourceTableIssue[]
  /** Whether the parser read them, rather than the line reader. */
  parsed: boolean
}

export type TableReadingOptions = {
  parser: TableParser
  /** Parse the source as MDX. */
  mdx?: boolean
  /**
   * The library's host, whose own syntax the parse follows: Docusaurus's
   * directives, VitePress's containers and components, and an Eleventy
   * site's containers.
   */
  host?: string
  /** The directories markdown-it is loaded from, the first that has it. */
  from?: readonly string[]
  /**
   * The document the source is, whose parsed reading is then kept until
   * its source changes.
   */
  document?: string
}

/** A table's rows, header first, each with as many cells as the parser read. */
type ParsedRow = SourceRow & { cells: number }

/**
 * A parse: its tables, and the lines code, raw HTML and MDX expressions or
 * imports hold, where nothing is a table. Front matter is blanked first, as
 * a host reads it before its parser sees the text.
 */
type Parse = { tables: ParsedRow[][]; code: Set<number> }

type Node = {
  type: string
  position?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  children?: Node[]
}

/** The node types whose lines hold no Markdown. */
const OPAQUE = new Set(["code", "html", "mdxFlowExpression", "mdxjsEsm"])

const parseMicromark = (
  source: string,
  mdx: boolean,
  directives: boolean,
): Parse => {
  const processor = unified().use(remarkParse).use(remarkGfm)
  if (directives) processor.use(remarkDirective)
  if (mdx) processor.use(remarkMdx)
  const parse: Parse = { tables: [], code: new Set() }
  // A row's text as the line reader has it, an MDX expression in a cell
  // blanked, so no backtick or pipe in its JavaScript reads as Markdown.
  const lines = sourceLines(source, mdx)
  const walk = (node: Node) => {
    const at = node.position
    if (node.type === "table") {
      parse.tables.push(
        node.children!.map(({ position, children }) => ({
          line: position!.start.line,
          start: position!.start.column - 1,
          text: lines[position!.start.line - 1]!.slice(
            position!.start.column - 1,
            position!.end.column - 1,
          ),
          cells: children!.length,
        })),
      )
      return
    }
    // A block that ends at the start of a line, as a fence its list item
    // closes does, holds none of that line.
    if (at && OPAQUE.has(node.type))
      for (
        let line = at.start.line;
        line <= at.end.line - (at.end.column === 1 ? 1 : 0);
        line++
      )
        parse.code.add(line)
    // Raw HTML in a paragraph's or a heading's text leaves its line a line.
    if (node.type !== "paragraph" && node.type !== "heading")
      node.children?.forEach(walk)
  }
  walk(processor.parse(withoutFrontMatter(source)) as unknown as Node)
  return parse
}

/** What this reads of markdown-it's block state. */
type BlockState = {
  src: string
  env: { cudocTables?: ParsedRow[][] }
  md: { block: { tokenize(state: BlockState, from: number, to: number): void } }
  push(type: string, tag: string, nesting: number): { map: number[] | null }
  line: number
  lineMax: number
  parentType: string
  blkIndent: number
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  sCount: number[]
}
type BlockRule = (
  state: BlockState,
  startLine: number,
  endLine: number,
  silent: boolean,
) => boolean
type MarkdownIt = {
  parse(
    source: string,
    env: BlockState["env"],
  ): { type: string; map: [number, number] | null }[]
  disable(rule: string): void
  block: {
    ruler: {
      __rules__: { name: string; fn: BlockRule; alt: string[] }[]
      at(name: string, fn: BlockRule, options: { alt: string[] }): void
      before(
        before: string,
        name: string,
        fn: BlockRule,
        options: { alt: string[] },
      ): void
    }
  }
}

/** The containers VitePress registers. */
const VITEPRESS_CONTAINERS = [
  "tip",
  "info",
  "warning",
  "danger",
  "details",
  "v-pre",
  "raw",
  "code-group",
]

/** A line's text in markdown-it's block state, from where its block starts. */
const lineText = (state: BlockState, line: number) =>
  state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line])

/**
 * markdown-it-container's rule for `names`, or for any name: a line of three
 * or more `:` and a name opens a container, which the first line of at least
 * as many `:` and nothing else closes, and its lines are read as blocks.
 */
const containers =
  (names?: readonly string[]): BlockRule =>
  (state, startLine, endLine, silent) => {
    const marker = (line: number) => /^:*/.exec(lineText(state, line))![0]
    const open = marker(startLine)
    if (open.length < 3) return false
    const name = lineText(state, startLine)
      .slice(open.length)
      .trim()
      .split(" ", 2)[0]
    if (!name || (names && !names.includes(name))) return false
    if (silent) return true
    let next = startLine
    let closed = false
    while (++next < endLine) {
      const text = lineText(state, next)
      if (text && state.sCount[next]! < state.blkIndent) break
      if (state.sCount[next]! - state.blkIndent >= 4) continue
      const close = marker(next)
      if (
        close.length < open.length ||
        !/^[ \t]*$/.test(text.slice(close.length))
      )
        continue
      closed = true
      break
    }
    const [parentType, lineMax] = [state.parentType, state.lineMax]
    state.parentType = "container"
    state.lineMax = next
    state.md.block.tokenize(state, startLine + 1, next)
    state.parentType = parentType
    state.lineMax = lineMax
    state.line = next + (closed ? 1 : 0)
    return true
  }

/**
 * HTML's inline elements, which VitePress's `componentPlugin` does not read
 * as components; `slot` and `template` are Vue's own, so components.
 */
const INLINE_TAGS = (
  "a abbr acronym audio b bdi bdo big br button canvas cite code data " +
  "datalist del dfn em embed i iframe img input ins kbd label map mark " +
  "meter noscript object output picture progress q ruby s samp script " +
  "select small span strong sub sup svg textarea time u tt var video wbr"
).split(" ")
const TAG = "[A-Za-z][A-Za-z0-9\\-]*"
/** An attribute as VitePress reads one, a Vue event's `@` included. */
const ATTRIBUTE = `(?:\\s+[a-zA-Z_:@][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)`

/**
 * VitePress's raw HTML blocks, in its order, each as the line that opens
 * it, the line that ends it, and whether it may end a paragraph or a table:
 * `<script>`, `<pre>` and `<style>` to their closing tag (`<textarea>` is
 * not among them), a comment, `<?`, `<!X` and `<![CDATA[` to their closing
 * marks, a block-level element's tag and a component's, any tag but an
 * inline element's, to a blank line, and a lone tag of any other element,
 * which may not.
 */
const VITEPRESS_HTML: [RegExp, RegExp, boolean][] = [
  [/^<(script|pre|style)(?=(\s|>|$))/i, /<\/(script|pre|style)>/i, true],
  [/^<!--/, /-->/, true],
  [/^<\?/, /\?>/, true],
  [/^<![A-Z]/, />/, true],
  [/^<!\[CDATA\[/, /\]\]>/, true],
  [
    new RegExp(`^</?(${[...HTML_BLOCK_TAGS].join("|")})(?=(\\s|/?>|$))`, "i"),
    /^$/,
    true,
  ],
  [
    new RegExp(
      `^</?(?!(${INLINE_TAGS.join("|")})(?![\\w-]))${TAG}(?=(\\s|/?>|$))`,
    ),
    /^$/,
    true,
  ],
  [
    new RegExp(`^(?:<${TAG}${ATTRIBUTE}*\\s*\\/?>|<\\/${TAG}\\s*>)\\s*$`),
    /^$/,
    false,
  ],
]
/** The kind of VitePress's raw HTML a component opens. */
const COMPONENT = 6
/** A component closed on the line it opens on, which takes that line alone. */
const CLOSED = new RegExp(
  `^<${TAG}${ATTRIBUTE}*\\s*\\/>|^<(${TAG})${ATTRIBUTE}*\\s*>.*<\\/\\1\\s*>`,
)

/** VitePress's rule for raw HTML, which takes the place of markdown-it's. */
const vitePressHtml: BlockRule = (state, startLine, endLine, silent) => {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false
  let text = lineText(state, startLine)
  if (!text.startsWith("<")) return false
  const kind = VITEPRESS_HTML.findIndex(([opens]) => opens.test(text))
  if (kind < 0) return false
  if (silent) return VITEPRESS_HTML[kind]![2]
  if (kind === COMPONENT && CLOSED.test(text)) {
    state.line = startLine + 1
    return true
  }
  const ends = VITEPRESS_HTML[kind]![1]
  let next = startLine + 1
  if (!ends.test(text))
    for (; next < endLine; next++) {
      if (state.sCount[next]! < state.blkIndent) break
      text = lineText(state, next)
      if (ends.test(text)) {
        if (text) next++
        break
      }
    }
  state.line = next
  state.push("html_block", "", 0).map = [startLine, next]
  return true
}

/** VitePress's `<<<` code snippet, a line of its own where a block may start. */
const vitePressSnippet: BlockRule = (state, startLine, _endLine, silent) => {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false
  if (!lineText(state, startLine).startsWith("<<<")) return false
  if (silent) return true
  state.line = startLine + 1
  state.push("fence", "code", 0).map = [startLine, state.line]
  return true
}

/** VitePress's `[[toc]]`, which takes its line and ends a table or a paragraph. */
const vitePressToc: BlockRule = (state, startLine, _endLine, silent) => {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false
  if (!/^\[\[toc\]\]$/i.test(lineText(state, startLine).split(" ")[0]!))
    return false
  if (!silent) state.line = startLine + 1
  return true
}

/**
 * markdown-it set up as `host` sets its own up for this, with raw HTML on:
 * VitePress with its containers, its raw HTML and components, its `[[toc]]`
 * and its `<<<` snippets, Eleventy with a container of any name, as
 * markdown-it-container registered under that name reads it, and without
 * indented code blocks, which Eleventy turns off in every renderer it is
 * given. The table rule
 * is watched, so each table it makes is recorded as the rule read its rows,
 * from where each starts in its container, which the tokens do not say.
 */
const setUp = (md: MarkdownIt, host: string | undefined): MarkdownIt => {
  if (host === "vitepress" || host === "eleventy")
    md.block.ruler.before(
      "fence",
      "cudoc_container",
      containers(host === "vitepress" ? VITEPRESS_CONTAINERS : undefined),
      { alt: ["paragraph", "reference", "blockquote", "list"] },
    )
  if (host === "eleventy") md.disable("code")
  if (host === "vitepress") {
    md.block.ruler.at("html_block", vitePressHtml, {
      alt: ["paragraph", "reference", "blockquote"],
    })
    md.block.ruler.before("heading", "cudoc_toc", vitePressToc, {
      alt: ["paragraph", "reference", "blockquote"],
    })
    md.block.ruler.before("fence", "cudoc_snippet", vitePressSnippet, {
      alt: [],
    })
  }
  const rule = md.block.ruler.__rules__.find((entry) => entry.name === "table")
  if (!rule) throw new Error("cudoc: markdown-it has no table rule")
  const table = rule.fn
  md.block.ruler.at(
    "table",
    (state, startLine, endLine, silent) => {
      if (!table(state, startLine, endLine, silent)) return false
      if (silent) return true
      const rows: ParsedRow[] = []
      for (let line = startLine; line < state.line; line++) {
        // The delimiter row is no row of the table's.
        if (line === startLine + 1) continue
        const from = state.bMarks[line]! + state.tShift[line]!
        const text = state.src.slice(from, state.eMarks[line])
        rows.push({
          line: line + 1,
          start: from - (state.src.lastIndexOf("\n", from - 1) + 1),
          text,
          cells: splitRow(text, 0, "markdown-it").length,
        })
      }
      ;(state.env.cudocTables ??= []).push(rows)
      return true
    },
    { alt: rule.alt },
  )
  return md
}

/**
 * markdown-it as each list of directories loads it for each host, or when
 * it was last looked for there in vain.
 */
const loaded = new Map<string, { md?: MarkdownIt; at: number }>()

/** How long, in milliseconds, a markdown-it not found is not looked for again. */
const RETRY = 30_000

/** The site's markdown-it, from the first of `from` that resolves one. */
const markdownIt = (
  from: readonly string[],
  host: string | undefined,
): MarkdownIt | undefined => {
  const key = [host ?? "", ...from].join("\0")
  const known = loaded.get(key)
  if (known && (known.md || Date.now() - known.at < RETRY)) return known.md
  let md: MarkdownIt | undefined
  for (const dir of from) {
    try {
      const exported = createRequire(path.join(dir, "package.json"))(
        "markdown-it",
      ) as
        | (new (options: { html: boolean }) => MarkdownIt)
        | { default: new (options: { html: boolean }) => MarkdownIt }
      const MarkdownIt =
        typeof exported === "function" ? exported : exported.default
      md = setUp(new MarkdownIt({ html: true }), host)
      break
    } catch {
      // Not installed there, or not a markdown-it this can set up.
    }
  }
  loaded.set(key, { md, at: Date.now() })
  return md
}

const parseMarkdownIt = (md: MarkdownIt, source: string): Parse => {
  const env: BlockState["env"] = {}
  const parse: Parse = { tables: [], code: new Set() }
  // markdown-it tries a table before any other block, so a block's first
  // line may still head one.
  for (const token of md.parse(withoutFrontMatter(source), env))
    if (token.map && ["fence", "code_block", "html_block"].includes(token.type))
      for (let line = token.map[0] + 1; line < token.map[1]; line++)
        parse.code.add(line + 1)
  parse.tables = env.cudocTables ?? []
  return parse
}

/** A line's block quote markers and indentation, however deep. */
const QUOTES = /^(?:[ \t]*>[ \t]?)*[ \t]*/

/** A container's marker at the start of a line: a list item's or a block quote's. */
const CONTAINER = /^(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)|>[ \t]?)[ \t]*/

/** A delimiter row of `cells` cells. */
const delimiterRow = (cells: number) => `|${"-|".repeat(cells)}`

/**
 * Each header row whose cell count alone keeps it and the delimiter row
 * below from being a table. A line is tried with every reading of its start
 * as containers, since markdown-it tries a table before a block quote or a
 * list item, and the parse decides which reading is the header.
 */
const mismatchedHeaders = (
  source: string,
  parse: Parse,
  again: (source: string) => Parse,
  parser: TableParser,
): SourceTableIssue[] => {
  const lines = source.split(LINE_ENDING)
  // A line of a table is no header, and a delimiter row that heads a table
  // of its own is that table's; a block holding the header holds the line.
  const tabled = new Set<number>()
  for (const rows of parse.tables)
    for (
      let line = rows[0]!.line;
      line <= Math.max(rows.at(-1)!.line, rows[0]!.line + 1);
      line++
    )
      tabled.add(line)
  const issues: SourceTableIssue[] = []
  for (let line = 1; line < lines.length; line++) {
    if (
      tabled.has(line) ||
      tabled.has(line + 1) ||
      parse.code.has(line) ||
      !lines[line - 1]!.trim()
    )
      continue
    const next = lines[line]!
    const cut = QUOTES.exec(next)![0].length
    const delimiter = next.slice(cut).trimEnd()
    if (!isDelimiterRow(delimiter, parser) || /^-[ \t]/.test(delimiter))
      continue
    const columns = splitRow(delimiter, 0, parser).length
    const counts = new Set<number>()
    for (let head = lines[line - 1]!.trimStart(); ;) {
      counts.add(splitRow(head, 0, parser).length)
      const marker = CONTAINER.exec(head)?.[0]
      if (!marker) break
      head = head.slice(marker.length)
    }
    for (const cells of counts) {
      if (cells === columns) continue
      const repaired = [...lines]
      repaired[line] = next.slice(0, cut) + delimiterRow(cells)
      let header: ParsedRow | undefined
      try {
        header = again(repaired.join("\n")).tables.find(
          (rows) => rows[0]!.line === line,
        )?.[0]
      } catch {
        // A repair that does not parse makes no table.
      }
      if (!header) continue
      issues.push(headerIssue(header, header.cells, columns))
      break
    }
  }
  return issues
}

const read = (source: string, options: TableReadingOptions): TableReading => {
  const { parser, mdx = false, host } = options
  const md =
    parser === "markdown-it" ? markdownIt(options.from ?? [], host) : null
  const parseWith =
    parser === "micromark"
      ? (text: string) => parseMicromark(text, mdx, host === "docusaurus")
      : md && ((text: string) => parseMarkdownIt(md, text))
  let parse: Parse | undefined
  try {
    parse = parseWith?.(source)
  } catch {
    // A host's own syntax, or MDX that does not compile, which the build
    // reports; the line reader answers.
  }
  if (!parse || !parseWith) {
    const indentedCode = !mdx && host !== "eleventy"
    return {
      tables: sourceTables(source, parser, mdx, indentedCode),
      issues: sourceTableIssues(source, parser, mdx, indentedCode),
      parsed: false,
    }
  }
  const tables: SourceTable[] = []
  const issues: SourceTableIssue[] = []
  for (const rows of parse.tables) {
    const header = rows[0]!
    issues.push(...rowIssues(rows, header.cells, parser))
    tables.push({
      header: splitRow(header.text, 0, parser).map((cell) => cell.text),
      start: header.line,
      end: Math.max(rows.at(-1)!.line, header.line + 1),
    })
  }
  issues.push(...mismatchedHeaders(source, parse, parseWith, parser))
  issues.sort((a, b) => a.line - b.line || a.column - b.column)
  return { tables, issues, parsed: true }
}

/** Each document's parsed reading, by its options and name, with its source. */
const readings = new Map<string, { source: string; reading: TableReading }>()

/**
 * The tables of a document's source and their problems, as `options.parser`
 * reads them: `table-column-count` for a row, or a header and the delimiter
 * row below it, with a cell count other than the table's, and
 * `table-unclosed-code` for a code span a pipe or the end of a cell cuts
 * off. A parsed reading of a named `options.document` is kept until its
 * source changes, so a language server that checks again after an edit
 * parses only the document that changed. Do not change it.
 */
export function readTables(
  source: string,
  options: TableReadingOptions,
): TableReading {
  if (options.document === undefined) return read(source, options)
  const key = [
    options.parser,
    options.mdx ? "mdx" : "md",
    options.host ?? "",
    ...(options.parser === "markdown-it" ? (options.from ?? []) : []),
    options.document,
  ].join("\0")
  const known = readings.get(key)
  if (known?.source === source) return known.reading
  const reading = read(source, options)
  if (reading.parsed) readings.set(key, { source, reading })
  else readings.delete(key)
  return reading
}
