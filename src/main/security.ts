import { store } from './store'
import type { BreakGlassEntry } from '@shared/ipc'

const BREAK_GLASS_LOG_CAP = 100

/** Local-only audit trail of emergency escapes (required by design: the
 *  break-glass path must be visible to the user, not silent). */
export function logBreakGlass(method: BreakGlassEntry['method']): void {
  try {
    const log = store.get('breakGlassLog')
    const entry: BreakGlassEntry = { at: new Date().toISOString(), method }
    store.set('breakGlassLog', [...log.slice(-(BREAK_GLASS_LOG_CAP - 1)), entry])
    console.log(`[godfirst] break-glass escape used: ${method}`)
  } catch (err) {
    // Logging must never block an emergency unlock.
    console.error('[godfirst] failed to write break-glass log', err)
  }
}
