/**
 * A minimal PNG encoder. Pure TypeScript, zero dependencies, platform-neutral.
 *
 * Emits 8-bit RGBA (color type 6), filter 0 on every scanline, and a zlib
 * stream of *stored* (uncompressed) deflate blocks. Stored blocks make the
 * output byte-deterministic by construction — no compressor heuristics, no
 * platform variance — which is what lets `npm run shot` promise
 * "same seed, same bytes". Files are larger than compressed PNGs; screenshots
 * are throwaway diagnostics, so nobody pays that cost for long.
 * See docs/decisions/0010.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ (bytes[i] as number)) & 0xff] as number) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function adler32(bytes: Uint8Array): number {
  const MOD = 65521
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + (bytes[i] as number)) % MOD
    b = (b + a) % MOD
  }
  return ((b << 16) | a) >>> 0
}

/** Wrap raw bytes in a zlib stream of stored (uncompressed) deflate blocks. */
export function zlibStored(data: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535
  const blockCount = Math.max(1, Math.ceil(data.length / MAX_BLOCK))
  const out = new Uint8Array(2 + blockCount * 5 + data.length + 4)
  let offset = 0

  // zlib header: deflate, 32K window, no preset dict, fastest-compression flag.
  out[offset++] = 0x78
  out[offset++] = 0x01

  for (let block = 0; block < blockCount; block++) {
    const start = block * MAX_BLOCK
    const end = Math.min(start + MAX_BLOCK, data.length)
    const length = end - start
    const isLast = block === blockCount - 1

    out[offset++] = isLast ? 1 : 0
    out[offset++] = length & 0xff
    out[offset++] = (length >> 8) & 0xff
    out[offset++] = ~length & 0xff
    out[offset++] = (~length >> 8) & 0xff
    out.set(data.subarray(start, end), offset)
    offset += length
  }

  writeUint32BE(out, offset, adler32(data))
  return out
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  writeUint32BE(out, 0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  writeUint32BE(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Encode row-major RGBA pixels (4 bytes per pixel) as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePng: expected ${width * height * 4} bytes for ${width}x${height} RGBA, got ${rgba.length}`,
    )
  }

  const ihdr = new Uint8Array(13)
  writeUint32BE(ihdr, 0, width)
  writeUint32BE(ihdr, 4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // no interlace

  // Each scanline is prefixed with filter type 0 (None).
  const stride = width * 4
  const filtered = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0
    filtered.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  const parts = [
    new Uint8Array(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(filtered)),
    chunk('IEND', new Uint8Array(0)),
  ]

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
