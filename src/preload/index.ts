import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppCommand,
  type DonateResult,
  type FeedbackResult,
  type LockContext,
  type LockSessionState,
  type Mood,
  type ScheduleConfig,
  type ScriptureKind,
  type SettingsView,
  type UnlockResult
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
    openDownloadPage: (): Promise<void> => ipcRenderer.invoke(IPC.openDownloadPage),
    donate: (): Promise<DonateResult> => ipcRenderer.invoke(IPC.appDonate),
    feedback: (): Promise<FeedbackResult> => ipcRenderer.invoke(IPC.appFeedback),
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
    setUpdateCheck: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetUpdateCheck, enabled),
    setPlanMonths: (months: number): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetPlanMonths, months),
    setSchedule: (config: ScheduleConfig): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetSchedule, config)
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
    unlock: (password: string): Promise<UnlockResult> =>
      ipcRenderer.invoke(IPC.lockUnlock, password),
    forceUnlock: (): Promise<void> => ipcRenderer.invoke(IPC.lockForceUnlock),
    devUnlock: (): Promise<void> => ipcRenderer.invoke(IPC.lockDevUnlock)
  }
} as const

export type GodFirstApi = typeof api

contextBridge.exposeInMainWorld('godfirst', api)
