import { describe, it, expect } from 'vitest'
import { advanceStreak, effectiveStreak, localDateString, yesterdayOf } from './streak'
import type { StreakState } from '@shared/ipc'

const fresh: StreakState = { current: 0, best: 0, lastDate: null }

describe('streak tracking', () => {
  it('first completion starts a 1-day streak', () => {
    const s = advanceStreak(fresh, '2026-07-10', '2026-07-09')
    expect(s).toEqual({ current: 1, best: 1, lastDate: '2026-07-10' })
  })

  it('multiple completions on the same day count once (idempotent)', () => {
    const s1 = advanceStreak(fresh, '2026-07-10', '2026-07-09')
    const s2 = advanceStreak(s1, '2026-07-10', '2026-07-09')
    expect(s2).toEqual(s1)
  })

  it('consecutive days grow the streak', () => {
    let s = advanceStreak(fresh, '2026-07-10', '2026-07-09')
    s = advanceStreak(s, '2026-07-11', '2026-07-10')
    s = advanceStreak(s, '2026-07-12', '2026-07-11')
    expect(s.current).toBe(3)
    expect(s.best).toBe(3)
  })

  it('a missed day resets current but keeps best', () => {
    let s = advanceStreak(fresh, '2026-07-10', '2026-07-09')
    s = advanceStreak(s, '2026-07-11', '2026-07-10')
    // skips the 12th entirely
    s = advanceStreak(s, '2026-07-13', '2026-07-12')
    expect(s.current).toBe(1)
    expect(s.best).toBe(2)
  })

  it('display: alive today and via yesterday, dead after a missed day', () => {
    const s = advanceStreak(fresh, '2026-07-10', '2026-07-09') // completed on the 10th
    expect(effectiveStreak(s, '2026-07-10', '2026-07-09')).toBe(1) // same day
    expect(effectiveStreak(s, '2026-07-11', '2026-07-10')).toBe(1) // next morning, still alive
    expect(effectiveStreak(s, '2026-07-12', '2026-07-11')).toBe(0) // a full day missed
  })

  it('date helpers handle month boundaries', () => {
    expect(localDateString(new Date(2026, 6, 1))).toBe('2026-07-01')
    expect(yesterdayOf(new Date(2026, 6, 1))).toBe('2026-06-30')
    expect(yesterdayOf(new Date(2026, 0, 1))).toBe('2025-12-31')
  })
})
