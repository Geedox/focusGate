import { app } from 'electron'
import { registerAssetProtocolHandler, registerAssetSchemeAsPrivileged } from './asset-protocol'
import { createTray, destroyTray } from './tray'
import { initAutostart, wasLaunchedHidden } from './autostart'
import { registerIpcHandlers } from './ipc'
import { endLock, isLocked, restoreLockIfNeeded } from './lock'
import { isOnboardingComplete, openOnboardingWindow } from './onboarding-window'
import { initScheduler } from './scheduler'
import { initUpdateCheck } from './update-check'
import { openSettingsWindow } from './settings-window'
import { maybeRunAutotest } from './autotest'

/**
 * GodFirst boots as a background/tray app: no window is ever created on
 * launch (except the restored lock overlay if the watchdog flag is set).
 */

// Only one background instance may ever run. A second launch exits
// immediately; the running instance is notified via 'second-instance'
// (which will focus/open the settings window once that exists — Phase 6).
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  // Privileged scheme registration must happen before 'ready'.
  registerAssetSchemeAsPrivileged()

  app.on('second-instance', () => {
    console.log('[godfirst] second instance launched; focusing settings')
    if (isLocked()) return // nothing to show over a lock
    if (isOnboardingComplete()) openSettingsWindow()
    else openOnboardingWindow()
  })

  // Tray-only app: closing any window must never quit the app. Quitting
  // happens only via the tray "Quit" item (or OS shutdown).
  app.on('window-all-closed', () => {
    // Intentionally empty — overrides Electron's default quit-on-last-close.
  })

  // FAIL OPEN, NEVER FAIL LOCKED: an unhandled error while locked tears the
  // overlay down rather than leaving the user trapped behind a broken lock.
  process.on('uncaughtException', (err) => {
    console.error('[godfirst] uncaught exception', err)
    if (isLocked()) {
      console.error('[godfirst] failing open: tearing down lock after error')
      endLock('error')
    }
  })

  app.whenReady().then(() => {
    // No dock icon on macOS; the tray (menu bar) icon is the app's presence.
    if (process.platform === 'darwin') {
      app.dock?.hide()
    }

    registerAssetProtocolHandler()
    registerIpcHandlers()
    initAutostart()
    createTray()

    // Watchdog: if the app died (crash/kill/forced restart) while a lock was
    // active, bring the lock back before anything else happens.
    restoreLockIfNeeded()

    // Scheduler starts after the watchdog so a restored lock counts as
    // "locked" from the very first tick (crossed triggers get consumed,
    // not queued on top).
    initScheduler()
    initUpdateCheck()

    const mode = wasLaunchedHidden() ? 'auto-started at login' : 'started manually'
    console.log(`[godfirst] running in background (tray only), ${mode}`)

    // First run: the onboarding wizard is the ONLY window that auto-opens,
    // and never on top of a restored lock.
    if (!isOnboardingComplete() && !isLocked()) {
      openOnboardingWindow()
    }

    maybeRunAutotest()
  })

  app.on('will-quit', () => {
    destroyTray()
  })
}
