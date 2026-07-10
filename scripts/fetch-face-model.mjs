/**
 * BUILD-TIME ONLY: prepares the on-device face-detection assets in
 * resources/models/ (bundled into the app; no runtime network use):
 *
 *  - blaze_face_short_range.tflite  — MediaPipe BlazeFace model (Apache-2.0),
 *    downloaded from Google's model hosting
 *  - wasm/                          — MediaPipe tasks-vision runtime, copied
 *    from node_modules
 *
 *   node scripts/fetch-face-model.mjs
 */
import { writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'models')
mkdirSync(outDir, { recursive: true })

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'

console.log(`fetching ${MODEL_URL}`)
const res = await fetch(MODEL_URL)
if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
const model = Buffer.from(await res.arrayBuffer())
if (model.length < 100_000) throw new Error(`model suspiciously small: ${model.length} bytes`)
writeFileSync(join(outDir, 'blaze_face_short_range.tflite'), model)
console.log(`wrote resources/models/blaze_face_short_range.tflite (${model.length} bytes)`)

cpSync(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), join(outDir, 'wasm'), {
  recursive: true
})
console.log('copied tasks-vision wasm runtime to resources/models/wasm/')
