/**
 * Pipe tables read from the source text, the way GFM reads them.
 *
 * A table that is wrong never fails a build: the parser keeps as many cells
 * as the delimiter row has, fills a short row with empty cells, and a header
 * that disagrees with the delimiter row turns the whole table into a
 * paragraph. The tree a host produces has already absorbed all of that, so
 * the only place left to see what the author wrote is the source.
 *
 * Both parser families split a row on every `|` that is not escaped with a
 * backslash, inside a code span as much as outside it: remark (micromark) by
 * the GFM specification and markdown-it 14 by its own `escapedSplit`. They
 * differ on what escapes a pipe. micromark counts the backslashes before it,
 * since `\\` is an escaped backslash; markdown-it looks at the one character
 * before it, so `\\|` splits a row on one host and not on the other.
 */

/** The parser whose reading of a row the checker follows. */
export type TableParser = "micromark" | "markdown-it"

export type SourceTableIssue = {
  code: "table-column-count" | "table-unclosed-code"
  message: string
  /** 1-based, in the file the text came from. */
  line: number
  column: number
  /** The row or cell as written, trimmed. */
  reference: string
}

type Cell = { text: string; column: number }

/**
 * A line without its block quote markers and indentation, and where it
 * starts. With `item`, a list item's marker is taken off as well, so a
 * table or a fence that opens a list item is read as one.
 */
const content = (
  line: string,
  item = false,
): { text: string; start: number } => {
  const match = line.match(
    item
      ? /^(?:[ \t]{0,3}>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?/
      : /^(?:[ \t]{0,3}>[ \t]?)*[ \t]*/,
  )
  const start = match ? match[0].length : 0
  return { text: line.slice(start), start }
}

/**
 * Whether the character at `index` is escaped: an odd run of backslashes
 * before it, since `\\` is an escaped backslash.
 */
const escaped = (text: string, index: number) => {
  let count = 0
  while (index - count > 0 && text[index - count - 1] === "\\") count++
  return count % 2 === 1
}

/** Whether the pipe at `index` is escaped, as `parser` reads a row. */
const pipeEscaped = (text: string, index: number, parser: TableParser) =>
  parser === "markdown-it" ? text[index - 1] === "\\" : escaped(text, index)

/** A line inside `depth` block quotes, their markers and its indentation taken off. */
const inQuotes = (line: string, depth: number) => {
  let text = line
  for (let level = 0; level < depth; level++)
    text = text.replace(/^[ \t]{0,3}>[ \t]?/, "")
  return text.trimStart()
}

/** Whether each block quote marker of a line starts it or follows the one before. */
const quotedAtStart = (line: string) =>
  /^(?:>[ \t]?)*/.exec(line)![0].length ===
  /^(?:[ \t]{0,3}>[ \t]?)*/.exec(line)![0].length

/** How many block quotes a line sits in. */
const quoteDepth = (line: string) =>
  line.match(/^(?:[ \t]{0,3}>[ \t]?)*/)![0].split(">").length - 1

/**
 * A line that opens or closes a container on a markdown-it host, as VitePress
 * and markdown-it-container read `:::`.
 */
const CONTAINER = /^:{3,}/

/** A line that starts a list item or a heading, which ends a table. */
const STARTS_BLOCK = /^(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|#{1,6}(?:[ \t]|$))/

/** A list item's marker and the white space after it. */
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)([ \t]*)/

/**
 * How far a line is indented after its block quote markers, in columns, a
 * tab reaching the next multiple of four.
 */
const indentOf = (line: string) => {
  let width = 0
  for (const character of line.slice(
    line.match(/^(?:[ \t]{0,3}>[ \t]?)*/)![0].length,
  )) {
    if (character === " ") width++
    else if (character === "\t") width += 4 - (width % 4)
    else break
  }
  return width
}

/**
 * How far a line is indented, in columns, once `depth` block quote markers
 * are taken off: where a further `>` on it stands.
 */
const indentAfter = (line: string, depth: number) => {
  let width = 0
  for (const character of line.replace(
    new RegExp(`^(?:[ \\t]{0,3}>[ \\t]?){${depth}}`),
    "",
  )) {
    if (character === " ") width++
    else if (character === "\t") width += 4 - (width % 4)
    else break
  }
  return width
}

/** A heading. */
const HEADING = /^#{1,6}(?:[ \t]|$)/

/** A thematic break, which ends a paragraph and is no list item. */
const THEMATIC_BREAK = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/

/** A tag whose raw HTML runs to the line holding a closing tag of the four. */
const HTML_RAW = /^<(?:pre|script|style|textarea)(?:[\s>]|$)/i
const HTML_RAW_END = /<\/(?:pre|script|style|textarea)>/i

/** The block-level tags that open raw HTML, which runs to a blank line. */
export const HTML_BLOCK_TAGS = new Set(
  (
    "address article aside base basefont blockquote body caption center col " +
    "colgroup dd details dialog dir div dl dt fieldset figcaption figure " +
    "footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html " +
    "iframe legend li link main menu menuitem nav noframes ol optgroup " +
    "option p param search section summary table tbody td tfoot th thead " +
    "title tr track ul"
  ).split(" "),
)
const HTML_BLOCK_TAG = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?:[\s>]|\/>|$)/

