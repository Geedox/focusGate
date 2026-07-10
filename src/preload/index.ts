import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppCommand,
  type DonateResult,
  type LockContext,
  type LockSessionState,
  type Mood,
  type PasscodeAttemptResult,
  type ScheduleConfig,
  type ScriptureKind,
  type SettingsView
} from '@shared/ipc'

/**
 * Bridge between main and renderer. Only typed, whitelisted calls — the raw
 * ipcRenderer is never exposed.
 */
const api = {
  platform: process.platform,
  app: {
    command: (command: AppCommand): Promise<void> => ipcRenderer.invoke(IPC.appCommand, command),
    finishOnboarding: (): Promise<void> => ipcRenderer.invoke(IPC.onboardingFinish),
    openAccessibilitySettings: (): Promise<void> =>
      ipcRenderer.invoke(IPC.openAccessibilitySettings),
    requestCameraAccess: (): Promise<boolean> => ipcRenderer.invoke(IPC.requestCameraAccess),
    openCameraSettings: (): Promise<void> => ipcRenderer.invoke(IPC.openCameraSettings),
    donate: (): Promise<DonateResult> => ipcRenderer.invoke(IPC.appDonate),
    shareStreak: (png: Uint8Array): Promise<boolean> =>
      ipcRenderer.invoke(IPC.appShareStreak, png)
  },
  settings: {
    get: (): Promise<SettingsView> => ipcRenderer.invoke(IPC.settingsGet),
    setLaunchAtLogin: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetLaunchAtLogin, enabled),
    setScripture: (kind: ScriptureKind | null): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetScripture, kind),
    setSessionMinutes: (minutes: number): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetSessionMinutes, minutes),
    setPlanMonths: (months: number): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetPlanMonths, months),
    setSchedule: (config: ScheduleConfig): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetSchedule, config)
  },
  security: {
    setPasscode: (current: string | null, next: string): Promise<PasscodeAttemptResult> =>
      ipcRenderer.invoke(IPC.securitySetPasscode, current, next)
  },
  lock: {
    getContext: (): Promise<LockContext> => ipcRenderer.invoke(IPC.lockGetContext),
    getSession: (): Promise<LockSessionState | null> => ipcRenderer.invoke(IPC.lockGetSession),
    chooseScripture: (kind: ScriptureKind): Promise<LockSessionState | null> =>
      ipcRenderer.invoke(IPC.lockChooseScripture, kind),
    chooseCategory: (categoryId: string): Promise<LockSessionState | null> =>
      ipcRenderer.invoke(IPC.lockChooseCategory, categoryId),
    activityComplete: (mood: Mood | null): Promise<void> =>
      ipcRenderer.invoke(IPC.lockActivityComplete, mood),
    verifyPasscode: (passcode: string): Promise<PasscodeAttemptResult> =>
      ipcRenderer.invoke(IPC.lockVerifyPasscode, passcode),
    devUnlock: (): Promise<void> => ipcRenderer.invoke(IPC.lockDevUnlock)
  }
} as const

export type GodFirstApi = typeof api

contextBridge.exposeInMainWorld('godfirst', api)
