/**
 * The review-note data model.
 *
 * A note is a W3C Web Annotation with a `cudoc` extension, and a file of notes
 * is an `AnnotationCollection`. Everything that arrives from outside a page or
 * the CLI (a downloaded file, a URL fragment, the block embedded in a saved
 * copy, browser storage) is untrusted, so it passes through `parseCollection`,
 * which copies only the fields it knows into fresh objects and refuses
 * anything oversized. This module imports neither Node nor the DOM, because
 * the browser runtime and the CLI share it.
 */

export const ANNOTATION_CONTEXT = "http://www.w3.org/ns/anno.jsonld"

/** The id of the JSON block a saved copy carries its notes in. */
export const EMBEDDED_DATA_ID = "cudoc-annotations-data"

/** The URL fragment parameter a share token travels in. */
export const FRAGMENT_KEY = "cudoc-notes"

export type TextQuoteSelector = {
  type: "TextQuoteSelector"
  exact: string
  prefix?: string
  suffix?: string
}
/** Offsets into the text index of the page's `main`. */
export type TextPositionSelector = {
  type: "TextPositionSelector"
  start: number
  end: number
}
/** `[data-cudoc-block="<block id>"]`, the block the note was made in. */
export type CssSelector = { type: "CssSelector"; value: string }
export type AnnotationSelector =
  TextQuoteSelector | TextPositionSelector | CssSelector

export type AnnotationMotivation = "commenting" | "highlighting" | "replying"
export type AnnotationBody = {
  type: "TextualBody"
  value: string
  format: "text/plain"
  purpose: "commenting" | "replying"
}
export type AnnotationState = "open" | "resolved"
export type AnnotationScope = "text" | "block"

export type CudocExtension = {
  /** The document id, repeated from `target.source`. */
  document: string
  /** The document's stored-tree hash at the time the note was made. */
  astHash: string
  sourceHash: string
  /** The `data-cudoc-block` value of the block the note was made in. */
  block: string
  /** The id of the nearest preceding heading; empty before the first one. */
  heading: string
  scope: AnnotationScope
  state: AnnotationState
  /** A reply names the note it answers; the thread is flat. */
  parent?: string
}

export type Annotation = {
  "@context": typeof ANNOTATION_CONTEXT
  type: "Annotation"
  id: string
  created: string
  modified: string
  creator?: { type: "Person"; name: string }
  motivation: AnnotationMotivation
  body: AnnotationBody[]
  target: { source: string; selector: AnnotationSelector[] }
  cudoc: CudocExtension
}

export type AnnotationCollection = {
  "@context": typeof ANNOTATION_CONTEXT
  type: "AnnotationCollection"
  generator: string
  total: number
  items: Annotation[]
}

/** Caps on anything read from outside. A file over them is refused whole. */
export const LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  fragmentChars: 64 * 1024,
  decodedBytes: 1024 * 1024,
  items: 500,
  body: 10 * 1024,
  exact: 2048,
  context: 64,
  name: 200,
  id: 200,
  hash: 128,
  selector: 300,
  date: 40,
} as const

export class AnnotationFormatError extends Error {
  override name = "AnnotationFormatError"
}

const fail = (message: string): never => {
  throw new AnnotationFormatError(`annotations: ${message}`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown, max: number, field: string): string => {
  if (typeof value !== "string") fail(`${field} must be a string`)
  if ((value as string).length > max) fail(`${field} is longer than ${max}`)
  return value as string
}

const optionalText = (
  value: unknown,
  max: number,
  field: string,
): string | undefined =>
  value === undefined || value === null ? undefined : text(value, max, field)

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T => {
  if (typeof value !== "string" || !allowed.includes(value as T))
    fail(`${field} must be one of ${allowed.join(", ")}`)
  return value as T
}

const offset = (value: unknown, field: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0x7fffffff
  )
    fail(`${field} must be a non-negative integer`)
  return value as number
}

const date = (value: unknown, field: string): string => {
  const raw = text(value, LIMITS.date, field)
  if (Number.isNaN(Date.parse(raw))) fail(`${field} must be an ISO 8601 date`)
  return raw
}

const hasContext = (value: unknown): boolean =>
  value === ANNOTATION_CONTEXT ||
  (Array.isArray(value) && value.includes(ANNOTATION_CONTEXT))

function parseSelector(input: unknown): AnnotationSelector | undefined {
  if (!isRecord(input)) fail("selector must be an object")
  const record = input as Record<string, unknown>
  switch (record.type) {
    case "TextQuoteSelector": {
      const selector: TextQuoteSelector = {
        type: "TextQuoteSelector",
        exact: text(record.exact, LIMITS.exact, "selector.exact"),
      }
      const prefix = optionalText(
        record.prefix,
        LIMITS.context,
        "selector.prefix",
      )
      const suffix = optionalText(
        record.suffix,
        LIMITS.context,
        "selector.suffix",
      )
      if (prefix !== undefined) selector.prefix = prefix
      if (suffix !== undefined) selector.suffix = suffix
      return selector
    }
    case "TextPositionSelector": {
      const start = offset(record.start, "selector.start")
      const end = offset(record.end, "selector.end")
      if (end < start) fail("selector.end must not precede selector.start")
      return { type: "TextPositionSelector", start, end }
    }
    case "CssSelector":
      return {
        type: "CssSelector",
        value: text(record.value, LIMITS.selector, "selector.value"),
      }
    default:
      // A selector from another tool is dropped rather than refused, so a
      // file that also carries the three we read still loads.
      return undefined
  }
}

