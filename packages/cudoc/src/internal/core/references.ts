/**
 * Character references as CommonMark reads them, for hosts whose text keeps
 * them as the author wrote them.
 */
import { decodeNamedCharacterReference } from "decode-named-character-reference"
import { decodeNumericCharacterReference } from "micromark-util-decode-numeric-character-reference"

/** One reference at the start of a string. */
export const REFERENCE =
  /^&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([A-Za-z][A-Za-z\d]{1,31}));/

/**
 * What a reference stands for, as micromark decodes it: a number's code
 * point, U+FFFD for a control character, a surrogate, a noncharacter or one
 * out of range, or a name's text, which is one character or two. Undefined
 * for a name HTML does not define, which is text as written.
 */
export const referencedText = (
  reference: RegExpMatchArray,
): string | undefined => {
  if (reference[1]) return decodeNumericCharacterReference(reference[1], 10)
  if (reference[2]) return decodeNumericCharacterReference(reference[2], 16)
  return decodeNamedCharacterReference(reference[3]!) || undefined
}

const REFERENCES = new RegExp(REFERENCE.source.slice(1), "g")

/**
 * Text with every character reference CommonMark reads, `&copy;`, `&#169;`
 * or `&#xA9;`, replaced by what it stands for; a name HTML does not define
 * stays as written. For a host whose text keeps references as the author
 * wrote them, as VitePress's does so that Vue never reads a decoded `<`.
 */
export function decodeCharacterReferences(text: string): string {
  return text.replace(
    REFERENCES,
    (written, decimal, hexadecimal, name) =>
      referencedText([written, decimal, hexadecimal, name] as never) ?? written,
  )
}

/**
 * The character an `html` node stands for when it holds one character
 * reference and nothing else, as a VitePress library keeps a brace so that
 * Vue does not read it; undefined for any other node. Text extraction reads
 * such a node as that character.
 */
export function referencedCharacter(node: {
  type: string
  value?: unknown
}): string | undefined {
  if (node.type !== "html" || typeof node.value !== "string") return undefined
  const reference = new RegExp(`${REFERENCE.source}$`).exec(node.value)
  return reference ? referencedText(reference) : undefined
}
