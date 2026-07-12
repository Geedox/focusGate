import Store from 'electron-store'
import { DEFAULT_STORE, type StoreSchema } from '@shared/ipc'

/**
 * All persistence lives in this one electron-store file
 * (userData/godfirst.json): settings, lock/watchdog state, and the local
 * break-glass audit log. No passcode is stored — the break-glass escape is
 * the user's own OS login password, verified live (see os-auth.ts).
 */
export const store = new Store<StoreSchema>({
  name: 'godfirst',
  defaults: DEFAULT_STORE
})

// electron-store defaults are shallow (top-level keys only): a schedule
// object written by an older version lacks newer fields. Normalize once.
// Also retires the removed recurring-interval trigger on old stores.
const schedule = store.get('schedule')
if (schedule.activeUseHours === undefined || schedule.intervalHours !== null) {
  store.set('schedule', {
    ...schedule,
    activeUseHours: schedule.activeUseHours ?? 3,
    intervalHours: null
  })
}
