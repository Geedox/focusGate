import Store from 'electron-store'
import { DEFAULT_STORE, type StoreSchema } from '@shared/ipc'

/**
 * All persistence lives in this one electron-store file
 * (userData/godfirst.json): settings, lock/watchdog state, passcode hash,
 * break-glass log. Later phases add schedule and reading progress.
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
