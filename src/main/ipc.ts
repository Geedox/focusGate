import { app, ipcMain, shell } from 'electron'
import {
  DONATION_URL,
  FEEDBACK_MAILTO,
  IPC,
  type AppCommand,
  type DonateResult,
  type FeedbackResult,
  type LockContext,
  type LockSessionState,
  type ScriptureSession,
  type SettingsView,
  type UnlockResult
} from '@shared/ipc'
import { isAutostartEnabled, setAutostart } from './autostart'
import { endLock, isLocked, lockEvents, startLock } from './lock'
import { finishOnboarding } from './onboarding-window'
import { osUsername, verifyOsPassword } from './os-auth'
import { parseTimeOfDay } from './schedule-core'
import { pauseForOneHour, rescheduleFromConfig, resumeSchedule } from './scheduler'
import { DOWNLOAD_PAGE, getAvailableUpdate } from './update-check'
import {
  chooseCategory,
  chooseScripture,
  completeActivity,
  currentStreak,
  getPlanSummaries,
  getSessionState
} from './scripture'
import { logBreakGlass } from './security'
import { store } from './store'
import { refreshTrayMenu } from './tray'

/**
 * All ipcMain handlers. Renderer input is never trusted: every payload is
 * validated here before touching state.
 */

/** Camera permission WITHOUT prompting (prompts must never fire mid-lock —
 *  the macOS dialog would appear behind the kiosk overlay). */
