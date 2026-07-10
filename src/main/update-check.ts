import { app, net } from 'electron'
import { EventEmitter } from 'node:events'
import { store } from './store'

/**
 * The ONLY network request GodFirst ever makes, and it is:
 *  - optional (Settings toggle, on by default, disclosed in onboarding)
 *  - tiny (fetches the latest release tag from GitHub — a version number)
 *  - anonymous (nothing about the user or their machine is sent beyond an
 *    ordinary HTTP request)
 *  - fail-silent (offline or erroring, nothing happens; never blocks or
 *    interrupts, and NEVER interacts with the lock)
 *
 * When a newer version exists, Settings shows a banner and the tray gains a
 * "download update" item. Downloading and installing stay fully manual.
 */

const RELEASES_API = 'https://api.github.com/repos/Geedox/focusGate/releases/latest'
export const DOWNLOAD_PAGE = 'https://godfirst.me'

const FIRST_CHECK_DELAY_MS = Number(process.env['GODFIRST_UPDATE_DELAY_MS'] ?? 15_000)
const RECHECK_INTERVAL_MS = 24 * 3_600_000

/** Emits 'changed' when availableUpdate flips; the tray subscribes. */
export const updateEvents = new EventEmitter()

/** "1.2.3" vs "1.2.10" — true when latest is strictly newer. Non-semver
 *  input compares false (never nag on garbage). */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const c = parse(current)
  const l = parse(latest)
  if (!c || !l) return false
  for (let i = 0; i < 3; i++) {
    if (l[i]! > c[i]!) return true
    if (l[i]! < c[i]!) return false
  }
  return false
}

export function getAvailableUpdate(): string | null {
  return store.get('availableUpdate')
}

async function checkOnce(): Promise<void> {
  if (!store.get('updateCheckEnabled')) return
  try {
    const fake = process.env['GODFIRST_FAKE_LATEST'] // autotest hook
    let latest: string
    if (fake) {
      latest = fake
    } else {
      const res = await net.fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'GodFirst' }
      })
      if (!res.ok) return
      const body = (await res.json()) as { tag_name?: string }
      if (typeof body.tag_name !== 'string') return
      latest = body.tag_name
    }
    const newer = isNewerVersion(app.getVersion(), latest)
    const next = newer ? latest.replace(/^v/, '') : null
    if (store.get('availableUpdate') !== next) {
      store.set('availableUpdate', next)
      updateEvents.emit('changed')
      if (next) console.log(`[godfirst] update available: v${next}`)
    }
  } catch (err) {
    // Offline or GitHub unreachable — perfectly fine, try again next time.
    if (process.env['GODFIRST_UPDATE_DELAY_MS']) console.error('[godfirst] update check failed', err)
  }
}

export function initUpdateCheck(): void {
  setTimeout(() => void checkOnce(), FIRST_CHECK_DELAY_MS)
  setInterval(() => void checkOnce(), RECHECK_INTERVAL_MS)
}
