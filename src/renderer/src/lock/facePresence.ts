import { useEffect, useRef, useState } from 'react'
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

/**
 * On-device face presence for the reading timer. Fully offline: the wasm
 * runtime and BlazeFace model are bundled and served over the app's local
 * gfres:// scheme.
 *
 * SAFETY RULE — fail open: if anything here fails (no camera, permission
 * denied, model missing, detector crash), presence is reported as TRUE with
 * status 'unavailable'. Face detection may pause the timer for an absent
 * reader; it must never be able to strand a present one.
 */

export type PresenceStatus = 'starting' | 'active' | 'unavailable' | 'no-permission'

export interface FacePresence {
  /** Treat as "the reader is here". True whenever detection can't run. */
  present: boolean
  status: PresenceStatus
  /** Live camera stream, for the "what the camera sees" self-view shown
   *  while paused (helps the reader fix angle/lighting). */
  stream: MediaStream | null
}

/** Consider the reader gone only after this long without a detected face —
 *  brief glances away, head turns, or detector flicker must not stall the
 *  timer. Generous on purpose: a false "paused" punishes a present reader. */
const ABSENCE_GRACE_MS = 5000
const DETECT_INTERVAL_MS = 400

/**
 * @param enabled Start/stop the camera (reading phases only).
 * @param allowed OS camera permission already granted. When false we never
 *   call getUserMedia: mid-lock the macOS permission prompt would open
 *   BEHIND the kiosk overlay, unanswerable. Grant via onboarding/Settings.
 */
export function useFacePresence(enabled: boolean, allowed: boolean): FacePresence {
  const [status, setStatus] = useState<PresenceStatus>('starting')
  const [present, setPresent] = useState(true)
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const lastSeenRef = useRef<number>(performance.now())

  useEffect(() => {
    if (!enabled || !allowed) return

    let cancelled = false
    let stream: MediaStream | null = null
    let detector: FaceDetector | null = null
    let timer: number | null = null
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    const failOpen = (why: string, err?: unknown): void => {
      console.error(
        `[godfirst] face presence unavailable (${why}): ${err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '')}`
      )
      // Release the camera — an "unavailable" check must not keep the
      // camera light on.
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      video.srcObject = null
      if (!cancelled) {
        setStatus('unavailable')
        setPresent(true)
        setLiveStream(null)
      }
    }

    const start = async (): Promise<void> => {
      try {
        // 640×480: enough pixels for reliable detection at laptop distance
        // and in dim rooms (the lock screen itself is dark).
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false
        })
      } catch (err) {
        return failOpen('camera denied or missing', err)
      }
      if (!cancelled) setLiveStream(stream)
      try {
        video.srcObject = stream
        await video.play()

        const fileset = await FilesetResolver.forVisionTasks('gfres://models/wasm')
        const modelResponse = await fetch('gfres://models/blaze_face_short_range.tflite')
        if (!modelResponse.ok) throw new Error(`model fetch ${modelResponse.status}`)
        const modelAssetBuffer = new Uint8Array(await modelResponse.arrayBuffer())

        detector = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer },
          runningMode: 'VIDEO',
          // Permissive on purpose: a missed real face pauses a present
          // reader, which is worse than an occasional generous frame.
          minDetectionConfidence: 0.25
        })
        if (cancelled) return

        setStatus('active')
        lastSeenRef.current = performance.now()

        timer = window.setInterval(() => {
          if (!detector || video.readyState < 2) return
          try {
            const now = performance.now()
            const result = detector.detectForVideo(video, now)
            if (result.detections.length > 0) lastSeenRef.current = now
            setPresent(now - lastSeenRef.current < ABSENCE_GRACE_MS)
          } catch (err) {
            // Detector died mid-session: stop gating the timer.
            if (timer !== null) window.clearInterval(timer)
            failOpen('detector error', err)
          }
        }, DETECT_INTERVAL_MS)
      } catch (err) {
        failOpen('init failed', err)
      }
    }

    void start()

    return () => {
      cancelled = true
      if (timer !== null) window.clearInterval(timer)
      detector?.close()
      stream?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
      setLiveStream(null)
    }
  }, [enabled, allowed])

  if (!allowed) return { present: true, status: 'no-permission', stream: null }
  if (!enabled) return { present: true, status: 'starting', stream: null }
  return { present: status === 'active' ? present : true, status, stream: liveStream }
}
