import type { ScheduleConfig } from '@shared/ipc'

/**
 * Pure scheduling math (no Electron, no timers — time is injected).
 *
 * Model: the shell keeps one `nextFireAt` timestamp and calls evaluateTick()
 * periodically (and on wake-from-sleep). The invariant that prevents
 * missed-lock storms: crossing nextFireAt fires AT MOST ONCE, because
 * firing/consuming immediately recomputes nextFireAt strictly in the
 * future. A long sleep that crosses five triggers still wakes to a single
 * crossed timestamp → a single catch-up lock.
 */

/** "HH:MM" (24h) → minutes since midnight, or null if malformed. */
export function parseTimeOfDay(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Next occurrence of a time-of-day strictly after `now` (local time). */
function nextOccurrence(now: number, minutesSinceMidnight: number): number {
  const candidate = new Date(now)
  candidate.setHours(0, minutesSinceMidnight, 0, 0)
  if (candidate.getTime() <= now) {
    candidate.setDate(candidate.getDate() + 1)
    candidate.setHours(0, minutesSinceMidnight, 0, 0) // re-set across DST shifts
  }
  return candidate.getTime()
}

/**
 * Earliest upcoming trigger, or null when nothing is scheduled.
 * `anchor` is the last scheduled fire (null = anchor on `now`, i.e. a fresh
 * interval starts counting from boot/config time).
 *
 * Note: an interval whose anchor+interval is already in the past returns
 * that PAST timestamp — the tick loop turns it into one catch-up fire.
 */
export function computeNextFire(
  now: number,
  schedule: Pick<ScheduleConfig, 'times' | 'intervalHours'>,
  anchor: number | null
): number | null {
  const candidates: number[] = []

  for (const t of schedule.times) {
    const minutes = parseTimeOfDay(t)
    if (minutes !== null) candidates.push(nextOccurrence(now, minutes))
  }

  if (schedule.intervalHours !== null && schedule.intervalHours > 0) {
    candidates.push((anchor ?? now) + schedule.intervalHours * 3_600_000)
  }

  return candidates.length > 0 ? Math.min(...candidates) : null
}

export type TickAction = 'none' | 'fire' | 'consume'

/** A tick counts as "active use" if input happened this recently. */
export const ACTIVE_IDLE_CUTOFF_SECONDS = 60

/**
 * Usage-based trigger: accumulate active time and fire at the threshold.
 * Pure — the shell feeds in idle seconds from powerMonitor each tick.
 *
 * Rules:
 *  - Time accrues only when the user was recently active AND no lock is up
 *    (reading a lock isn't "use"). Idle time and sleep accrue nothing, so
 *    an unused weekend machine never fires.
 *  - While paused, time accrues but holds at the threshold; the end of the
 *    pause delivers the fire.
 *  - Firing resets the accumulator (the shell also resets it whenever ANY
 *    lock starts — a scheduled lock is a break too).
 */
export function evaluateUsageTick(state: {
  activeUseMs: number
  thresholdMs: number | null
  idleSeconds: number
  tickMs: number
  paused: boolean
  locked: boolean
}): { activeUseMs: number; action: 'none' | 'fire' } {
  if (state.thresholdMs === null || state.thresholdMs <= 0) {
    return { activeUseMs: state.activeUseMs, action: 'none' }
  }
  let ms = state.activeUseMs
  if (!state.locked && state.idleSeconds < ACTIVE_IDLE_CUTOFF_SECONDS) {
    ms += state.tickMs
  }
  if (ms >= state.thresholdMs && !state.paused && !state.locked) {
    return { activeUseMs: 0, action: 'fire' }
  }
  // Hold at the threshold while paused/locked so the counter can't balloon.
  return { activeUseMs: Math.min(ms, state.thresholdMs), action: 'none' }
}

/**
 * What to do on a tick:
 *  - 'none':    nothing due (or paused — a due trigger stays pending so the
 *               end of the pause delivers one catch-up fire)
 *  - 'fire':    start a scheduled lock, then recompute
 *  - 'consume': trigger crossed while already locked — pointless to queue
 *               another; skip it and recompute
 */
export function evaluateTick(state: {
  now: number
  nextFireAt: number | null
  paused: boolean
  locked: boolean
}): TickAction {
  if (state.nextFireAt === null || state.now < state.nextFireAt) return 'none'
  if (state.paused) return 'none'
  if (state.locked) return 'consume'
  return 'fire'
}
