import { app } from 'electron'
import { join } from 'node:path'

/**
 * Resolves a file under resources/ in every launch mode:
 *  - packaged: copied next to the app via electron-builder extraResources
 *  - dev (`electron-vite dev` or `electron out/main/index.js`): anchored on
 *    the compiled main bundle (out/main/) — NOT app.getAppPath(), which
 *    points at out/main itself when Electron is launched with a file arg.
 */
export function resourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(__dirname, '..', '..', 'resources')
  return join(base, ...segments)
}
