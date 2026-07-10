import { Tray, Menu, app, nativeImage } from 'electron'
import { isAutostartEnabled, setAutostart } from './autostart'
import { isLocked, lockEvents, startLock } from './lock'
import { resourcePath } from './resources'
import {
  getSchedulerStatus,
  isPaused,
  pauseForOneHour,
  resumeSchedule,
  schedulerEvents
} from './scheduler'
import { currentStreak } from './scripture'
import { openSettingsWindow } from './settings-window'

let tray: Tray | null = null

function formatTime(ts: number): string {
  const d = new Date(ts)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return time
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  return d.toDateString() === tomorrow.toDateString()
    ? `tomorrow ${time}`
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function statusLabel(): string {
  if (isLocked()) return 'GodFirst — locked (complete the activity)'
  const status = getSchedulerStatus()
  if (status.pausedUntil !== null) {
    return `GodFirst — paused until ${formatTime(status.pausedUntil)}`
  }
  const parts: string[] = []
  if (status.nextFireAt !== null) parts.push(`next lock ${formatTime(status.nextFireAt)}`)
  if (status.usageRemainingMs !== null) {
    parts.push(`locks after ${formatDuration(status.usageRemainingMs)} more use`)
  }
  const streak = currentStreak().current
  if (streak > 0) parts.push(`🔥 ${streak}-day streak`)
  return parts.length > 0 ? `GodFirst — ${parts.join(' · ')}` : 'GodFirst — no lock scheduled'
}

function trayIconPath(): string {
  // "Template" suffix makes macOS auto-tint the icon for light/dark menu bars.
  return resourcePath(process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
}

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(trayIconPath())
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)
  tray.setToolTip('GodFirst')
  refreshTrayMenu()
  lockEvents.on('changed', refreshTrayMenu)
  schedulerEvents.on('changed', refreshTrayMenu)
  return tray
}

/**
 * Rebuilds the tray menu. Called on creation and whenever status changes
 * (lock state now; schedule/pause state in Phase 5).
 */
export function refreshTrayMenu(): void {
  if (!tray) return
  const locked = isLocked()

  const menu = Menu.buildFromTemplate([
    {
      label: statusLabel(),
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Lock me now',
      enabled: !locked,
      click: () => {
        startLock('manual')
      }
    },
    isPaused()
      ? {
          label: 'Resume schedule now',
          enabled: !locked,
          click: () => {
            resumeSchedule()
          }
        }
      : {
          label: 'Pause for 1 hour',
          enabled: !locked,
          click: () => {
            pauseForOneHour()
          }
        },
    {
      label: 'Settings…',
      enabled: !locked,
      click: () => {
        openSettingsWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'Start GodFirst when I log in',
      type: 'checkbox',
      checked: isAutostartEnabled(),
      click: (item) => {
        setAutostart(item.checked)
      }
    },
    { type: 'separator' },
    {
      label: 'Quit GodFirst',
      // Quitting while locked would defeat the lock (the watchdog restores
      // it on relaunch, but still) — disable it; break-glass is the way out.
      enabled: !locked,
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  lockEvents.removeListener('changed', refreshTrayMenu)
  schedulerEvents.removeListener('changed', refreshTrayMenu)
  tray?.destroy()
  tray = null
}
