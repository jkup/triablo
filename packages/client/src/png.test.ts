import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { adler32, crc32, encodePng, zlibStored } from './png'

const ascii = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'ascii'))

describe('crc32', () => {
  it('matches the published test vector', () => {
    // The canonical check value for CRC-32: crc32("123456789") = 0xcbf43926.
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('adler32', () => {
  it('matches the published test vector', () => {
    // adler32("Wikipedia") = 0x11e60398.
    expect(adler32(ascii('Wikipedia'))).toBe(0x11e60398)
    expect(adler32(new Uint8Array(0))).toBe(1)
  })
})

describe('zlibStored', () => {
  it('produces a valid zlib stream that inflates back to the input', () => {
    const input = ascii('the quick brown fox')
    const inflated = inflateSync(Buffer.from(zlibStored(input)))
    expect(new Uint8Array(inflated)).toEqual(input)
  })

  it('splits inputs larger than one stored block', () => {
    const input = new Uint8Array(200_000)
    for (let i = 0; i < input.length; i++) input[i] = i % 251
    const inflated = inflateSync(Buffer.from(zlibStored(input)))
    expect(new Uint8Array(inflated)).toEqual(input)
  })

  it('handles empty input', () => {
    const inflated = inflateSync(Buffer.from(zlibStored(new Uint8Array(0))))
    expect(inflated.length).toBe(0)
  })
})

describe('encodePng', () => {
  const width = 3
  const height = 2
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = 10 * i
    pixels[i * 4 + 1] = 20
    pixels[i * 4 + 2] = 30
    pixels[i * 4 + 3] = 255
  }

  it('starts with the PNG signature and a well-formed IHDR', () => {
    const png = encodePng(width, height, pixels)

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // IHDR: length 13, type, then width/height as u32be.
    expect([...png.subarray(8, 16)]).toEqual([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    const view = new DataView(png.buffer, png.byteOffset)
    expect(view.getUint32(16)).toBe(width)
    expect(view.getUint32(20)).toBe(height)
    expect(png[24]).toBe(8) // bit depth
    expect(png[25]).toBe(6) // RGBA
  })

  it('round-trips pixels through the IDAT stream', () => {
    const png = encodePng(width, height, pixels)

    // IDAT begins after signature (8) + IHDR chunk (12 + 13). Read its length.
    const view = new DataView(png.buffer, png.byteOffset)
    const idatLength = view.getUint32(33)
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT')

    const filtered = new Uint8Array(inflateSync(Buffer.from(png.subarray(41, 41 + idatLength))))
    expect(filtered.length).toBe((width * 4 + 1) * height)
    for (let y = 0; y < height; y++) {
      expect(filtered[y * (width * 4 + 1)]).toBe(0) // filter type: None
      const row = filtered.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1))
      expect([...row]).toEqual([...pixels.subarray(y * width * 4, (y + 1) * width * 4)])
    }
  })

  it('has a valid CRC on every chunk', () => {
    const png = encodePng(width, height, pixels)
    const view = new DataView(png.buffer, png.byteOffset)

    let offset = 8
    const seen: string[] = []
    while (offset < png.length) {
      const length = view.getUint32(offset)
      const typeAndData = png.subarray(offset + 4, offset + 8 + length)
      const declaredCrc = view.getUint32(offset + 8 + length)
      expect(crc32(typeAndData)).toBe(declaredCrc)
      seen.push(String.fromCharCode(...png.subarray(offset + 4, offset + 8)))
      offset += 12 + length
    }
    expect(seen).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('is byte-deterministic', () => {
    const first = encodePng(width, height, pixels)
    const second = encodePng(width, height, pixels)
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
  })

  it('rejects a pixel buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8ClampedArray(3))).toThrow(/expected 16 bytes/)
  })
})
