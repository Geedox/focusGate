import { powerMonitor } from 'electron'
import { EventEmitter } from 'node:events'
import { computeNextFire, evaluateTick, evaluateUsageTick } from './schedule-core'
import { isLocked, lockEvents, startLock } from './lock'
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

export interface SchedulerStatus {
  nextFireAt: number | null
  pausedUntil: number | null
  /** Milliseconds of active use left before the usage trigger fires; null = trigger off. */
  usageRemainingMs: number | null
}

export function getSchedulerStatus(): SchedulerStatus {
  const hours = store.get('schedule').activeUseHours
  return {
    nextFireAt,
    pausedUntil: isPaused() ? store.get('pausedUntil') : null,
    usageRemainingMs:
      hours !== null && hours > 0 ? Math.max(0, hours * 3_600_000 - activeUseMs) : null
  }
}

// --- internals -----------------------------------------------------------

function recompute(): void {
  nextFireAt = computeNextFire(Date.now(), store.get('schedule'), store.get('lastScheduledFire'))
}

function tick(): void {
  const now = Date.now()

  // An expired pause cleans itself up (so the tray stops saying "paused").
  const until = store.get('pausedUntil')
  if (until !== null && now >= until) {
    store.set('pausedUntil', null)
    schedulerEvents.emit('changed')
  }

  // --- usage-based trigger (hours of active use) ---
  const hours = store.get('schedule').activeUseHours
  const idleSeconds = process.env['GODFIRST_FAKE_IDLE'] // autotest hook
    ? Number(process.env['GODFIRST_FAKE_IDLE'])
    : powerMonitor.getSystemIdleTime()
  const usage = evaluateUsageTick({
    activeUseMs,
    thresholdMs: hours !== null && hours > 0 ? hours * 3_600_000 : null,
    idleSeconds,
    tickMs: TICK_MS,
    paused: isPaused(),
    locked: isLocked()
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
    paused: isPaused(),
    locked: isLocked()
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
