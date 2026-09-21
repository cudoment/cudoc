/**
 * Intrinsic pixel dimensions for the four raster formats Word accepts.
 *
 * `docx` needs a size in pixels and will not read one from the file, and the
 * four headers are trivial to parse, so this stays in the repository rather
 * than pulling in a dependency for sixty lines of byte reading. Detection is by
 * magic bytes, never by extension.
 */

export type ImageInfo = {
  type: "png" | "jpg" | "gif" | "bmp"
  width: number
  height: number
}

export function imageSize(bytes: Buffer): ImageInfo | null {
  if (bytes.length < 26) return null
  if (
    bytes[0] === 0x89 &&
    bytes.toString("latin1", 1, 4) === "PNG" &&
    bytes.toString("latin1", 12, 16) === "IHDR"
  )
    return {
      type: "png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    }
  if (bytes.toString("latin1", 0, 3) === "GIF")
    return {
      type: "gif",
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
    }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d)
    return {
      type: "bmp",
      width: bytes.readInt32LE(18),
      height: Math.abs(bytes.readInt32LE(22)),
    }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]!
      // SOF0..SOF15, excluding the three that are not frame headers.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      )
        return {
          type: "jpg",
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        }
      offset += 2 + bytes.readUInt16BE(offset + 2)
    }
  }
  return null
}
