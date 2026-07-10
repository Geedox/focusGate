/**
 * The GodFirst mark: an open book (both faiths are traditions of a holy
 * book) beneath a rising eight-point star (a light motif shared by Islamic
 * geometry and Christian iconography — no explicit cross or crescent, so it
 * favors neither).
 *
 * Defined on a 16-unit grid; returns which part of the mark a point is in.
 */

/** @returns {'star' | 'book' | null} */
export function logoPart(x, y) {
  // Eight-point star: union of an axis-aligned square and a diamond.
  {
    const dx = Math.abs(x - 8)
    const dy = Math.abs(y - 3.9)
    if ((dx <= 1.0 && dy <= 1.0) || dx + dy <= 1.55) return 'star'
  }

  // Open book: two sloping pages meeting at a lower center spine (the V
  // notch at the top center is what makes it read as an open book).
  const PAGE_W = 5.35
  const SLOPE = 1.15
  if (x >= 2.4 && x <= 7.75) {
    const t = (x - 2.4) / PAGE_W
    if (y >= 8.55 + t * SLOPE && y <= 12.35 + t * SLOPE) return 'book'
  }
  if (x >= 8.25 && x <= 13.6) {
    const t = (13.6 - x) / PAGE_W
    if (y >= 8.55 + t * SLOPE && y <= 12.35 + t * SLOPE) return 'book'
  }
  // Spine filling the center gap, bottom-anchored.
  if (Math.abs(x - 8) <= 0.36 && y >= 9.8 && y <= 13.55) return 'book'

  return null
}

/**
 * Supersampled coverage of each part for one pixel.
 * @returns {{ star: number, book: number }} 0..1 coverage fractions
 */
export function pixelCoverage(px, py, unit, ss = 4) {
  let star = 0
  let book = 0
  for (let sy = 0; sy < ss; sy++) {
    for (let sx = 0; sx < ss; sx++) {
      const part = logoPart((px + (sx + 0.5) / ss) / unit, (py + (sy + 0.5) / ss) / unit)
      if (part === 'star') star++
      else if (part === 'book') book++
    }
  }
  const n = ss * ss
  return { star: star / n, book: book / n }
}