/** Any other tag alone on its line, which opens raw HTML outside a paragraph. */
const HTML_TAG_LINE =
  /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/

/** A line of MDX tags alone, a component in its own block. */
const JSX_LINE =
  /^(?:[ \t]*<\/?(?:[A-Za-z_$][\w$.:-]*)?(?:\s+(?:[^<>"'{}]|"[^"]*"|'[^']*'|\{[^{}]*\})*)?\/?>)+[ \t]*$/

/**
 * The raw HTML a line opens, by CommonMark's rules, as where it ends: a
 * comment, `<?`, `<!X` and `<![CDATA[` at their closing marks, `<pre>`,
 * `<script>`, `<style>` and `<textarea>` at a closing tag of the four, and a
 * block-level tag, or any other tag alone on its line where it does not
 * continue a paragraph, at a blank line. `from` is where the closing mark
 * may start on the opening line.
 */
const htmlStart = (
  text: string,
  inParagraph: boolean,
): { end: RegExp | "blank"; from: number } | undefined => {
  if (text.startsWith("<!--")) return { end: /-->/, from: 4 }
  if (text.startsWith("<?")) return { end: /\?>/, from: 2 }
  if (text.startsWith("<![CDATA[")) return { end: /\]\]>/, from: 9 }
  if (/^<![A-Za-z]/.test(text)) return { end: />/, from: 2 }
  if (HTML_RAW.test(text)) return { end: HTML_RAW_END, from: 1 }
  const tag = text.match(HTML_BLOCK_TAG)?.[1]?.toLowerCase()
  if (tag && HTML_BLOCK_TAGS.has(tag)) return { end: "blank", from: 0 }
  if (!inParagraph && HTML_TAG_LINE.test(text)) return { end: "blank", from: 0 }
  return undefined
}

/**
 * Whether a line starts a block that ends a paragraph rather than continuing
 * it lazily: a thematic break, a heading, a fence, raw HTML that may
 * interrupt one, in MDX a line of tags alone, or a list item that holds
 * something, an ordered one only from 1. markdown-it, which reads a line
 * left of the list item the paragraph is in, takes any list item, and a
 * container's `:::`.
 */
const interrupts = (text: string, parser: TableParser, mdx: boolean) => {
  if (THEMATIC_BREAK.test(text) || HEADING.test(text) || fenceOpen(text))
    return true
  if (htmlStart(text, true) || (mdx && JSX_LINE.test(text))) return true
  if (parser === "markdown-it")
    return LIST_ITEM.test(text) || CONTAINER.test(text)
  const item = text.match(/^(?:[-*+]|(\d{1,9})[.)])[ \t]+\S/)
  return Boolean(item && (item[1] === undefined || Number(item[1]) === 1))
}

/**
 * The cells of a row as GFM splits them: surrounding whitespace and one
 * leading and one trailing unescaped pipe dropped, then a cell between every
 * pair of unescaped pipes. Columns are 1-based in the original line.
 */
export function splitRow(
  text: string,
  offset = 0,
  parser: TableParser = "micromark",
): Cell[] {
  let start = 0
  let end = text.length
  while (start < end && /\s/.test(text[start]!)) start++
  while (end > start && /\s/.test(text[end - 1]!)) end--
  if (text[start] === "|") start++
  if (
    end > start &&
    text[end - 1] === "|" &&
    !pipeEscaped(text, end - 1, parser)
  )
    end--
  const cells: Cell[] = []
  let from = start
  for (let i = start; i <= end; i++) {
    if (i === end || (text[i] === "|" && !pipeEscaped(text, i, parser))) {
      const raw = text.slice(from, i)
      const lead = raw.length - raw.trimStart().length
      cells.push({ text: raw.trim(), column: offset + from + lead + 1 })
      from = i + 1
    }
  }
  return cells
}

/** Whether the text holds a pipe that splits it, so it can be a row. */
const hasPipe = (text: string, parser: TableParser) => {
  for (let i = 0; i < text.length; i++)
    if (text[i] === "|" && !pipeEscaped(text, i, parser)) return true
  return false
}

const DELIMITER_CELL = /^:?-+:?$/

/** Whether a line is a delimiter row: dashes with optional colons, between pipes. */
export const isDelimiterRow = (text: string, parser: TableParser) => {
  if (!hasPipe(text, parser)) return false
  const cells = splitRow(text, 0, parser)
  return (
    cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell.text))
  )
}

/**
 * The code spans of a text, in order: where each run of backticks opens and
 * where the run that closes it starts, or -1. A run opens a span that only a
 * run of exactly the same length closes; a backtick escaped with a backslash
 * outside a span is a literal one.
 */
