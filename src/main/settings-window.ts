import { BrowserWindow } from 'electron'
import { PRELOAD_PATH, loadRenderer } from './windows'

let settingsWindow: BrowserWindow | null = null

/**
 * Minimal settings window (Phase 3: recovery passcode + start-at-login).
 * Phase 6 expands it with schedule, scripture choice, and onboarding.
 */
export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 600,
    title: 'GodFirst Settings',
    resizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: PRELOAD_PATH
    }
  })

  void loadRenderer(settingsWindow, 'settings')
  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}
