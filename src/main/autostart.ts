import { app } from 'electron'
import { store } from './store'

/** Passed to login-item launches so the app knows it was auto-started. */
export const HIDDEN_FLAG = '--hidden'

/**
 * Windows quirk: `getLoginItemSettings()` only reports `openAtLogin: true`
 * when queried with the SAME `args` the item was registered with. We register
 * with `[HIDDEN_FLAG]`, so every read must pass it too — otherwise the toggle
 * shows unchecked and re-checking it appears to do nothing (it re-registers,
 * but the next read still compares against no-args and returns false).
 * macOS ignores `args` here, so only send it on Windows.
 */
function loginItemQuery(): { args: string[] } | undefined {
  return process.platform === 'win32' ? { args: [HIDDEN_FLAG] } : undefined
}

/** True when this process was launched by the OS at login (or with --hidden). */
export function wasLaunchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_FLAG)) return true
  // macOS reports login-item launches directly (args aren't passed through
  // on macOS 13+ SMAppService registrations, so the flag alone isn't enough).
  if (process.platform === 'darwin') {
    return app.getLoginItemSettings().wasOpenedAtLogin
  }
  return false
}

/**
 * Persist the preference and (for packaged builds) register/unregister the
 * OS login item. In dev the OS call is skipped: it would register the bare
 * dev Electron binary from node_modules, which launches nothing useful.
 */
export function setAutostart(enabled: boolean): void {
  store.set('launchAtLogin', enabled)

  if (!app.isPackaged) {
    console.log(
      `[godfirst] autostart preference -> ${enabled} (stored only; OS login item requires a packaged build)`
    )
    return
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    // macOS (pre-13 API): launch without showing windows. Harmless elsewhere.
    // GodFirst never opens a window on boot anyway — that is the real
    // hidden-launch guarantee; this is belt-and-braces.
    openAsHidden: true,
    // Windows: appended to the registry Run entry so auto-started launches
    // carry the flag.
    args: [HIDDEN_FLAG]
  })

  // Read back what the OS actually registered — surfaces silent failures
  // (e.g. macOS SMAppService refusing an app it can't re-launch).
  const effective = app.getLoginItemSettings(loginItemQuery())
  console.log(
    `[godfirst] login item requested=${enabled} os-reports=${effective.openAtLogin}`
  )
}

/** Effective state: the OS answer when packaged, the stored pref in dev. */
export function isAutostartEnabled(): boolean {
  if (!app.isPackaged) return store.get('launchAtLogin')
  return app.getLoginItemSettings(loginItemQuery()).openAtLogin
}

/**
 * Called on every boot: re-asserts the stored preference against the OS so
 * the two never drift (e.g. after an app move/rename invalidates the old
 * login item).
 */
export function initAutostart(): void {
  setAutostart(store.get('launchAtLogin'))
}
