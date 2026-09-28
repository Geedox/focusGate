import { execFile } from 'node:child_process'

/**
 * "Is the user sharing their screen right now?" — a best-effort check the
 * scheduler runs just before a lock would fire, so a reading never lands in
 * the middle of a presentation. Two independent signals, either is enough:
 *
 *  1. Helper processes that only exist while a share is running
 *     (Zoom's CptHost on both macOS and Windows, Apple Screen Sharing's
 *     daemon on macOS). No permission needed anywhere.
 *  2. Window titles of the "You are sharing your screen" bars that Chrome,
 *     Edge, Teams, Slack and friends put up. Always available on Windows;
 *     on macOS Electron can only list other apps' windows once the user has
 *     granted Screen Recording, so there it is skipped without that grant
 *     (never prompts — a prompt behind a lock overlay would be unanswerable).
 *
 * Fails open: any error means "not sharing", so a broken check can never
 * postpone locks forever.
 */

/** Process names (exact, case-insensitive, without .exe) that only run during a share. */
const SHARING_PROCESSES = [
  'cpthost', // Zoom screen-share capture host (macOS + Windows)
  'screensharingd' // Apple Screen Sharing / remote management session (macOS)
]

/** Titles of the on-screen "sharing" indicator windows. */
const SHARING_TITLE_PATTERNS: RegExp[] = [
  /sharing (your |a |the )?(entire )?(screen|window|tab|display)/i, // Chrome, Edge, Brave, Slack
  /screen ?shar(e|ing)/i, // "Screen sharing", "ScreenShare", "screen-sharing"
  /share (toolbar|statusbar|status bar|bar)/i, // Zoom's mac toolbar windows
  /sharing (controls|toolbar|bar)/i, // Teams
  /stop (sharing|presenting)/i,
  /you.?re (sharing|presenting)/i
]

export interface ScreenShareCapability {
  /** 'full' = processes + window titles; 'apps-only' = processes alone. */
  level: 'full' | 'apps-only'
}

/** What the current platform/permissions allow, for the settings UI. */
export function screenShareCapability(): ScreenShareCapability {
  return { level: canReadWindowTitles() ? 'full' : 'apps-only' }
}

function canReadWindowTitles(): boolean {
  if (process.platform !== 'darwin') return true
  try {
    const { systemPreferences } = require('electron') as typeof import('electron')
    return systemPreferences.getMediaAccessStatus('screen') === 'granted'
  } catch {
    return false
  }
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout))
    })
  })
}

/** Lower-cased process names, without paths or ".exe". */
async function listProcessNames(): Promise<string[]> {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/fo', 'csv', '/nh'])
    return out
      .split(/\r?\n/)
      .map((line) => line.split('","')[0]?.replace(/^"/, '').trim().toLowerCase() ?? '')
      .filter((n) => n.length > 0)
      .map((n) => n.replace(/\.exe$/, ''))
  }
  const out = await run('ps', ['-axo', 'comm='])
  return out
    .split('\n')
    .map((line) => line.trim().split('/').pop()?.toLowerCase() ?? '')
    .filter((n) => n.length > 0)
}

/** Titles of every window on screen (empty when the platform won't tell us). */
async function listWindowTitles(): Promise<string[]> {
  if (!canReadWindowTitles()) return []
  try {
    const { desktopCapturer } = require('electron') as typeof import('electron')
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    })
    return sources.map((s) => s.name).filter((n) => n.length > 0)
  } catch {
    return []
  }
}

/** Pure matcher, exported for tests. */
export function detectSharing(processNames: string[], windowTitles: string[]): boolean {
  if (processNames.some((p) => SHARING_PROCESSES.includes(p))) return true
  return windowTitles.some((t) => SHARING_TITLE_PATTERNS.some((re) => re.test(t)))
}

/** Best-effort, never throws, never prompts. */
export async function isScreenSharing(): Promise<boolean> {
  try {
    const [processes, titles] = await Promise.all([listProcessNames(), listWindowTitles()])
    return detectSharing(processes, titles)
  } catch (err) {
    console.error('[godfirst] screen-share check failed (assuming not sharing)', err)
    return false
  }
}
