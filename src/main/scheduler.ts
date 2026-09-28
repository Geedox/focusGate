import { powerMonitor } from 'electron'
import { EventEmitter } from 'node:events'
import { SHARING_POSTPONE_MS } from '@shared/ipc'
import { computeNextFire, evaluateTick, evaluateUsageTick } from './schedule-core'
import { isLocked, lockEvents, startLock } from './lock'
import { isScreenSharing } from './screen-share'
import { store } from './store'

/**
 * Scheduler shell: a tick loop over the pure schedule-core math.
 *
 * A 30s tick (instead of one long setTimeout) is deliberately dumb and
 * therefore robust: it survives sleep/wake, system clock changes, and DST
 * without special cases — every tick just asks "has nextFireAt been
 * crossed?". powerMonitor's resume event only makes the answer come faster
 * after wake; correctness doesn't depend on it.
 */

const TICK_MS = process.env['GODFIRST_TICK_MS']
  ? Math.max(50, Number(process.env['GODFIRST_TICK_MS']))
  : 30_000

const PAUSE_MS = 3_600_000 // "Pause for 1 hour"

/** Emits 'changed' when schedule status shifts; the tray subscribes. */
export const schedulerEvents = new EventEmitter()

let nextFireAt: number | null = null
let timer: NodeJS.Timeout | null = null

// --- screen-share postponement ------------------------------------------
// A due lock first asks "is the screen being shared?" (async, a few ms).
// While the answer is pending the trigger is held exactly like a pause; a
// "yes" holds it for SHARING_POSTPONE_MS and asks again; a "no" is cached
// briefly (SHARE_CLEAR_TTL_MS) so the very next tick can fire.
const SHARE_CLEAR_TTL_MS = 90_000
let sharingDeferredUntil: number | null = null
let shareCheckPending = false
let shareClearUntil = 0

// Active-use accumulator: lives in memory, persisted every few minutes and
// on suspend/quit (a crash costs at most a few minutes of counted use).
let activeUseMs = 0
let ticksSincePersist = 0
const PERSIST_EVERY_TICKS = 10

export function initScheduler(): void {
  activeUseMs = store.get('activeUseMs')
  recompute()
  timer = setInterval(tick, TICK_MS)
  // Not load-bearing (the tick would catch it within 30s) but makes the
  // catch-up immediate: a trigger that came due while the machine slept or
  // sat on the OS lock screen fires the moment the user is back.
  powerMonitor.on('resume', tick)
  powerMonitor.on('unlock-screen', tick)
  powerMonitor.on('suspend', persistUsage)
  powerMonitor.on('lock-screen', persistUsage)
  // ANY lock starting counts as the break — the usage clock starts over.
  lockEvents.on('changed', () => {
    if (isLocked()) {
      activeUseMs = 0
      persistUsage()
      sharingDeferredUntil = null // the lock happened after all (e.g. "Lock me now")
    }
  })
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
  persistUsage()
}

function persistUsage(): void {
  try {
    store.set('activeUseMs', activeUseMs)
  } catch (err) {
    console.error('[godfirst] could not persist usage counter', err)
  }
}

/** Call after the schedule config changes. */
export function rescheduleFromConfig(): void {
  recompute()
  schedulerEvents.emit('changed')
}

export function pauseForOneHour(): void {
  store.set('pausedUntil', Date.now() + PAUSE_MS)
  schedulerEvents.emit('changed')
}

export function resumeSchedule(): void {
  store.set('pausedUntil', null)
  schedulerEvents.emit('changed')
  tick() // a trigger crossed during the pause fires now (one catch-up)
}

export function isPaused(): boolean {
  const until = store.get('pausedUntil')
  return until !== null && Date.now() < until
}

/** True while a due lock is being held back because the screen is shared. */
export function isDeferredForSharing(): boolean {
  return sharingDeferredUntil !== null && Date.now() < sharingDeferredUntil
}

/** Drop any sharing hold (setting switched off, or "Lock me now"). */
export function clearSharingDeferral(): void {
  if (sharingDeferredUntil === null) return
  sharingDeferredUntil = null
  schedulerEvents.emit('changed')
}

export interface SchedulerStatus {
  nextFireAt: number | null
  pausedUntil: number | null
  /** Milliseconds of active use left before the usage trigger fires; null = trigger off. */
  usageRemainingMs: number | null
  /** A lock is due but held back until this epoch-ms because the screen is shared. */
  sharingDeferredUntil: number | null
}

