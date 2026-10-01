/**
 * The text markdown-it reads from a source, and a map from offsets in it back
 * to the source's. Before it parses, markdown-it turns every `\r\n` and lone
 * `\r` into `\n` and every NUL into U+FFFD, so its offsets count in that
 * text; they differ from the source's only after a `\r\n` it made one
 * character of.
 */
export function markdownItText(source: string): {
  text: string
  toSource: (offset: number) => number
} {
  // Where each `\n` that was a `\r\n` stands in the text markdown-it reads.
  const joined: number[] = []
  for (
    let at = source.indexOf("\r\n");
    at !== -1;
    at = source.indexOf("\r\n", at + 2)
  )
    joined.push(at - joined.length)
  const text = source.replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD")
  return {
    text,
    toSource: (offset) => {
      let low = 0
      let high = joined.length
      while (low < high) {
        const middle = (low + high) >> 1
        if (joined[middle]! < offset) low = middle + 1
        else high = middle
      }
      return offset + low
    },
  }
}
