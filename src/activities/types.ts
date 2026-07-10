import type { Mood } from '@shared/ipc'

/**
 * The activity plug-in interface. The lock core knows nothing about what an
 * activity does — it renders the module for the session and unlocks when the
 * module reports completion. v2 camera activities (squats, water) implement
 * this same interface with on-device detection.
 */

export interface ActivityContext {
  /**
   * Call exactly once, when the user has genuinely completed the activity.
   * `mood` is the user's post-session answer (null = skipped). The lock
   * screen forwards this to the main process, which tears down the overlay.
   */
  onComplete: (mood: Mood | null) => void
  /** OS camera permission (presence check must not prompt mid-lock). */
  cameraGranted: boolean
}

export interface ActivityModule<TSession = unknown> {
  id: string
  /** Renders the activity UI for one lock session. */
  render: (session: TSession, ctx: ActivityContext) => React.JSX.Element
}
