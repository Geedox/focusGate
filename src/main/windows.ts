import type { BrowserWindow } from 'electron'
import { join } from 'node:path'

export const PRELOAD_PATH = join(__dirname, '../preload/index.js')

/**
 * Loads the renderer with a hash route, in dev (vite server) and prod
 * (built file) alike. Routes look like `lock?role=primary` or `settings`.
 */
export function loadRenderer(win: BrowserWindow, route: string): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    return win.loadURL(`${devUrl}#/${route}`)
  }
  return win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}