export function codeSpans(text: string): { open: number; close: number }[] {
  const spans: { open: number; close: number }[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] !== "`" || escaped(text, i)) {
      i++
      continue
    }
    let length = 0
    while (text[i + length] === "`") length++
    const open = i
    i += length
    let close = -1
    while (i < text.length) {
      if (text[i] !== "`") {
        i++
        continue
      }
      let run = 0
      while (text[i + run] === "`") run++
      if (run === length) {
        close = i
        i += run
        break
      }
      i += run
    }
    spans.push({ open, close })
  }
  return spans
}

/** Where the first code span in a text that never closes opens, or -1. */
export function unclosedCode(text: string): number {
  return codeSpans(text).find((span) => span.close < 0)?.open ?? -1
}

/** The opening line of a fence, its character and length, or nothing. */
const fenceOpen = (text: string) => {
  const match = text.match(/^(`{3,}|~{3,})(.*)$/)
  if (!match) return undefined
  // A backtick fence's info string may not contain a backtick.
  if (match[1]![0] === "`" && match[2]!.includes("`")) return undefined
  return { char: match[1]![0]!, length: match[1]!.length }
}

/** A table as the source holds it: its header cells and its lines, 1-based. */
export type SourceTable = { header: string[]; start: number; end: number }

/**
 * A row as the source holds it: its line, 1-based, its text without its
 * container's markers and indentation, and where that starts, 0-based.
 */
export type SourceRow = { line: number; text: string; start: number }

/**
 * The issue of a header row with `cells` cells over a delimiter row with
 * `columns`, which makes the two lines no table.
 */
export function headerIssue(
  header: SourceRow,
  cells: number,
  columns: number,
): SourceTableIssue {
  return {
    code: "table-column-count",
    message: `the header row has ${cells} cell${cells === 1 ? "" : "s"} and the delimiter row below it ${columns}, so this is not a table: it renders as a paragraph of text. Give both rows the same number of cells.`,
    line: header.line,
    column: header.start + 1,
    reference: header.text.trim(),
  }
}

/**
 * The issues of a table's rows, in order: a row whose cells, as `parser`
 * splits it unless `cells` counts them, are more or fewer than the table's
 * `columns`, and a code span a cell never closes.
 */
export function rowIssues(
  rows: (SourceRow & { cells?: number })[],
  columns: number,
  parser: TableParser,
): SourceTableIssue[] {
  const issues: SourceTableIssue[] = []
  for (const entry of rows) {
    const cells = splitRow(entry.text, entry.start, parser)
    const count = entry.cells ?? cells.length
    if (count !== columns)
      issues.push({
        code: "table-column-count",
        message:
          count > columns
            ? `this row has ${count} cells where the table has ${columns}, so ${count - columns === 1 ? "the last one is" : `the last ${count - columns} are`} dropped. Remove the extra cells, add the column to every row, or escape a | that belongs to the text as \\|.`
            : `this row has ${count} cell${count === 1 ? "" : "s"} where the table has ${columns}, so the rest render empty. Write the missing cells, empty if they are meant to be.`,
        line: entry.line,
        column: entry.start + 1,
        reference: entry.text.trim(),
      })
    // Read on the whole row, a span may close past the pipe that split it,
    // which is what an author who wrote `a|b` in code meant. Its two halves
    // are one mistake, reported where the span opens.
    const spans = codeSpans(entry.text)
    for (const cell of cells) {
      const at = unclosedCode(cell.text)
      if (at < 0) continue
      const inRow = cell.column - 1 - entry.start + at
      if (spans.some((span) => span.close === inRow)) continue
      const split = spans.some((span) => span.open === inRow && span.close >= 0)
      issues.push({
        code: "table-unclosed-code",
        message: split
          ? "a | inside this code span splits the cell, as it does anywhere in a table row, so the span never closes and its backticks show. Write the pipe as \\|."
          : "this code span is never closed in its cell, so its backticks show as text. Close it in the same cell.",
        line: entry.line,
        column: cell.column + at,
        reference: cell.text,
      })
    }
  }
  return issues
}

/**
 * The lines with every MDX expression, `{…}`, blanked out to spaces: an
 * expression is JavaScript, so a comment `{/* … *\/}` or a string that holds
 * table rows, as an attribute's template string may, is no table. It is read
 * as JavaScript reads it, with its strings, templates, regular expressions
 * and JSX. Fenced code and code spans are left alone, where braces are text,
 * and so is a quoted attribute value in a tag.
 */
const withoutMdxExpressions = (lines: string[]): string[] => {
  let fence: { char: string; length: number } | undefined
  /**
   * What the reader is inside: an expression `{`, a string, template or
   * regular expression in one and a class `[` in that, a comment `/*`, an
   * opening tag `<` or a closing one `</`, and JSX children `jsx`.
   */
  type Context = "{" | "'" | '"' | "`" | "/" | "[" | "/*" | "<" | "</" | "jsx"
  const stack: Context[] = []
  /**
   * The last character of code read in an expression, which tells a regular
   * expression's `/` and a JSX tag's `<` from an operator's: `;` where a
   * statement starts, `=>` after an arrow.
   */
  let last = ""
  /**
   * For each open parenthesis, what it holds: the condition of `if`,
   * `while`, `for`, `with`, `catch` or `switch`, the parameters of a
   * function declared as a statement or written as a value, or else.
   */
  type Paren = "control" | "declaration" | "expression" | "other"
  const parens: Paren[] = []
  /** What `last` was where the word read last began, and the word before it. */
  let wordAt = ""
  let priorWordAt = ""
  /**
   * Whether the `function` and the `class` keyword read last stand where a
   * statement starts, declaring, or where a value does.
   */
  const declares = { function: false, class: false }
  /** A function's parameters just closed, so a `{` opens its body. */
  let body: "declaration" | "expression" | undefined
  /**
   * Where on the stack a `{` opens a block rather than an object, and what
   * `last` becomes once it closes: after a statement's end or start, a
   * condition, an arrow, `case …:`, `else`, `do`, `try`, `catch` and
   * `finally`, and for a function or class declared, it is a block of
   * statements, after which a `/` starts a regular expression, `;`; for a
   * function or class written as a value or a method it is a body that ends
   * a value, after which a `/` divides, `)`. An object's is not here.
   */
  const blocks = new Map<number, ";" | ")">()
  /**
   * After an operator, a keyword or nothing, a value starts: a `/` opens a
   * regular expression, a `<` a tag. `after` is the code read before.
   */
  const valueStarts = (before: string, after = last) =>
    /[(,=:[!&|?{;+\-*%<>~^]/.test(after) ||
    /(?:^|[^\w$.])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(
      before.trimEnd(),
    )
  /**
   * The length of the backtick run that opened the code span being read in
   * Markdown text, or 0. A span may run over the lines of its paragraph.
   */
  let ticks = 0
  /**
   * Whether a run of `length` backticks at `from` on line `row` opens a code
   * span: a run of exactly as many closes it later in the paragraph, before
   * a blank line, a fence or a heading. Otherwise its backticks are text.
   */
  const spanCloses = (row: number, from: number, length: number) => {
    for (let at = row; at < lines.length; at++) {
      const line = lines[at]!
      const text = content(line, true).text
      if (at > row && (!text.trim() || fenceOpen(text) || HEADING.test(text)))
        return false
      for (let i = at === row ? from : 0; i < line.length; i++) {
        if (line[i] !== "`") continue
        let run = 0
        while (line[i + run] === "`") run++
        if (run === length) return true
        i += run - 1
      }
    }
    return false
  }
  return lines.map((line, row) => {
    if (!line.trim()) ticks = 0
    if (!stack.length && !ticks) {
      const text = content(line, true).text
      if (fence) {
        const close = content(line).text.match(/^(`{3,}|~{3,})\s*$/)
        if (
          close &&
          close[1]![0] === fence.char &&
          close[1]!.length >= fence.length
        )
          fence = undefined
        return line
      }
      fence = fenceOpen(text)
      if (fence) return line
    }
    let out = ""
    for (let i = 0; i < line.length; i++) {
      const character = line[i]!
      const top = stack.at(-1)
      /** Inside JavaScript somewhere, so everything read is blanked. */
      const code = stack.includes("{")
      const keep = (text: string) => (code ? " ".repeat(text.length) : text)
      if (top === undefined) {
        // Markdown text, where a backtick a backslash escapes opens nothing.
        if (character === "`" && (ticks || !escaped(line, i))) {
          let run = 0
          while (line[i + run] === "`") run++
          if (!ticks) ticks = spanCloses(row, i + run, run) ? run : 0
          else if (ticks === run) ticks = 0
          out += line.slice(i, i + run)
          i += run - 1
          continue
        }
        if (ticks || line[i - 1] === "\\") {
          out += character
          continue
        }
        if (character === "{") {
          stack.push("{")
          last = "{"
          out += " "
          continue
        }
        if (character === "<" && /[A-Za-z/>]/.test(line[i + 1] ?? ""))
          stack.push(line[i + 1] === "/" ? "</" : "<")
        out += character
        continue
      }
      if (top === "<" || top === "</") {
        // A tag: a quoted value is text, `{` opens an expression, and `>`
        // ends it. In JavaScript an opening tag that does not close itself
        // starts its children.
        if (character === '"' || character === "'") {
          const end = line.indexOf(character, i + 1)
          const value = end < 0 ? line.slice(i) : line.slice(i, end + 1)
          out += keep(value)
          i += value.length - 1
          continue
        }
        if (character === "{") {
          stack.push("{")
          last = "{"
          out += " "
          continue
        }
        out += keep(character)
        if (character !== ">") continue
        stack.pop()
        if (!stack.includes("{")) continue
        if (top === "</") {
          if (stack.at(-1) === "jsx") stack.pop()
          last = ")"
        } else if (line.slice(0, i).trimEnd().endsWith("/")) last = ")"
        else stack.push("jsx")
        continue
      }
      // Inside JavaScript or its JSX: everything is blanked.
      out += " "
      if (top === "jsx") {
        // JSX children: text, expressions and tags.
        if (character === "{") {
          stack.push("{")
          last = "{"
        } else if (character === "<" && /[A-Za-z/>]/.test(line[i + 1] ?? ""))
          stack.push(line[i + 1] === "/" ? "</" : "<")
        continue
      }
      /** Set where the character read is not what the next `/` follows. */
      let settled = false
      if (top === "/*") {
        // A comment leaves what was read before it as it was.
        settled = true
        if (character === "*" && line[i + 1] === "/") {
          stack.pop()
          out += " "
          i++
        }
      } else if (top === "'" || top === '"') {
        if (character === "\\") {
          out += i + 1 < line.length ? " " : ""
          i++
        } else if (character === top) stack.pop()
      } else if (top === "`") {
        if (character === "\\") {
          out += i + 1 < line.length ? " " : ""
          i++
        } else if (character === "`") stack.pop()
        else if (character === "$" && line[i + 1] === "{") {
          stack.push("{")
          last = "{"
          settled = true
          out += " "
          i++
        }
      } else if (top === "/" || top === "[") {
        // A regular expression: an escape, a class, and its closing `/`.
        if (character === "\\") {
          out += i + 1 < line.length ? " " : ""
          i++
        } else if (top === "/" && character === "[") stack.push("[")
        else if (top === "[" && character === "]") stack.pop()
        else if (top === "/" && character === "/") {
          stack.pop()
          last = ")"
          settled = true
        }
      } else if (character === "/" && line[i + 1] === "*") {
        stack.push("/*")
        out += " "
        i++
      } else if (character === "/" && line[i + 1] === "/") {
        out += " ".repeat(line.length - i - 1)
        break
      } else if (character === "/" && valueStarts(line.slice(0, i)))
        stack.push("/")
      else if (
        character === "<" &&
        /[A-Za-z>]/.test(line[i + 1] ?? "") &&
        valueStarts(line.slice(0, i))
      ) {
        stack.push("<")
        settled = true
      } else if (character === "'" || character === '"' || character === "`")
        stack.push(character)
      else if (character === "{") {
        const before = line.slice(0, i).trimEnd()
        const closes =
          body && last === ")"
            ? body === "declaration"
              ? ";"
              : ")"
            : /(?:^|[^\w$.])class(?:\s+(?!extends\b)[\w$]+)?(?:\s+extends\s+[\w$.]+)?$/.test(
                  before,
                )
              ? declares.class
                ? ";"
                : ")"
              : last === ";" ||
                  last === "=>" ||
                  /(?:^|[^\w$.])(?:else|do|try|catch|finally)$/.test(before) ||
                  /(?:^|[^\w$.])(?:case\b.*|default\s*):$/.test(before)
                ? ";"
                : last === ")"
                  ? ")"
                  : undefined
        if (closes) {
          blocks.set(stack.length, closes)
          last = ";"
          settled = true
        }
        stack.push("{")
      } else if (character === "}") {
        stack.pop()
        const closes = blocks.get(stack.length)
        if (closes) {
          blocks.delete(stack.length)
          last = closes
          settled = true
        }
      } else if (character === "(") {
        const before = line.slice(0, i)
        parens.push(
          /(?:^|[^\w$.])(?:if|while|for(?:\s+await)?|with|catch|switch)\s*$/.test(
            before,
          )
            ? "control"
            : /(?:^|[^\w$.])function\s*\*?\s*(?:[\w$]+\s*)?$/.test(before)
              ? declares.function
                ? "declaration"
                : "expression"
              : "other",
        )
      } else if (character === ")") {
        const paren = parens.pop()
        if (paren === "control") {
          // After `if (…)` a statement starts, which may be a regular expression.
          last = ";"
          settled = true
        } else if (paren === "declaration" || paren === "expression")
          body = paren
      } else if (character === ">" && line[i - 1] === "=") {
        last = "=>"
        settled = true
      } else if (
        (character === "+" || character === "-") &&
        line[i + 1] === character
      ) {
        // `++` and `--` end a value, as in `n++ / 2`, or come before one.
        out += " "
        i++
        last = ")"
        settled = true
      } else if (
        /[A-Za-z_$]/.test(character) &&
        !/[\w$]/.test(line[i - 1] ?? "")
      ) {
        // A word starts. A `function` or `class` keyword declares where a
        // statement starts: after one, `;`, or where no value can, as on
        // a new line after a value; `async function` from before `async`.
        ;[priorWordAt, wordAt] = [wordAt, last]
        const keyword = line
          .slice(i)
          .match(/^(?:function|class)(?![\w$])/)?.[0] as
          "function" | "class" | undefined
        if (keyword && line[i - 1] !== ".") {
          const before = line.slice(0, i)
          const async =
            keyword === "function" && /(?:^|[^\w$.])async\s+$/.test(before)
          const at = async ? priorWordAt : wordAt
          declares[keyword] =
            at === ";" ||
            !valueStarts(async ? before.replace(/async\s+$/, "") : before, at)
        }
      }
      if (!/\s/.test(character) && character !== ")") body = undefined
      if (!settled && !/\s/.test(character) && stack.at(-1) === "{")
        last = character
    }
    // A string in quotes ends with its line; a template and a comment go on.
    while (stack.at(-1) === "'" || stack.at(-1) === '"') stack.pop()
    return out
  })
}

/**
 * Every pipe table problem in a source, in order, as `parser` reads it. A
 * table inside fenced code, raw HTML or an indented code block is text and
 * is not read. `indentedCode` is off in MDX, which has none, and on a host
 * that turns them off, as Eleventy does.
 */
export function sourceTableIssues(
  source: string,
  parser: TableParser = "micromark",
  mdx = false,
  indentedCode = !mdx,
): SourceTableIssue[] {
  return scanTables(source, parser, mdx, indentedCode).issues
}

/**
 * The source with what a reader does not see as text blanked to spaces, its
 * length and line breaks kept, so an offset in it is one in the source:
 * front matter, fenced code, raw HTML and, with `indentedCode`, indented
 * code as `parser` reads the blocks, MDX expressions, and code spans, which
 * may run over the lines of a paragraph.
 */
export function withoutCode(
  source: string,
  parser: TableParser = "micromark",
  mdx = false,
  indentedCode = !mdx,
): string {
  const { lines, code } = scanTables(source, parser, mdx, indentedCode)
  const out: string[] = []
  /** The lines of the paragraph being read. */
  let paragraph: string[] = []
  const flush = () => {
    if (!paragraph.length) return
    const text = paragraph.join("")
    let blanked = text
    for (const span of codeSpans(text)) {
      if (span.close < 0) continue
      let end = span.close
      while (text[end] === "`") end++
      blanked =
        blanked.slice(0, span.open) +
        text.slice(span.open, end).replace(/[^\r\n]/g, " ") +
        blanked.slice(end)
    }
    out.push(blanked)
    paragraph = []
  }
  // The scanner reads lines without their endings, which stay as written.
  const endings = source.match(LINE_ENDINGS) ?? []
  lines.forEach((line, index) => {
    const ending = endings[index] ?? ""
    if (code.has(index)) {
      flush()
      out.push(" ".repeat(line.length) + ending)
    } else if (!line.trim()) {
      flush()
      out.push(line + ending)
    } else paragraph.push(line + ending)
  })
  flush()
  return out.join("")
}

/** Every table a source holds, in order, as `parser` reads it. */
export function sourceTables(
  source: string,
  parser: TableParser = "micromark",
  mdx = false,
  indentedCode = !mdx,
): SourceTable[] {
  return scanTables(source, parser, mdx, indentedCode).tables
}

/**
 * A line ending as CommonMark reads one, and as both parsers count lines: a
 * line feed, a carriage return, or the two together.
 */
export const LINE_ENDING = /\r\n|\r|\n/
const LINE_ENDINGS = new RegExp(LINE_ENDING.source, "g")

/** How many lines front matter takes at the very top of a source's lines. */
const frontMatterLines = (written: string[]) => {
  if (!/^(?:﻿)?(?:---|\+\+\+)\s*$/.test(written[0] ?? "")) return 0
  const marker = written[0]!.replace(/^﻿/, "").trim()
  for (let i = 1; i < written.length; i++)
    if (written[i]!.trim() === marker) return i + 1
  return 0
}

/**
 * The source with front matter at the very top blanked, its lines kept: a
 * host reads front matter as data before its parser sees the text.
 */
export function withoutFrontMatter(source: string): string {
  const written = source.split(LINE_ENDING)
  const index = frontMatterLines(written)
  return index
    ? [...written.slice(0, index).map(() => ""), ...written.slice(index)].join(
        "\n",
      )
    : source
}

/**
 * A source's lines as a table's cells read them: in MDX, every expression
 * blanked to spaces, the front matter's braces left alone, as YAML or TOML
 * opens no expression.
 */
export function sourceLines(source: string, mdx: boolean): string[] {
  const written = source.split(LINE_ENDING)
  if (!mdx) return written
  const index = frontMatterLines(written)
  return [
    ...written.slice(0, index),
    ...withoutMdxExpressions(written.slice(index)),
  ]
}

function scanTables(
  source: string,
  parser: TableParser,
  mdx: boolean,
  indentedCode: boolean,
): {
  issues: SourceTableIssue[]
  tables: SourceTable[]
  lines: string[]
  code: Set<number>
} {
  const issues: SourceTableIssue[] = []
  const tables: SourceTable[] = []
  /** The lines, 0-based, that hold no text a reader sees as text. */
  const code = new Set<number>()
  // Front matter at the very top is data, not Markdown.
  let index = frontMatterLines(source.split(LINE_ENDING))
  for (let i = 0; i < index; i++) code.add(i)
  const lines = sourceLines(source, mdx)
  /** A block holding a line, as its quote depth and list item column. */
  type Container = { depth: number; base: number }
  /** An open fence, and the container it ends with. */
  let fence: ({ char: string; length: number } & Container) | undefined
  /**
   * Raw HTML being read, which ends where its start says or with its
   * container. MDX has no raw HTML: a tag there is a component, whose
   * children are Markdown.
   */
  let html: ({ end: RegExp | "blank" } & Container) | undefined
  /**
   * The paragraph the line before belongs to, which a lazy line continues;
   * `quoted` when it sits in block quotes alone, each `>` at the start of
   * its line or right after the one before, where these containers place it
   * exactly.
   */
  let paragraph: (Container & { quoted?: boolean }) | undefined
  /**
   * The list items open at the quote depth: their kind, the bullet or the
   * `.` or `)` after a number, which a list keeps, and their content's column.
   */
  let lists: { kind: string; column: number }[] = []
  let listDepth = 0
  /**
   * Reads the table headed by the line at `at`, whose next line is its
   * delimiter row, in the container its rows stay in, and returns the last
   * line it took: the delimiter row when the header and the delimiter row
   * disagree, which makes the two lines a paragraph.
   */
  const readTable = (
    at: number,
    header: { text: string; start: number },
    delimiter: string,
    depth: number,
    base: number,
  ): number => {
    const columns = splitRow(delimiter, 0, parser).length
    const cells = splitRow(header.text, header.start, parser)
    const rowNumber = at + 1
    if (cells.length !== columns) {
      issues.push(
        headerIssue({ line: rowNumber, ...header }, cells.length, columns),
      )
      return at + 1
    }
    const rows: SourceRow[] = [{ line: rowNumber, ...header }]
    let row = at + 2
    for (; row < lines.length; row++) {
      // Every line is a row, a pipe or none, until a blank line, a line
      // outside the table's container, or one that starts another block:
      // a fence, a list item, a heading, a thematic break or raw HTML, which
      // on markdown-it does not include a lone tag, and in MDX is a line of
      // tags alone, and on markdown-it a container's `:::`.
      const body = content(lines[row]!)
      const bodyIndent = indentOf(lines[row]!)
      if (
        !body.text.trim() ||
        quoteDepth(lines[row]!) !== depth ||
        bodyIndent < base ||
        (!mdx && bodyIndent >= base + 4) ||
        fenceOpen(body.text) ||
        STARTS_BLOCK.test(body.text) ||
        (parser === "markdown-it" && CONTAINER.test(body.text)) ||
        THEMATIC_BREAK.test(body.text) ||
        (mdx
          ? HTML_TAG_LINE.test(body.text)
          : htmlStart(body.text, parser === "markdown-it"))
      )
        break
      rows.push({ line: row + 1, text: body.text, start: body.start })
    }
    issues.push(...rowIssues(rows, columns, parser))
    tables.push({
      header: cells.map((cell) => cell.text),
      start: rowNumber,
      end: row,
    })
    paragraph = undefined
    return row - 1
  }
  for (; index < lines.length; index++) {
    const line = lines[index]!
    // Inside a fence or raw HTML a list marker is text, so a line of a
    // dash and three backticks there closes nothing.
    const plain = content(line).text
    const { text, start } = content(line, true)
    const blank = !plain.trim()
    const depth = quoteDepth(line)
    const indent = indentOf(line)
    const inside = (block: Container) =>
      depth >= block.depth && (blank || indent >= block.base)
    const continued = paragraph
    paragraph = undefined
    if (html && inside(html)) {
      code.add(index)
      if (
        html.end === "blank" ? blank : html.end.test(inQuotes(line, html.depth))
      )
        html = undefined
      continue
    }
    html = undefined
    if (fence && inside(fence)) {
      code.add(index)
      const close = inQuotes(line, fence.depth).match(/^(`{3,}|~{3,})\s*$/)
      if (
        close &&
        close[1]![0] === fence.char &&
        close[1]!.length >= fence.length
      )
        fence = undefined
      continue
    }
    fence = undefined
    if (blank) continue
    const item = plain.match(LIST_ITEM)
    const kind = item?.[0].trimEnd().slice(-1)
    // A header row and a delimiter row in the same container, `container`
    // columns in and `quotes` block quotes deep. micromark takes a header
    // without a dividing pipe over a delimiter row of one cell; under one of
    // more, which is no table, this leaves the row to head one of its own.
    // markdown-it wants a pipe in the header, escaped or not. A delimiter row
    // starting `- ` is a list item.
    const next = lines[index + 1]
    const delimiterBelow = (
      header: string,
      container: number,
      quotes = depth,
    ) => {
      if (next === undefined) return undefined
      const delimiter = content(next).text
      const below = indentOf(next)
      return isDelimiterRow(delimiter, parser) &&
        !/^-[ \t]/.test(delimiter) &&
        quoteDepth(next) === quotes &&
        below >= container &&
        (mdx || below < container + 4) &&
        (parser === "markdown-it"
          ? header.includes("|")
          : hasPipe(header, parser) ||
            splitRow(delimiter, 0, parser).length === 1)
        ? delimiter
        : undefined
    }
    // A line outside the paragraph's container that starts nothing of its
    // own continues the paragraph lazily. An item beside an open one of its
    // kind starts something; markdown-it ends the paragraph at any item. A
    // block quote opened left of the paragraph's list item starts one too;
    // one opened inside the item, which these containers do not place, is
    // read as the paragraph's.
    if (
      continued &&
      (depth <= continued.depth ||
        indentAfter(line, continued.depth) >= continued.base) &&
      (depth < continued.depth || indent < continued.base) &&
      !(
        item &&
        depth === listDepth &&
        lists.some((open) => open.kind === kind && indent < open.column)
      ) &&
      !interrupts(plain, parser, mdx)
    ) {
      paragraph = continued
      // micromark takes a lazy line as a table's header when the delimiter
      // row below it sits in the paragraph's container and has as many
      // cells; markdown-it never does in a block quote. This reads one only
      // for a paragraph these containers place exactly, in block quotes
      // alone, from a line indented less than four columns that is not a
      // lone tag. A lazy line starting with a list item's marker is the
      // paragraph's, and micromark takes no lazy line as a header after it
      // until the paragraph has a line inside its quote again.
      if (item) paragraph = { depth: continued.depth, base: continued.base }
      else if (
        parser === "micromark" &&
        continued.quoted &&
        indent < 4 &&
        (mdx || !HTML_TAG_LINE.test(plain))
      ) {
        const delimiter = delimiterBelow(plain, 0, continued.depth)
        if (
          delimiter !== undefined &&
          splitRow(plain, 0, parser).length ===
            splitRow(delimiter, 0, parser).length
        )
          index = readTable(index, content(line), delimiter, continued.depth, 0)
      }
      continue
    }
    if (depth !== listDepth) [lists, listDepth] = [[], depth]
    while (lists.length && indent < lists.at(-1)!.column) lists.pop()
    let base = lists.at(-1)?.column ?? 0
    // Outside MDX, a line indented four columns past the list item it sits
    // in is an indented code block's or a paragraph's, and opens nothing.
    if (!mdx && indent >= base + 4) {
      if (!continued && indentedCode) code.add(index)
      paragraph = continued
      continue
    }
    if (
      THEMATIC_BREAK.test(plain) ||
      (continued && continued.depth === depth && /^=+\s*$/.test(plain))
    )
      continue

    let header = { text, start }
    let delimiter: string | undefined
    // markdown-it tries a table before a list item, so a line that would
    // open one heads a table there when the row below matches it.
    const whole = content(line)
    const asRow =
      item && parser === "markdown-it"
        ? delimiterBelow(whole.text, base)
        : undefined
    if (
      asRow !== undefined &&
      splitRow(whole.text, 0, parser).length ===
        splitRow(asRow, 0, parser).length
    ) {
      header = whole
      delimiter = asRow
    } else if (item) {
      // An item's content starts past its marker and the one to four
      // columns of space after it; one column when the item opens empty or
      // with code, which then opens nothing on this line.
      const marker = indent + item[0].length - item[1]!.length
      let space = 0
      for (const character of item[1]!)
        space += character === "\t" ? 4 - ((marker + space) % 4) : 1
      const empty = !plain.slice(item[0].length).trim()
      lists.push({
        kind: kind!,
        column: marker + (space >= 1 && space <= 4 && !empty ? space : 1),
      })
      base = lists.at(-1)!.column
      if (empty || space > 4) continue
    }
    if (delimiter === undefined) {
      const opened = fenceOpen(text)
      if (opened) {
        fence = { ...opened, depth, base }
        code.add(index)
        continue
      }
      if (!mdx) {
        const raw = htmlStart(text, continued !== undefined)
        if (raw) {
          if (raw.end === "blank" || !raw.end.test(text.slice(raw.from)))
            html = { end: raw.end, depth, base }
          code.add(index)
          continue
        }
      }
      // markdown-it tries a table before a heading too.
      const heading = HEADING.test(text)
      if (heading && parser !== "markdown-it") continue
      // markdown-it tries a table before a container's `:::` too.
      paragraph =
        heading || (parser === "markdown-it" && CONTAINER.test(text))
          ? undefined
          : {
              depth,
              base,
              ...(depth > 0 &&
                base === 0 &&
                quotedAtStart(line) && { quoted: true }),
            }
      delimiter = delimiterBelow(text, base)
      // micromark never takes a line of tags alone as a header. Outside MDX
      // the table it would start ends the paragraph and the tag opens raw
      // HTML, which runs to a blank line; in MDX the tags are a component
      // that ends the paragraph whatever follows.
      if (
        parser === "micromark" &&
        (mdx ? JSX_LINE : HTML_TAG_LINE).test(text)
      ) {
        if (mdx) paragraph = undefined
        else if (
          delimiter !== undefined &&
          splitRow(text, 0, parser).length ===
            splitRow(delimiter, 0, parser).length
        ) {
          paragraph = undefined
          html = { end: "blank", depth, base }
          code.add(index)
        }
        continue
      }
      if (delimiter === undefined) continue
    }

    index = readTable(index, header, delimiter, depth, base)
  }
  return { issues, tables, lines, code }
}
