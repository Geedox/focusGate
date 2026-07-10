import { describe, it, expect } from 'vitest'
import { takeSequential, totalVerses, PLAN_START, type Counts } from './plan'

// Tiny 2-book canon: book0 = [2, 3] verses per chapter, book1 = [1] verse.
const COUNTS: Counts = [
  [2, 3],
  [1]
]

describe('reading plan progression', () => {
  it('counts total verses', () => {
    expect(totalVerses(COUNTS)).toBe(6)
  })

  it('takes verses within one chapter', () => {
    const { refs, next, wrapped } = takeSequential(COUNTS, PLAN_START, 2)
    expect(refs).toEqual([
      { book: 0, chapter: 0, verse: 0 },
      { book: 0, chapter: 0, verse: 1 }
    ])
    expect(next).toEqual({ book: 0, chapter: 1, verse: 0 })
    expect(wrapped).toBe(false)
  })

  it('crosses chapter and book boundaries', () => {
    const { refs } = takeSequential(COUNTS, { book: 0, chapter: 1, verse: 2 }, 2)
    expect(refs).toEqual([
      { book: 0, chapter: 1, verse: 2 },
      { book: 1, chapter: 0, verse: 0 }
    ])
  })

  it('stops at the canon end, flags the wrap, and restarts from the top', () => {
    const { refs, next, wrapped } = takeSequential(COUNTS, { book: 1, chapter: 0, verse: 0 }, 5)
    expect(refs).toEqual([{ book: 1, chapter: 0, verse: 0 }]) // no spill into a new lap
    expect(wrapped).toBe(true)
    expect(next).toEqual(PLAN_START)
  })

  it('clamps a corrupt stored position to the start (fail open)', () => {
    const { refs } = takeSequential(COUNTS, { book: 99, chapter: 99, verse: 99 }, 1)
    expect(refs[0]).toEqual(PLAN_START)
  })

  it('handles empty canon and non-positive n', () => {
    expect(takeSequential([], PLAN_START, 5).refs).toEqual([])
    expect(takeSequential(COUNTS, PLAN_START, 0).refs).toEqual([])
  })
})
