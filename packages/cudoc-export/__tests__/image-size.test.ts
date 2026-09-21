/**
 * The four-format header reader Word depends on for image dimensions.
 *
 * Each fixture is built byte by byte from the format's own header layout, so
 * a test reads the same offsets the parser does rather than trusting a file.
 */

import { describe, it, expect } from "vitest"
import { imageSize } from "../src/image-size.js"

const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(33)
  bytes.write("\x89PNG\r\n\x1a\n", 0, "latin1")
  bytes.writeUInt32BE(13, 8)
  bytes.write("IHDR", 12, "latin1")
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

const gif = (width: number, height: number) => {
  const bytes = Buffer.alloc(26)
  bytes.write("GIF89a", 0, "latin1")
  bytes.writeUInt16LE(width, 6)
  bytes.writeUInt16LE(height, 8)
  return bytes
}

const bmp = (width: number, height: number) => {
  const bytes = Buffer.alloc(30)
  bytes.write("BM", 0, "latin1")
  bytes.writeInt32LE(width, 18)
  // Top-down bitmaps store a negative height.
  bytes.writeInt32LE(-height, 22)
  return bytes
}

const jpg = (width: number, height: number) => {
  // SOI, then an APP0 segment to skip, then a SOF0 frame header.
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0)])
  const sof0 = Buffer.alloc(11)
  sof0[0] = 0xff
  sof0[1] = 0xc0
  sof0.writeUInt16BE(9, 2)
  sof0[4] = 8
  sof0.writeUInt16BE(height, 5)
  sof0.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, Buffer.alloc(8)])
}

describe("imageSize", () => {
  it("reads a PNG header", () => {
    expect(imageSize(png(640, 480))).toEqual({
      type: "png",
      width: 640,
      height: 480,
    })
  })

  it("reads a GIF header", () => {
    expect(imageSize(gif(12, 34))).toEqual({
      type: "gif",
      width: 12,
      height: 34,
    })
  })

  it("reads a BMP header, including a top-down one", () => {
    expect(imageSize(bmp(300, 200))).toEqual({
      type: "bmp",
      width: 300,
      height: 200,
    })
  })

  it("walks JPEG segments to the frame header", () => {
    expect(imageSize(jpg(1024, 768))).toEqual({
      type: "jpg",
      width: 1024,
      height: 768,
    })
  })

  it("returns null for anything else, an SVG included", () => {
    expect(
      imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull()
    expect(imageSize(Buffer.alloc(4))).toBeNull()
  })
})
