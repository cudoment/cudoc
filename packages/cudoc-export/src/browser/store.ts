/**
 * Where notes come from and go to. There is no server: the truth is a file
 * the reader downloads, and the browser's own storage is a convenience that
 * `file://` pages cannot rely on (Firefox refuses it there).
 */

import { jsonForScript } from "../annotations/core.js"
import {
  EMBEDDED_DATA_ID,
  FRAGMENT_KEY,
  LIMITS,
  collection,
  parseCollection,
  type Annotation,
  type AnnotationCollection,
} from "../annotations/model.js"

/** Notes embedded in this page by "save a copy with notes". */
export function readEmbedded(doc: Document = document): Annotation[] {
  const block = doc.getElementById(EMBEDDED_DATA_ID)
  if (!block) return []
  return parseText(block.textContent ?? "").items
}

/** Parses JSON text into a collection; the caller decides what a failure means. */
export function parseText(text: string): AnnotationCollection {
  if (text.length > LIMITS.fileBytes)
    throw new Error(
      `annotations: a file holds at most ${LIMITS.fileBytes} bytes`,
    )
  return parseCollection(JSON.parse(text))
}

/** Notes from a saved copy's HTML, read without running any of it. */
export function readAnnotatedHtml(html: string): AnnotationCollection {
  const parsed = new DOMParser().parseFromString(html, "text/html")
  const block = parsed.getElementById(EMBEDDED_DATA_ID)
  if (!block) throw new Error("annotations: this page carries no notes")
  return parseText(block.textContent ?? "")
}

const base64url = (bytes: Uint8Array): string => {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromBase64url = (text: string): Uint8Array => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function pipe(
  bytes: Uint8Array,
  stream: GenericTransformStream,
  limit: number,
): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(
      stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
    )
  const reader = source.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.length
    // Counted while it arrives, so an inflated payload stops here rather
    // than after it has filled memory.
    if (total > limit) {
      await reader.cancel()
      throw new Error(`annotations: a token decodes to at most ${limit} bytes`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/**
 * A share token: `z.` and deflated JSON, or `j.` and plain JSON where the
 * browser cannot compress. Both are base64url.
 */
export async function encodeToken(
  items: readonly Annotation[],
  generator: string,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(collection(items, generator)),
  )
  if (typeof CompressionStream === "function") {
    const deflated = await pipe(
      bytes,
      new CompressionStream("deflate-raw"),
      LIMITS.decodedBytes,
    )
    return `z.${base64url(deflated)}`
  }
  return `j.${base64url(bytes)}`
}

export async function decodeToken(
  token: string,
): Promise<AnnotationCollection> {
  if (token.length > LIMITS.fragmentChars)
    throw new Error(
      `annotations: a token holds at most ${LIMITS.fragmentChars} characters`,
    )
  const [kind, payload] = [token.slice(0, 2), token.slice(2)]
  if (!payload || (kind !== "z." && kind !== "j."))
    throw new Error("annotations: unrecognized token")
  let bytes = fromBase64url(payload)
  if (kind === "z.") {
    if (typeof DecompressionStream !== "function")
      throw new Error(
        "annotations: this browser cannot read a compressed token",
      )
    bytes = await pipe(
      bytes,
      new DecompressionStream("deflate-raw"),
      LIMITS.decodedBytes,
    )
  } else if (bytes.length > LIMITS.decodedBytes)
    throw new Error(
      `annotations: a token decodes to at most ${LIMITS.decodedBytes} bytes`,
    )
  return parseText(new TextDecoder().decode(bytes))
}

/** The token in the page's URL fragment, if any. */
export function tokenFromLocation(
  loc: Location = location,
): string | undefined {
  const fragment = loc.hash.startsWith("#") ? loc.hash.slice(1) : loc.hash
  for (const part of fragment.split("&")) {
    const [key, value] = part.split("=", 2)
    if (key === FRAGMENT_KEY && value) return decodeURIComponent(value)
  }
  return undefined
}

/** Drops the token from the URL so it is not stored in history or re-read. */
export function clearTokenFromLocation(): void {
  const fragment = location.hash.replace(/^#/, "")
  const kept = fragment
    .split("&")
    .filter((part) => part && !part.startsWith(`${FRAGMENT_KEY}=`))
    .join("&")
  try {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}${kept ? `#${kept}` : ""}`,
    )
  } catch {
    // A page that cannot rewrite its URL keeps the fragment; nothing else
    // depends on it once the reader has decided.
  }
}

/** The key one document's notes live under; the site id keeps exports apart. */
export const storageKey = (site: string, documentId: string): string =>
  `cudoc-annotations:${site}:${documentId}`

/** Browser storage is a convenience: absent, refused or full, the page goes on. */
export function readLocal(key: string): Annotation[] {
  try {
    const text = localStorage.getItem(key)
    return text ? parseText(text).items : []
  } catch {
    return []
  }
}

export function writeLocal(
  key: string,
  items: readonly Annotation[],
  generator: string,
): boolean {
  try {
    if (items.length)
      localStorage.setItem(key, JSON.stringify(collection(items, generator)))
    else localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function storageAvailable(): boolean {
  try {
    const probe = "cudoc-annotations:probe"
    localStorage.setItem(probe, "1")
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Hands the reader a file; the only way notes leave a `file://` page. */
export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * This page's HTML with the notes embedded, and without the runtime's own
 * UI: what the reader saves to keep the notes next to the document, or to
 * hand both over at once. Highlights are painted, not written into the DOM,
 * so the markup is the page as it was built.
 */
export function embeddedCopy(
  items: readonly Annotation[],
  generator: string,
  uiId: string,
  doc: Document = document,
): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement
  root.querySelector(`#${uiId}`)?.remove()
  root.querySelector(`#${EMBEDDED_DATA_ID}`)?.remove()
  for (const marked of Array.from(root.querySelectorAll(".cudoc-ann-marked")))
    marked.classList.remove("cudoc-ann-marked")
  const block = doc.createElement("script")
  block.type = "application/json"
  block.id = EMBEDDED_DATA_ID
  block.textContent = jsonForScript(collection(items, generator))
  ;(root.querySelector("body") ?? root).append(block)
  return `<!doctype html>\n${root.outerHTML}`
}
