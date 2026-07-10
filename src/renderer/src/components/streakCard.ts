/**
 * Renders the shareable streak card (1200×630 PNG) entirely on-device with
 * canvas — no network, no assets. The GodFirst mark (open book + eight-point
 * star) is drawn with the same geometry as the app icon.
 */

const W = 1200
const H = 630
const GOLD = '#e8ba5c'
const WHITE = '#f5f6f8'

function drawEightPointStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (const angle of [0, Math.PI / 4]) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.fillRect(-r * 0.66, -r * 0.66, r * 1.32, r * 1.32)
    ctx.restore()
  }
}

/** The mark on the app's 16-unit grid, scaled by `unit` px per grid unit. */
function drawMark(ctx: CanvasRenderingContext2D, originX: number, originY: number, unit: number): void {
  const gx = (x: number): number => originX + x * unit
  const gy = (y: number): number => originY + y * unit

  // Gold eight-point star at (8, 3.9)
  ctx.fillStyle = GOLD
  drawEightPointStar(ctx, gx(8), gy(3.9), 1.55 * unit)

  // White open book: two sloping pages + center spine
  ctx.fillStyle = WHITE
  ctx.beginPath() // left page
  ctx.moveTo(gx(2.4), gy(8.55))
  ctx.lineTo(gx(7.75), gy(8.55 + 1.15))
  ctx.lineTo(gx(7.75), gy(12.35 + 1.15))
  ctx.lineTo(gx(2.4), gy(12.35))
  ctx.closePath()
  ctx.fill()
  ctx.beginPath() // right page
  ctx.moveTo(gx(13.6), gy(8.55))
  ctx.lineTo(gx(8.25), gy(8.55 + 1.15))
  ctx.lineTo(gx(8.25), gy(12.35 + 1.15))
  ctx.lineTo(gx(13.6), gy(12.35))
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(gx(7.64), gy(9.8), 0.72 * unit, 3.75 * unit) // spine
}

export async function renderStreakCard(current: number, best: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')

  // Background: the app-icon gradient (indigo night → deep emerald)
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#100e26')
  bg.addColorStop(1, '#051a17')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Faint decorative stars
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.fillStyle = WHITE
  for (const [x, y, r] of [
    [120, 120, 26], [1080, 90, 20], [200, 520, 18], [1040, 540, 28], [600, 60, 14]
  ] as const) {
    drawEightPointStar(ctx, x, y, r)
  }
  ctx.restore()

  // The mark, top center (16-unit grid ~13px/unit → ~208px wide)
  drawMark(ctx, W / 2 - 8 * 13, 42, 13)

  // Headline
  ctx.textAlign = 'center'
  ctx.fillStyle = WHITE
  ctx.font = 'bold 84px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText(`🔥 ${current}-day reading streak`, W / 2, 390)

  // Subline
  ctx.fillStyle = '#b9bcc4'
  ctx.font = '34px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText(
    best > current ? `and counting — best so far: ${best} days` : 'and counting — a new personal best',
    W / 2,
    448
  )

  // Footer
  ctx.fillStyle = GOLD
  ctx.font = '600 30px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('GodFirst', W / 2, 540)
  ctx.fillStyle = '#8a8d96'
  ctx.font = '24px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('put God first — one reading at a time', W / 2, 576)
  ctx.fillStyle = '#c9ccd4'
  ctx.font = '600 24px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('godfirst.me', W / 2, 608)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}
