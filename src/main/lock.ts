import { BrowserWindow, app, globalShortcut, powerSaveBlocker, screen } from 'electron'
import { EventEmitter } from 'node:events'
import { store } from './store'
import { PRELOAD_PATH, loadRenderer } from './windows'

/**
 * The lock core. Design rules (see README / master brief):
 *
 *  - FAIL OPEN, NEVER FAIL LOCKED. Every teardown step is individually
 *    guarded; any error while starting a lock tears the whole thing down.
 *  - The watchdog flag (`lockActive` in electron-store) is set while a lock
 *    is active so a crash/forced-restart restores the lock on next boot.
 *  - OS-protected escapes (Ctrl+Alt+Del on Windows, the hardware power
 *    button and Cmd+Ctrl+Q system lock on macOS) are DELIBERATELY not
 *    blocked — they are OS territory and serve as ultimate escape hatches.
 */

export type UnlockReason =
  | 'activity-complete' // the real path
  | 'break-glass' // OS-password or force escape
  | 'dev'
  | 'error' // fail-open teardown

/** Emits 'changed' whenever lock state flips; the tray subscribes. */
export const lockEvents = new EventEmitter()

let overlays: BrowserWindow[] = []
let locked = false
let powerBlockerId: number | null = null
let rebuildTimer: NodeJS.Timeout | null = null

export function isLocked(): boolean {
  return locked
}

export function startLock(reason: 'manual' | 'restore' | 'scheduled' | 'active-use'): void {
  if (locked) return
  // The break-glass escape is the user's own OS login password, which always
  // exists — so, unlike the old custom-passcode design, there is no state in
  // which a lock could start with no way out. If OS verification is ever
  // unavailable at unlock time, the lock screen offers a force-escape.
  console.log(`[godfirst] lock starting (${reason})`)
  locked = true
  try {
    store.set('lockActive', true)
    swallowShortcuts()
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    createOverlays()
    watchDisplayChanges(true)
    lockEvents.emit('changed')
  } catch (err) {
    // Fail open: a half-started lock is torn down, never left dangling.
    console.error('[godfirst] lock failed to start — failing open', err)
    endLock('error')
  }
}

/** Idempotent, never throws: each step guarded so one failure can't stop
 *  the others from freeing the user. */
export function endLock(reason: UnlockReason): void {
  if (!locked && overlays.length === 0) return
  console.log(`[godfirst] unlocking (${reason})`)
  locked = false

  try {
    store.set('lockActive', false)
  } catch (err) {
    console.error('[godfirst] could not clear lockActive', err)
  }
  try {
    globalShortcut.unregisterAll()
  } catch (err) {
    console.error('[godfirst] could not unregister shortcuts', err)
  }
  try {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId)
    }
  } catch (err) {
    console.error('[godfirst] could not stop power blocker', err)
  } finally {
    powerBlockerId = null
  }
  watchDisplayChanges(false)
  for (const win of overlays) {
    try {
      // destroy() bypasses the close-prevention handler below.
      if (!win.isDestroyed()) win.destroy()
    } catch (err) {
      console.error('[godfirst] could not destroy overlay window', err)
    }
  }
  overlays = []
  lockEvents.emit('changed')
}

/** Called once on boot: restores a lock that was active when the app died. */
export function restoreLockIfNeeded(): void {
  try {
    if (store.get('lockActive')) {
      console.log('[godfirst] watchdog: lock was active at last shutdown — restoring')
      startLock('restore')
    }
  } catch (err) {
    // Corrupt store: fail open and make sure the flag can't re-trigger.
    console.error('[godfirst] watchdog restore failed — failing open', err)
    endLock('error')
  }
}

// --- overlay windows ---------------------------------------------------

function createOverlays(): void {
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id

  for (const display of displays) {
    const isPrimary = display.id === primaryId
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      show: false,
      frame: false,
      backgroundColor: '#000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: PRELOAD_PATH
      }
    })

    // 'screen-saver' is the highest always-on-top level: covers the menu
    // bar, the Dock, and other apps' fullscreen windows.
    win.setAlwaysOnTop(true, 'screen-saver', 1)
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })

    if (process.platform === 'darwin') {
      // simpleFullScreen (pre-Spaces fullscreen) avoids macOS Spaces
      // animations/fights when covering multiple displays at once.
      win.setSimpleFullScreen(true)
    } else {
      win.setKiosk(true)
    }

    // Swallow window-close attempts while locked (Alt+F4 fallback, etc.).
    win.on('close', (event) => {
      if (locked) event.preventDefault()
    })

    if (isPrimary) {
      // Pull focus back if anything steals it (Cmd+Tab still switches apps —
      // the overlay stays on top regardless, but keep keyboard focus here so
      // Esc-hold and the passcode field keep working).
      win.on('blur', () => {
        if (locked && !win.isDestroyed()) win.focus()
      })
    }

    void loadRenderer(win, `lock?role=${isPrimary ? 'primary' : 'secondary'}`)

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.show()
      if (isPrimary) {
        win.focus()
        // Dock-less (accessory) apps don't always get key focus on show.
        app.focus({ steal: true })
      }
    })

    overlays.push(win)
  }
}

/** Displays plugged/unplugged mid-lock: rebuild all overlays (debounced). */
function watchDisplayChanges(enable: boolean): void {
  screen.removeListener('display-added', onDisplaysChanged)
  screen.removeListener('display-removed', onDisplaysChanged)
  if (enable) {
    screen.on('display-added', onDisplaysChanged)
    screen.on('display-removed', onDisplaysChanged)
  }
}

function onDisplaysChanged(): void {
  if (!locked) return
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    if (!locked) return
    console.log('[godfirst] displays changed mid-lock — rebuilding overlays')
    const old = overlays
    overlays = []
    try {
      createOverlays()
    } catch (err) {
      console.error('[godfirst] overlay rebuild failed — failing open', err)
      endLock('error')
      return
    }
    for (const win of old) {
      try {
        if (!win.isDestroyed()) win.destroy()
      } catch {
        /* already gone */
      }
    }
  }, 500)
}

// --- keyboard swallowing -----------------------------------------------

/**
 * Best-effort swallowing of app-switch/quit/hide chords while locked.
 *
 * macOS: globalShortcut cannot intercept truly system-reserved chords
 * (Cmd+Tab app switching, Mission Control, Cmd+Ctrl+Q). Full interception
 * would need a CGEvent tap native addon (Accessibility permission). Partial
 * coverage is acceptable for v1 because the overlay sits at screen-saver
 * level: switching apps still shows only black.
 *
 * Windows: Alt+Tab / Win-key suppression needs a low-level keyboard hook
 * (WH_KEYBOARD_LL) via a native addon; no maintained pure-npm package
 * exists. Stubbed: we register what globalShortcut allows and log the
 * degraded mode. The overlay still covers the screen either way.
 */
function swallowShortcuts(): void {
  const chords =
    process.platform === 'darwin'
      ? ['Command+Q', 'Command+W', 'Command+H', 'Command+M', 'Command+Option+H', 'Command+Tab']
      : ['Alt+F4', 'Alt+Tab', 'Super']

  const failed: string[] = []
  for (const chord of chords) {
    try {
      const ok = globalShortcut.register(chord, () => {
        /* swallow */
      })
      if (!ok) failed.push(chord)
    } catch {
      failed.push(chord)
    }
  }
  if (failed.length > 0) {
    console.log(
      `[godfirst] could not intercept (OS-reserved, degraded but safe): ${failed.join(', ')}`
    )
  }
}