function isCameraGranted(): boolean {
  if (process.platform !== 'darwin') return true
  // Lazy import keeps non-darwin bundles clean.
  const { systemPreferences } = require('electron') as typeof import('electron')
  return systemPreferences.getMediaAccessStatus('camera') === 'granted'
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.settingsGet, (): SettingsView => {
    return {
      launchAtLogin: isAutostartEnabled(),
      scripture: store.get('scripture'),
      sessionMinutes: store.get('sessionMinutes'),
      planMonths: store.get('planMonths'),
      plan: getPlanSummaries(),
      schedule: store.get('schedule'),
      cameraGranted: isCameraGranted(),
      streak: currentStreak(),
      updateCheckEnabled: store.get('updateCheckEnabled'),
      availableUpdate: getAvailableUpdate(),
      appVersion: app.getVersion()
    }
  })

  ipcMain.handle(IPC.settingsSetUpdateCheck, (_event, enabled: unknown): void => {
    if (typeof enabled !== 'boolean') return
    store.set('updateCheckEnabled', enabled)
    if (!enabled) store.set('availableUpdate', null) // no nagging when off
  })

  ipcMain.handle(IPC.openDownloadPage, (): void => {
    void shell.openExternal(DOWNLOAD_PAGE)
  })

  ipcMain.handle(IPC.settingsSetPlanMonths, (_event, months: unknown): void => {
    if (typeof months !== 'number' || !Number.isFinite(months)) return
    store.set('planMonths', Math.min(60, Math.max(1, Math.round(months))))
  })

  ipcMain.handle(IPC.settingsSetSchedule, (_event, config: unknown): void => {
    if (typeof config !== 'object' || config === null) return
    const { times, intervalHours, activeUseHours } = config as Record<string, unknown>
    if (!Array.isArray(times) || times.length > 24) return
    const validTimes = times.filter(
      (t): t is string => typeof t === 'string' && parseTimeOfDay(t) !== null
    )
    // The recurring-interval trigger was removed from the product (usage-
    // based + fixed times cover it better); the mechanism stays for tests.
    void intervalHours
    const validInterval = null
    const validActiveUse =
      typeof activeUseHours === 'number' &&
      Number.isFinite(activeUseHours) &&
      activeUseHours >= 0.5 &&
      activeUseHours <= 16
        ? activeUseHours
        : null
    store.set('schedule', {
      times: [...new Set(validTimes)].sort(),
      intervalHours: validInterval,
      activeUseHours: validActiveUse
    })
    rescheduleFromConfig()
  })

  ipcMain.handle(IPC.settingsSetLaunchAtLogin, (_event, enabled: unknown): void => {
    if (typeof enabled !== 'boolean') return
    setAutostart(enabled)
    refreshTrayMenu()
  })

  ipcMain.handle(IPC.settingsSetScripture, (_event, kind: unknown): void => {
    if (kind !== 'bible' && kind !== 'quran' && kind !== null) return
    store.set('scripture', kind)
  })

  ipcMain.handle(IPC.settingsSetSessionMinutes, (_event, minutes: unknown): void => {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return
    store.set('sessionMinutes', Math.min(60, Math.max(1, Math.round(minutes))))
  })

  ipcMain.handle(IPC.appCommand, (_event, command: unknown): void => {
    const commands: Record<AppCommand, () => void> = {
      'lock-now': () => startLock('manual'),
      'pause-1h': () => pauseForOneHour(),
      'resume-schedule': () => resumeSchedule(),
      quit: () => {
        if (!isLocked()) app.quit() // quitting is never an unlock shortcut
      }
    }
    if (typeof command === 'string' && command in commands) {
      commands[command as AppCommand]()
    }
  })

  ipcMain.handle(IPC.onboardingFinish, (): void => {
    finishOnboarding()
  })

  // Donate / Feedback: open in the system browser / mail app. Never mid-lock —
  // the overlay sits above everything, so anything opened now would be
  // invisible; defer it to the moment the lock ends instead.
  let donatePending = false
  let feedbackPending = false
  lockEvents.on('changed', () => {
    if (isLocked()) return
    if (donatePending) {
      donatePending = false
      void shell.openExternal(DONATION_URL)
    }
    if (feedbackPending) {
      feedbackPending = false
      void shell.openExternal(FEEDBACK_MAILTO)
    }
  })
  // Share streak: the renderer draws the card (canvas); main puts the PNG on
  // the system clipboard so it can be pasted anywhere. Offline by nature.
  ipcMain.handle(IPC.appShareStreak, (_event, png: unknown): boolean => {
    if (!(png instanceof Uint8Array) || png.length === 0 || png.length > 5_000_000) return false
    try {
      const { clipboard, nativeImage } = require('electron') as typeof import('electron')
      const image = nativeImage.createFromBuffer(Buffer.from(png))
      if (image.isEmpty()) return false
      clipboard.writeImage(image)
      return true
    } catch (err) {
      console.error('[godfirst] share-streak clipboard write failed', err)
      return false
    }
  })

  ipcMain.handle(IPC.appDonate, (): DonateResult => {
    if (isLocked()) {
      donatePending = true
      return { deferred: true }
    }
    void shell.openExternal(DONATION_URL)
    return { deferred: false }
  })

  // Feedback: opens the user's mail app pre-addressed to the maintainer.
  ipcMain.handle(IPC.appFeedback, (): FeedbackResult => {
    if (isLocked()) {
      feedbackPending = true
      return { deferred: true }
    }
    void shell.openExternal(FEEDBACK_MAILTO)
    return { deferred: false }
  })

  ipcMain.handle(IPC.openAccessibilitySettings, (): void => {
    if (process.platform === 'darwin') {
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
      )
    }
  })

  ipcMain.handle(IPC.openCameraSettings, (): void => {
    if (process.platform === 'darwin') {
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
      )
    }
  })

  ipcMain.handle(IPC.lockGetContext, (): LockContext => {
    return {
      osUsername: osUsername(),
      isDev: !app.isPackaged,
      cameraGranted: isCameraGranted()
    }
  })

  ipcMain.handle(IPC.lockGetSession, (): LockSessionState | null => {
    if (!isLocked()) return null
    return getSessionState()
  })

  ipcMain.handle(IPC.lockChooseScripture, (_event, kind: unknown): LockSessionState | null => {
    if (!isLocked()) return null
    if (kind !== 'bible' && kind !== 'quran') return null
    return chooseScripture(kind)
  })

  ipcMain.handle(IPC.lockChooseCategory, (_event, categoryId: unknown): LockSessionState | null => {
    if (!isLocked()) return null
    if (typeof categoryId !== 'string') return null
    return chooseCategory(categoryId)
  })

  // The activity (reader + comprehension check) reports genuine completion,
  // with the user's mood answer (or null if skipped).
  ipcMain.handle(IPC.lockActivityComplete, (_event, mood: unknown): void => {
    completeActivity(mood)
  })

  // macOS: surface the system camera-permission prompt from onboarding
  // (never mid-lock, where the dialog could hide behind the overlay).
  ipcMain.handle(IPC.requestCameraAccess, async (): Promise<boolean> => {
    if (process.platform !== 'darwin') return true
    const { systemPreferences } = await import('electron')
    const status = systemPreferences.getMediaAccessStatus('camera')
    if (status === 'granted') return true
    return systemPreferences.askForMediaAccess('camera')
  })

  // Break-glass: the user's OWN OS login password (no app passcode exists).
  ipcMain.handle(IPC.lockUnlock, async (_event, password: unknown): Promise<UnlockResult> => {
    if (!isLocked()) return { ok: false, error: 'Not locked.' }
    const result = await verifyOsPassword(password)
    if (result === 'correct') {
      logBreakGlass('os-password')
      endLock('break-glass')
      return { ok: true }
    }
    if (result === 'unavailable') {
      // The checker couldn't run/decide — never trap the user: the renderer
      // reveals the force-escape when it sees this flag.
      return {
        ok: false,
        unavailable: true,
        error: "Couldn't verify your password automatically on this machine."
      }
    }
    return { ok: false, error: 'Incorrect password.' }
  })

  // Guaranteed safety escape: unlocks and disables auto-start so a lock can
  // never re-raise on reboot. Offered only when the lock screen has already
  // determined that automatic password verification can't help (verification
  // unavailable, or too many failed attempts) — so a reformat is NEVER the
  // way out again.
  ipcMain.handle(IPC.lockForceUnlock, (): void => {
    if (!isLocked()) return
    logBreakGlass('force')
    try {
      setAutostart(false)
    } catch (err) {
      console.error('[godfirst] force-unlock could not disable autostart', err)
    }
    endLock('break-glass')
  })

  // Dev-only unlock button on the overlay; no-op in packaged builds.
  ipcMain.handle(IPC.lockDevUnlock, (): void => {
    if (app.isPackaged) return
    endLock('dev')
  })
}
