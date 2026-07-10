import { describe, it, expect } from 'vitest'
import {
  ACTIVE_IDLE_CUTOFF_SECONDS,
  computeNextFire,
  evaluateTick,
  evaluateUsageTick,
  parseTimeOfDay
} from './schedule-core'

// Fixed local reference: 2026-07-09 10:30:00 local time.
const NOW = new Date(2026, 6, 9, 10, 30, 0).getTime()
const HOUR = 3_600_000

describe('parseTimeOfDay', () => {
  it('parses valid times', () => {
    expect(parseTimeOfDay('07:00')).toBe(420)
    expect(parseTimeOfDay('23:59')).toBe(23 * 60 + 59)
    expect(parseTimeOfDay('0:05')).toBe(5)
  })
  it('rejects malformed input', () => {
    expect(parseTimeOfDay('24:00')).toBeNull()
    expect(parseTimeOfDay('12:60')).toBeNull()
    expect(parseTimeOfDay('noon')).toBeNull()
    expect(parseTimeOfDay('7')).toBeNull()
  })
})

describe('computeNextFire', () => {
  it('returns null with nothing scheduled', () => {
    expect(computeNextFire(NOW, { times: [], intervalHours: null }, null)).toBeNull()
  })

  it('picks the next time-of-day today', () => {
    const next = computeNextFire(NOW, { times: ['21:00'], intervalHours: null }, null)
    expect(next).toBe(new Date(2026, 6, 9, 21, 0, 0).getTime())
  })

  it('rolls a passed time-of-day to tomorrow', () => {
    const next = computeNextFire(NOW, { times: ['07:00'], intervalHours: null }, null)
    expect(next).toBe(new Date(2026, 6, 10, 7, 0, 0).getTime())
  })

  it('picks the earliest of several times', () => {
    const next = computeNextFire(NOW, { times: ['07:00', '11:00', '21:00'], intervalHours: null }, null)
    expect(next).toBe(new Date(2026, 6, 9, 11, 0, 0).getTime())
  })

  it('anchors a fresh interval on now', () => {
    expect(computeNextFire(NOW, { times: [], intervalHours: 3 }, null)).toBe(NOW + 3 * HOUR)
  })

  it('anchors a running interval on the last fire (past due = catch-up)', () => {
    const anchor = NOW - 5 * HOUR
    expect(computeNextFire(NOW, { times: [], intervalHours: 3 }, anchor)).toBe(anchor + 3 * HOUR)
  })

  it('combines times and interval, earliest wins', () => {
    const next = computeNextFire(NOW, { times: ['12:00'], intervalHours: 1 }, null)
    expect(next).toBe(NOW + 1 * HOUR) // 11:30 beats 12:00
  })

  it('ignores malformed time entries rather than crashing', () => {
    const next = computeNextFire(NOW, { times: ['nonsense', '21:00'], intervalHours: null }, null)
    expect(next).toBe(new Date(2026, 6, 9, 21, 0, 0).getTime())
  })
})

describe('evaluateTick (the ≤1-catch-up invariant)', () => {
  const due = { nextFireAt: NOW - 1, paused: false, locked: false }

  it('fires when a trigger has been crossed', () => {
    expect(evaluateTick({ now: NOW, ...due })).toBe('fire')
  })

  it('does nothing before the trigger', () => {
    expect(evaluateTick({ now: NOW, nextFireAt: NOW + 1, paused: false, locked: false })).toBe(
      'none'
    )
    expect(evaluateTick({ now: NOW, nextFireAt: null, paused: false, locked: false })).toBe('none')
  })

  it('holds (does not consume) while paused, so pause-end fires one catch-up', () => {
    expect(evaluateTick({ now: NOW, ...due, paused: true })).toBe('none')
    // pause expired → same pending trigger now fires
    expect(evaluateTick({ now: NOW, ...due, paused: false })).toBe('fire')
  })

  it('consumes (never queues) a trigger crossed while already locked', () => {
    expect(evaluateTick({ now: NOW, ...due, locked: true })).toBe('consume')
  })

  it('a long sleep crossing many triggers still yields one fire, then future next', () => {
    // 26h sleep with a daily 07:00 + every-3h interval: whatever was missed,
    // there is only ONE nextFireAt to cross.
    expect(evaluateTick({ now: NOW, nextFireAt: NOW - 26 * HOUR, paused: false, locked: false })).toBe(
      'fire'
    )
    // After firing, the shell recomputes from now — strictly future:
    const next = computeNextFire(NOW, { times: ['07:00'], intervalHours: 3 }, NOW)
    expect(next).toBeGreaterThan(NOW)
  })
})

describe('evaluateUsageTick (lock after N hours of active use)', () => {
  const base = {
    thresholdMs: 3 * HOUR,
    idleSeconds: 5, // user active
    tickMs: 30_000,
    paused: false,
    locked: false
  }

  it('accumulates while the user is active', () => {
    const r = evaluateUsageTick({ ...base, activeUseMs: 0 })
    expect(r).toEqual({ activeUseMs: 30_000, action: 'none' })
  })

  it('does NOT accumulate while idle (unused weekend machine never fires)', () => {
    const r = evaluateUsageTick({
      ...base,
      activeUseMs: HOUR,
      idleSeconds: ACTIVE_IDLE_CUTOFF_SECONDS + 1
    })
    expect(r).toEqual({ activeUseMs: HOUR, action: 'none' })
  })

  it('does NOT accumulate while a lock is up', () => {
    const r = evaluateUsageTick({ ...base, activeUseMs: HOUR, locked: true })
    expect(r).toEqual({ activeUseMs: HOUR, action: 'none' })
  })

  it('fires at the threshold and resets', () => {
    const r = evaluateUsageTick({ ...base, activeUseMs: 3 * HOUR - 1000 })
    expect(r).toEqual({ activeUseMs: 0, action: 'fire' })
  })

  it('holds at the threshold while paused, then fires when the pause ends', () => {
    const paused = evaluateUsageTick({ ...base, activeUseMs: 3 * HOUR, paused: true })
    expect(paused).toEqual({ activeUseMs: 3 * HOUR, action: 'none' }) // capped, no fire
    const resumed = evaluateUsageTick({ ...base, activeUseMs: paused.activeUseMs })
    expect(resumed.action).toBe('fire')
  })

  it('holds (never fires) while locked even past the threshold', () => {
    const r = evaluateUsageTick({ ...base, activeUseMs: 3 * HOUR, locked: true })
    expect(r.action).toBe('none')
    expect(r.activeUseMs).toBe(3 * HOUR)
  })

  it('disabled trigger does nothing', () => {
    const r = evaluateUsageTick({ ...base, activeUseMs: 99 * HOUR, thresholdMs: null })
    expect(r).toEqual({ activeUseMs: 99 * HOUR, action: 'none' })
  })
})