function parseBody(input: unknown): AnnotationBody {
  if (!isRecord(input)) fail("body must be an object")
  const record = input as Record<string, unknown>
  if (record.type !== "TextualBody") fail("body.type must be TextualBody")
  if (record.format !== undefined && record.format !== "text/plain")
    fail("body.format must be text/plain")
  return {
    type: "TextualBody",
    value: text(record.value, LIMITS.body, "body.value"),
    format: "text/plain",
    purpose: oneOf(
      record.purpose ?? "commenting",
      ["commenting", "replying"],
      "body.purpose",
    ),
  }
}

function parseExtension(input: unknown, source: string): CudocExtension {
  if (!isRecord(input)) fail("cudoc must be an object")
  const record = input as Record<string, unknown>
  const document = text(record.document ?? source, LIMITS.id, "cudoc.document")
  const extension: CudocExtension = {
    document,
    astHash: text(record.astHash ?? "", LIMITS.hash, "cudoc.astHash"),
    sourceHash: text(record.sourceHash ?? "", LIMITS.hash, "cudoc.sourceHash"),
    block: text(record.block ?? "", LIMITS.selector, "cudoc.block"),
    heading: text(record.heading ?? "", LIMITS.selector, "cudoc.heading"),
    scope: oneOf(record.scope ?? "text", ["text", "block"], "cudoc.scope"),
    state: oneOf(record.state ?? "open", ["open", "resolved"], "cudoc.state"),
  }
  const parent = optionalText(record.parent, LIMITS.id, "cudoc.parent")
  if (parent !== undefined) extension.parent = parent
  return extension
}

/** Copies one annotation into a fresh object, refusing what it does not know. */
export function parseAnnotation(input: unknown): Annotation {
  if (!isRecord(input)) fail("an annotation must be an object")
  const record = input as Record<string, unknown>
  if (record.type !== "Annotation") fail("type must be Annotation")
  if (!isRecord(record.target)) fail("target must be an object")
  const target = record.target as Record<string, unknown>
  const source = text(target.source, LIMITS.id, "target.source")
  const rawSelectors = Array.isArray(target.selector)
    ? target.selector
    : target.selector === undefined
      ? []
      : [target.selector]
  const selectors = rawSelectors
    .map(parseSelector)
    .filter((s): s is AnnotationSelector => s !== undefined)
  if (!selectors.some((s) => s.type === "TextQuoteSelector"))
    fail("target.selector must include a TextQuoteSelector")
  const bodies = Array.isArray(record.body)
    ? record.body
    : record.body === undefined
      ? []
      : [record.body]
  const created = date(record.created, "created")
  const annotation: Annotation = {
    "@context": ANNOTATION_CONTEXT,
    type: "Annotation",
    id: text(record.id, LIMITS.id, "id"),
    created,
    modified:
      record.modified === undefined
        ? created
        : date(record.modified, "modified"),
    motivation: oneOf(
      record.motivation ?? "commenting",
      ["commenting", "highlighting", "replying"],
      "motivation",
    ),
    body: bodies.map(parseBody),
    target: { source, selector: selectors },
    cudoc: parseExtension(record.cudoc ?? {}, source),
  }
  if (!annotation.id) fail("id must not be empty")
  if (isRecord(record.creator)) {
    const name = text(
      (record.creator as Record<string, unknown>).name,
      LIMITS.name,
      "creator.name",
    )
    if (name) annotation.creator = { type: "Person", name }
  }
  return annotation
}

/**
 * Validates a parsed JSON document: an `AnnotationCollection`, or a single
 * `Annotation`, which is wrapped. Throws `AnnotationFormatError`.
 */
export function parseCollection(
  input: unknown,
  generator = "unknown",
): AnnotationCollection {
  if (!isRecord(input)) fail("the file must hold a JSON object")
  const record = input as Record<string, unknown>
  if (!hasContext(record["@context"]))
    fail(`@context must include ${ANNOTATION_CONTEXT}`)
  if (record.type === "Annotation")
    return collection([parseAnnotation(record)], generator)
  if (record.type !== "AnnotationCollection")
    fail("type must be AnnotationCollection")
  const items = record.items
  if (!Array.isArray(items)) fail("items must be an array")
  const list = items as unknown[]
  if (list.length > LIMITS.items)
    fail(`a file holds at most ${LIMITS.items} notes`)
  return collection(
    list.map(parseAnnotation),
    typeof record.generator === "string" &&
      record.generator.length <= LIMITS.name
      ? record.generator
      : generator,
  )
}

export function collection(
  items: readonly Annotation[],
  generator: string,
): AnnotationCollection {
  return {
    "@context": ANNOTATION_CONTEXT,
    type: "AnnotationCollection",
    generator,
    total: items.length,
    items: [...items],
  }
}

/**
 * Merges lists by id, the later `modified` winning, in `created` order. A
 * page loads its embedded block, its browser storage and an accepted share
 * token through this, so the same note arriving twice stays one note.
 */
export function mergeAnnotations(
  ...lists: readonly (readonly Annotation[])[]
): Annotation[] {
  const byId = new Map<string, Annotation>()
  for (const list of lists)
    for (const item of list) {
      const current = byId.get(item.id)
      if (!current || current.modified <= item.modified) byId.set(item.id, item)
    }
  return [...byId.values()].sort(
    (a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id),
  )
}

export type AnnotationThread = { root: Annotation; replies: Annotation[] }

/** Roots with their replies; a reply whose parent is absent stands alone. */
export function threads(items: readonly Annotation[]): AnnotationThread[] {
  const ids = new Set(items.map((item) => item.id))
  const roots = items.filter(
    (item) => !item.cudoc.parent || !ids.has(item.cudoc.parent),
  )
  return roots.map((root) => ({
    root,
    replies: items.filter((item) => item.cudoc.parent === root.id),
  }))
}