export function getSchedulerStatus(): SchedulerStatus {
  const hours = store.get('schedule').activeUseHours
  return {
    nextFireAt,
    pausedUntil: isPaused() ? store.get('pausedUntil') : null,
    usageRemainingMs:
      hours !== null && hours > 0 ? Math.max(0, hours * 3_600_000 - activeUseMs) : null,
    sharingDeferredUntil: isDeferredForSharing() ? sharingDeferredUntil : null
  }
}

// --- internals -----------------------------------------------------------

function recompute(): void {
  nextFireAt = computeNextFire(Date.now(), store.get('schedule'), store.get('lastScheduledFire'))
}

/**
 * Ask the screen-share check whether a due lock may fire. Returns true when
 * the lock must be held this tick (answer pending, or sharing confirmed).
 */
function holdForScreenSharing(now: number): boolean {
  if (!store.get('postponeWhileSharing')) return false
  if (now < shareClearUntil) return false // a recent check said "not sharing"
  if (isDeferredForSharing()) return true
  if (!shareCheckPending) {
    shareCheckPending = true
    const check =
      process.env['GODFIRST_FAKE_SHARING'] !== undefined // autotest hook
        ? Promise.resolve(process.env['GODFIRST_FAKE_SHARING'] === '1')
        : isScreenSharing()
    void check.then((sharing) => {
      shareCheckPending = false
      if (sharing) {
        sharingDeferredUntil = Date.now() + SHARING_POSTPONE_MS
        console.log(
          `[godfirst] screen is being shared — lock postponed ${Math.round(SHARING_POSTPONE_MS / 60_000)} min`
        )
        schedulerEvents.emit('changed')
      } else {
        shareClearUntil = Date.now() + SHARE_CLEAR_TTL_MS
        tick() // fire now rather than waiting for the next tick
      }
    })
  }
  return true
}

function tick(): void {
  const now = Date.now()

  // An expired pause cleans itself up (so the tray stops saying "paused").
  const until = store.get('pausedUntil')
  if (until !== null && now >= until) {
    store.set('pausedUntil', null)
    schedulerEvents.emit('changed')
  }
  // An expired sharing hold likewise: the next due check happens below.
  if (sharingDeferredUntil !== null && now >= sharingDeferredUntil) {
    sharingDeferredUntil = null
    schedulerEvents.emit('changed')
  }

  const hours = store.get('schedule').activeUseHours
  const idleSeconds = process.env['GODFIRST_FAKE_IDLE'] // autotest hook
    ? Number(process.env['GODFIRST_FAKE_IDLE'])
    : powerMonitor.getSystemIdleTime()
  const thresholdMs = hours !== null && hours > 0 ? hours * 3_600_000 : null
  const paused = isPaused()
  const locked = isLocked()

  // Would anything fire this tick? (Dry run: nothing is assigned yet.) If so,
  // and the screen-share check hasn't cleared it, hold the trigger like a
  // pause — the trigger stays pending and fires once the hold lifts.
  const dryUsage = evaluateUsageTick({
    activeUseMs,
    thresholdMs,
    idleSeconds,
    tickMs: TICK_MS,
    paused,
    locked
  })
  const dueUsage = dryUsage.action === 'fire'
  const dueClock = evaluateTick({ now, nextFireAt, paused, locked }) === 'fire'
  const held = (dueUsage || dueClock) && holdForScreenSharing(now)

  // --- usage-based trigger (hours of active use) ---
  const usage = evaluateUsageTick({
    activeUseMs,
    thresholdMs,
    idleSeconds,
    tickMs: TICK_MS,
    paused: paused || held,
    locked
  })
  activeUseMs = usage.activeUseMs
  if (++ticksSincePersist >= PERSIST_EVERY_TICKS) {
    ticksSincePersist = 0
    persistUsage()
  }
  if (usage.action === 'fire') {
    console.log(`[godfirst] ${hours}h of active use reached — locking`)
    persistUsage()
    schedulerEvents.emit('changed')
    startLock('active-use')
    return // the lock consumes this tick; clock triggers get the next one
  }

  // --- wall-clock triggers (times of day + interval) ---
  const action = evaluateTick({
    now,
    nextFireAt,
    paused: paused || held,
    locked
  })

  if (action === 'none') return

  // Both 'fire' and 'consume' advance the interval anchor: the trigger was
  // dealt with (locked now, or already locked), never queued.
  store.set('lastScheduledFire', now)
  recompute()
  schedulerEvents.emit('changed')

  if (action === 'fire') {
    console.log('[godfirst] scheduled lock firing')
    startLock('scheduled')
  } else {
    console.log('[godfirst] scheduled trigger crossed while locked — consumed')
  }
}
