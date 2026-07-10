import type { StreakState } from '@shared/ipc'

/**
 * Pure streak math (dates injected as local YYYY-MM-DD strings).
 *
 * Semantics: a day counts once, however many sessions were completed. The
 * streak survives overnight — if the last completion was yesterday it is
 * still "alive" (today's reading just hasn't happened yet); a full missed
 * day breaks it.
 */

export function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function yesterdayOf(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

/** Advance on a completed session. Idempotent within the same day. */
export function advanceStreak(state: StreakState, today: string, yesterday: string): StreakState {
  if (state.lastDate === today) return state // already counted today
  const current = state.lastDate === yesterday ? state.current + 1 : 1
  return { current, best: Math.max(state.best, current), lastDate: today }
}

/** What to display: 0 once a full day has been missed. */
export function effectiveStreak(state: StreakState, today: string, yesterday: string): number {
  if (state.lastDate === today || state.lastDate === yesterday) return state.current
  return 0
}
