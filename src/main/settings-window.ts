import { BrowserWindow } from 'electron'
import { PRELOAD_PATH, loadRenderer } from './windows'

let settingsWindow: BrowserWindow | null = null

/**
 * The settings window: start-at-login, scripture choice, schedule, camera,
 * and update preferences. (There is no passcode setting — the break-glass
 * escape is the user's own OS login password.)
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
