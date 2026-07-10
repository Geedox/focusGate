import { app, ipcMain, shell } from 'electron'
import {
  DONATION_URL,
  IPC,
  type AppCommand,
  type DonateResult,
  type LockContext,
  type LockSessionState,
  type PasscodeAttemptResult,
  type ScriptureSession,
  type SettingsView
} from '@shared/ipc'
import { isAutostartEnabled, setAutostart } from './autostart'
import { endLock, isLocked, lockEvents, startLock } from './lock'
import { finishOnboarding } from './onboarding-window'
import { isValidPasscode, MIN_PASSCODE_LENGTH } from './passcode'
import { parseTimeOfDay } from './schedule-core'
import { pauseForOneHour, rescheduleFromConfig, resumeSchedule } from './scheduler'
import {
  chooseCategory,
  chooseScripture,
  completeActivity,
  currentStreak,
  getPlanSummaries,
  getSessionState
} from './scripture'
import { hasPasscode, logBreakGlass, setPasscode, verifyPasscode } from './security'
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
      hasPasscode: hasPasscode(),
      scripture: store.get('scripture'),
      sessionMinutes: store.get('sessionMinutes'),
      planMonths: store.get('planMonths'),
      plan: getPlanSummaries(),
      schedule: store.get('schedule'),
      cameraGranted: isCameraGranted(),
      streak: currentStreak()
    }
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

  ipcMain.handle(
    IPC.securitySetPasscode,
    (_event, current: unknown, next: unknown): PasscodeAttemptResult => {
      // Changing an existing passcode requires the current one.
      if (hasPasscode() && !verifyPasscode(current)) {
        return { ok: false, error: 'Current passcode is incorrect.' }
      }
      if (!isValidPasscode(next)) {
        return { ok: false, error: `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.` }
      }
      setPasscode(next)
      return { ok: true }
    }
  )

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

  // Donate: opens the system browser. Never mid-lock — the overlay sits
  // above everything, so a page opened now would be invisible; defer it to
  // the moment the lock ends instead.
  let donatePending = false
  lockEvents.on('changed', () => {
    if (!isLocked() && donatePending) {
      donatePending = false
      void shell.openExternal(DONATION_URL)
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
      hasPasscode: hasPasscode(),
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

  // Break-glass: recovery passcode (the only escape by design).
  ipcMain.handle(IPC.lockVerifyPasscode, (_event, passcode: unknown): PasscodeAttemptResult => {
    if (!isLocked()) return { ok: false, error: 'Not locked.' }
    if (!hasPasscode()) {
      return { ok: false, error: 'No recovery passcode is set.' }
    }
    if (!verifyPasscode(passcode)) {
      return { ok: false, error: 'Incorrect passcode.' }
    }
    logBreakGlass('passcode')
    endLock('break-glass-passcode')
    return { ok: true }
  })

  // Dev-only unlock button on the overlay; no-op in packaged builds.
  ipcMain.handle(IPC.lockDevUnlock, (): void => {
    if (app.isPackaged) return
    endLock('dev')
  })
}
