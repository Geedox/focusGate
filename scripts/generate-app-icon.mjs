/**
 * Generates build/icon.png (1024×1024): the GodFirst mark — a white open
 * book beneath a gold eight-point star — on a deep indigo-to-emerald tile
 * (the two texts' theme colors meeting). electron-builder derives the
 * platform formats (.icns / .ico) from it at package time.
 *
 *   node scripts/generate-app-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pixelCoverage } from './logo.mjs'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
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

const SIZE = 1024
const rgba = new Uint8Array(SIZE * SIZE * 4)
const SS = 3
const unit = SIZE / 16

// macOS icon grid: rounded tile occupying ~82% of the canvas.
const TILE = { min: 16 * 0.09, max: 16 * 0.91, r: 16 * 0.185 }

function tileCoverage(px, py) {
  let hits = 0
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / unit
      const y = (py + (sy + 0.5) / SS) / unit
      const { min, max, r } = TILE
      if (x < min || x > max || y < min || y > max) continue
      const cx = Math.min(Math.max(x, min + r), max - r)
      const cy = Math.min(Math.max(y, min + r), max - r)
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r || (x >= min + r && x <= max - r) || (y >= min + r && y <= max - r)) {
        hits++
      }
    }
  }
  return hits / (SS * SS)
}

// The mark sits slightly high in the tile; scale it into the tile's frame.
// Map tile-space: logo grid 16 units → centered 11.5-unit box inside tile.
function markCoverage(px, py) {
  const scale = 0.72 // logo units per tile unit
  const cx = SIZE / 2
  const cy = SIZE / 2 + SIZE * 0.015
  const lpx = (px - cx) / scale + (16 / 2) * unit
  const lpy = (py - cy) / scale + (16 / 2) * unit
  return pixelCoverage(lpx, lpy, unit, SS)
}

const GOLD = [232, 186, 92]
const WHITE = [245, 246, 248]

for (let py = 0; py < SIZE; py++) {
  // Tile gradient: indigo night (top) → deep emerald (bottom) — the Bible
  // and Quran theme colors meeting in one mark.
  const t = py / SIZE
  const bg = [
    Math.round(16 + (5 - 16) * t),
    Math.round(14 + (26 - 14) * t),
    Math.round(38 + (30 - 38) * t)
  ]
  for (let px = 0; px < SIZE; px++) {
    const tile = tileCoverage(px, py)
    const { star, book } = markCoverage(px, py)
    const i = (py * SIZE + px) * 4
    let r = bg[0]
    let g = bg[1]
    let b = bg[2]
    if (book > 0) {
      r = r * (1 - book) + WHITE[0] * book
      g = g * (1 - book) + WHITE[1] * book
      b = b * (1 - book) + WHITE[2] * book
    }
    if (star > 0) {
      r = r * (1 - star) + GOLD[0] * star
      g = g * (1 - star) + GOLD[1] * star
      b = b * (1 - star) + GOLD[2] * star
    }
    rgba[i] = Math.round(r)
    rgba[i + 1] = Math.round(g)
    rgba[i + 2] = Math.round(b)
    rgba[i + 3] = Math.round(tile * 255)
  }
}

writeFileSync(join(outDir, 'icon.png'), encodePng(SIZE, rgba))
console.log('wrote build/icon.png (1024x1024)')
