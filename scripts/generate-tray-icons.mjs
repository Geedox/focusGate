/**
 * Generates the tray icons (the GodFirst open-book-and-star mark) as PNGs
 * using only Node built-ins — no binary assets or image tooling in the repo.
 *
 *   resources/trayTemplate.png     16x16  macOS menu bar (template image)
 *   resources/trayTemplate@2x.png  32x32  macOS retina variant
 *   resources/tray.png             32x32  Windows/Linux tray
 *
 * Run via `npm run icons` (safe to re-run anytime).
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pixelCoverage } from './logo.mjs'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    rgba.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => (raw[rowStart + 1 + i] = v))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Monochrome silhouette (black + alpha) — macOS tints template images. */
function drawMark(size) {
  const rgba = new Uint8Array(size * size * 4)
  const unit = size / 16
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const { star, book } = pixelCoverage(px, py, unit)
      const i = (py * size + px) * 4
      rgba[i] = 0
      rgba[i + 1] = 0
      rgba[i + 2] = 0
      rgba[i + 3] = Math.round(Math.min(1, star + book) * 255)
    }
  }
  return rgba
}

for (const [file, size] of [
  ['trayTemplate.png', 16],
  ['trayTemplate@2x.png', 32],
  ['tray.png', 32]
]) {
  writeFileSync(join(outDir, file), encodePng(size, drawMark(size)))
  console.log(`wrote resources/${file} (${size}x${size})`)
}
