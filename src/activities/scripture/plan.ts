/**
 * Pure math for the whole-canon reading plan (no I/O, no Electron): walk the
 * entire text sequentially, N verses per session, crossing chapter and book
 * boundaries, wrapping to the start when the canon is finished.
 */

export interface PlanPosition {
  book: number // 0-based
  chapter: number // 0-based
  verse: number // 0-based
}

/** counts[book][chapter] = number of verses in that chapter. */
export type Counts = number[][]

export const PLAN_START: PlanPosition = { book: 0, chapter: 0, verse: 0 }

export function totalVerses(counts: Counts): number {
  return counts.reduce((sum, book) => sum + book.reduce((s, c) => s + c, 0), 0)
}

/** A corrupt stored position falls back to the canon start (fail open). */
function clampPosition(pos: PlanPosition, counts: Counts): PlanPosition {
  const book = counts[pos.book] ? pos.book : 0
  const chapters = counts[book]!
  const chapter = chapters[pos.chapter] !== undefined ? pos.chapter : 0
  const verse = pos.verse >= 0 && pos.verse < chapters[chapter]! ? pos.verse : 0
  return { book, chapter, verse }
}

function increment(pos: PlanPosition, counts: Counts): { next: PlanPosition; wrapped: boolean } {
  let { book, chapter, verse } = pos
  verse++
  if (verse < counts[book]![chapter]!) return { next: { book, chapter, verse }, wrapped: false }
  verse = 0
  chapter++
  if (chapter < counts[book]!.length) return { next: { book, chapter, verse }, wrapped: false }
  chapter = 0
  book++
  if (book < counts.length) return { next: { book, chapter, verse }, wrapped: false }
  return { next: { book: 0, chapter: 0, verse: 0 }, wrapped: true }
}

export function takeSequential(
  counts: Counts,
  from: PlanPosition,
  n: number
): { refs: PlanPosition[]; next: PlanPosition; wrapped: boolean } {
  if (counts.length === 0 || n <= 0) return { refs: [], next: PLAN_START, wrapped: false }
  let pos = clampPosition(from, counts)
  let wrapped = false
  const refs: PlanPosition[] = []
  for (let i = 0; i < n; i++) {
    refs.push(pos)
    const step = increment(pos, counts)
    pos = step.next
    if (step.wrapped) {
      wrapped = true
      break // a session never spills past the canon end into a new lap
    }
  }
  return { refs, next: pos, wrapped }
}
