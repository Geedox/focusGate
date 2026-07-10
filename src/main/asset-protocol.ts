import { app, net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { join, normalize } from 'node:path'
import { resourcePath } from './resources'

/**
 * gfres:// — serves files from resources/ to the renderer. Needed because
 * the MediaPipe runtime loads its wasm + model via fetch(), which Chromium
 * forbids on file:// pages. Everything stays on disk; no network involved.
 *
 *   gfres://models/wasm/vision_wasm_internal.wasm
 *   gfres://models/blaze_face_short_range.tflite
 */

export function registerAssetSchemeAsPrivileged(): void {
  // Must run before app 'ready'.
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'gfres',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function registerAssetProtocolHandler(): void {
  // Must run after app 'ready'.
  protocol.handle('gfres', async (request) => {
    const url = new URL(request.url)
    const relative = normalize(join(url.hostname, url.pathname)).replace(/^(\.\.[/\\])+/, '')
    const file = resourcePath(relative)
    if (!file.startsWith(resourcePath(''))) {
      return new Response('forbidden', { status: 403 })
    }
    const response = await net.fetch(pathToFileURL(file).toString())
    // The dev renderer runs on http://localhost — allow cross-origin reads.
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, { status: response.status, headers })
  })
  void app // (imported for symmetry; handler registration needs app ready)
}
