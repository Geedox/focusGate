import { BrowserWindow } from 'electron'
import { startLock } from './lock'
import { PRELOAD_PATH, loadRenderer } from './windows'
import { store } from './store'

let onboardingWindow: BrowserWindow | null = null

export function isOnboardingComplete(): boolean {
  return store.get('onboardingComplete')
}

/**
 * First-run wizard — the only window that ever auto-opens. Reopens on every
 * boot until finished (closing it early is allowed; the tray keeps working).
 */
export function openOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.show()
    onboardingWindow.focus()
    return
  }

  onboardingWindow = new BrowserWindow({
    width: 560,
    height: 680,
    title: 'Welcome to GodFirst',
    resizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: PRELOAD_PATH
    }
  })

  void loadRenderer(onboardingWindow, 'onboarding')
  onboardingWindow.once('ready-to-show', () => onboardingWindow?.show())
  onboardingWindow.on('closed', () => {
    onboardingWindow = null
  })
}

/** Called from IPC when the wizard's Finish button is pressed. */
export function finishOnboarding(): void {
  store.set('onboardingComplete', true)
  onboardingWindow?.close()
  // First reading session, immediately: the user experiences the real flow
  // once (with the settings they just chose) and starts their streak on day
  // one. Small delay so the wizard window is gone before the overlay rises.
  // startLock() itself refuses if no passcode is set — the wizard enforces
  // one, but the guard stands regardless.
  setTimeout(() => startLock('manual'), 800)
}
