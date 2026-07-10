/**
 * IPC contract shared between main, preload, and renderer.
 * Every channel is listed here; nothing else may cross the bridge.
 */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSetLaunchAtLogin: 'settings:set-launch-at-login',
  settingsSetScripture: 'settings:set-scripture',
  settingsSetSessionMinutes: 'settings:set-session-minutes',
  settingsSetPlanMonths: 'settings:set-plan-months',
  settingsSetSchedule: 'settings:set-schedule',
  securitySetPasscode: 'security:set-passcode',
  appCommand: 'app:command',
  appDonate: 'app:donate',
  appShareStreak: 'app:share-streak',
  onboardingFinish: 'onboarding:finish',
  openAccessibilitySettings: 'app:open-accessibility-settings',
  openCameraSettings: 'app:open-camera-settings',
  lockGetContext: 'lock:get-context',
  lockGetSession: 'lock:get-session',
  lockChooseScripture: 'lock:choose-scripture',
  lockChooseCategory: 'lock:choose-category',
  lockActivityComplete: 'lock:activity-complete',
  lockVerifyPasscode: 'lock:verify-passcode',
  lockDevUnlock: 'lock:dev-unlock',
  requestCameraAccess: 'app:request-camera-access'
} as const

export type ScriptureKind = 'bible' | 'quran'

/** Pseudo-category id for whole-canon reading-plan sessions. */
export const PLAN_CATEGORY_ID = 'plan'

/**
 * Where the Donate button sends people (opened in the system browser — the
 * app itself never makes network requests).
 *
 * Currently the Nigeria (NGN) payment page. When the USD/Stripe link
 * exists, either swap this URL for a chooser page on the GodFirst website,
 * or extend this into a list and let DonateButton offer both.
 */
export const DONATION_URL = 'https://merchant.buypowermfb.net/pay/godfirst-donations-1783667607864'

export interface DonateResult {
  /** True when locked: the page opens right after the screen unlocks. */
  deferred: boolean
}

/** Simple actions the settings/onboarding windows can ask main to perform. */
export type AppCommand = 'lock-now' | 'pause-1h' | 'resume-schedule' | 'quit'

/** When locks fire automatically. All trigger kinds can be active at once. */
export interface ScheduleConfig {
  /** Fixed times of day, 24h local "HH:MM" (e.g. ["07:00", "21:00"]). */
  times: string[]
  /** Recurring interval in hours since the last scheduled fire; null = off. */
  intervalHours: number | null
  /**
   * Lock after this many hours of ACTIVE use (keyboard/mouse activity),
   * accumulated since the last lock; null = off. Unlike wall-clock triggers
   * this can't misfire on days the machine sits unused — idle time and
   * sleep don't count.
   */
  activeUseHours: number | null
}

/** User-facing settings (editable in the settings UI). */
export interface AppSettings {
  /** Start GodFirst (hidden, tray-only) when the user logs in. */
  launchAtLogin: boolean
  /** Which text to read; null = ask on each lock. */
  scripture: ScriptureKind | null
  /** Target length of one reading session, in minutes (drives the dwell
   * pace: total time is fixed, per-verse time adapts to passage length). */
  sessionMinutes: number
  /** Target duration (months) to finish a whole-canon reading plan. */
  planMonths: number
  schedule: ScheduleConfig
}

/** Persisted whole-canon plan progress (0-based position + verses read). */
export interface PlanProgress {
  book: number
  chapter: number
  verse: number
  versesRead: number
}

/** Scrypt-hashed recovery passcode. Never stored in plaintext. */
export interface PasscodeRecord {
  saltHex: string
  hashHex: string
}

export interface BreakGlassEntry {
  at: string // ISO timestamp
  method: 'passcode'
}

/** How the user said they felt after a completed session. */
export const MOODS = ['calmer', 'encouraged', 'neutral', 'heavy'] as const
export type Mood = (typeof MOODS)[number]

/** Daily reading streak (a day counts once, however many sessions). */
export interface StreakState {
  current: number
  best: number
  /** Local YYYY-MM-DD of the last completed session; null = never. */
  lastDate: string | null
}

export interface SessionLogEntry {
  at: string // ISO timestamp
  kind: ScriptureKind
  categoryId: string
  reference: string
  mood: Mood | null // null = skipped the mood question
}

/** Full electron-store schema: settings + internal state. */
export interface StoreSchema extends AppSettings {
  /** True while a lock is (or should be) active — the watchdog flag. */
  lockActive: boolean
  passcode: PasscodeRecord | null
  breakGlassLog: BreakGlassEntry[]
  /** Recently shown passage ids per text, to avoid immediate repeats. */
  recentPassages: Record<ScriptureKind, string[]>
  /** Whole-canon reading-plan progress per text. */
  readingPlan: Record<ScriptureKind, PlanProgress>
  /** Completed sessions with the user's mood answer. */
  sessionLog: SessionLogEntry[]
  /** Daily reading streak. */
  streak: StreakState
  /** Scheduled locks suspended until this epoch-ms ("Pause for 1 hour"). */
  pausedUntil: number | null
  /** Epoch ms of the last scheduled fire — the interval trigger's anchor. */
  lastScheduledFire: number | null
  /** Milliseconds of active use accumulated since the last lock. */
  activeUseMs: number
  /** First-run wizard completed; until true it auto-opens on boot. */
  onboardingComplete: boolean
}

export const DEFAULT_STORE: StoreSchema = {
  // launchAtLogin defaults to on — the app's whole point is being there on a
  // schedule. Onboarding surfaces this explicitly.
  launchAtLogin: true,
  scripture: null,
  sessionMinutes: 3,
  planMonths: 12,
  lockActive: false,
  passcode: null,
  breakGlassLog: [],
  recentPassages: { bible: [], quran: [] },
  readingPlan: {
    bible: { book: 0, chapter: 0, verse: 0, versesRead: 0 },
    quran: { book: 0, chapter: 0, verse: 0, versesRead: 0 }
  },
  sessionLog: [],
  streak: { current: 0, best: 0, lastDate: null },
  // Usage-based locking is on by default (3h of active use) — it only ever
  // fires when the machine is genuinely being used.
  schedule: { times: [], intervalHours: null, activeUseHours: 3 },
  pausedUntil: null,
  lastScheduledFire: null,
  /** Milliseconds of active use accumulated since the last lock. */
  activeUseMs: 0,
  onboardingComplete: false
}

/** Reading-plan summary for the settings UI. */
export interface PlanSummary {
  /** 0–100, share of the canon completed this lap. */
  progressPct: number
  /** Where the next plan session starts, e.g. "Genesis 1:1". */
  nextReference: string
  /** Verses each plan session will contain at the current pace. */
  versesPerSession: number
}

/** What the settings UI needs to render. */
export interface SettingsView {
  launchAtLogin: boolean
  hasPasscode: boolean
  scripture: ScriptureKind | null
  sessionMinutes: number
  planMonths: number
  plan: Record<ScriptureKind, PlanSummary>
  schedule: ScheduleConfig
  /** OS camera permission for the presence check (always true off-macOS). */
  cameraGranted: boolean
  /** Reading streak: effective current (0 if a day was missed) and best. */
  streak: { current: number; best: number }
}

/** One verse as shown in a lock session. */
export interface SessionVerse {
  /** e.g. "Genesis 1:1" or "2:255" */
  label: string
  en: string
  /** Arabic original (Quran only). */
  ar?: string
}

export interface CategoryOption {
  id: string
  label: string
  description: string
}

/** Everything the reader UI needs for one lock session. */
export interface ScriptureSession {
  kind: ScriptureKind
  categoryId: string
  categoryLabel: string
  /** e.g. "Psalms 23:1–6" */
  reference: string
  verses: SessionVerse[]
  /** Computed per session: sessionMinutes spread over the passage length. */
  secondsPerVerse: number
  /** A brief word on the passage's theme, shown after the reading. */
  reflection: string
  /** What the daily streak will be once this session completes. */
  streakAfterCompletion: number
}

/**
 * The lock-screen flow walks these stages:
 *   kind (if no scripture preference) → category → session
 */
export type LockSessionState =
  | { stage: 'kind' }
  | {
      stage: 'category'
      kind: ScriptureKind
      categories: CategoryOption[]
      /** The whole-canon reading-plan option shown above the themes. */
      plan: PlanSummary
      /** Effective current daily streak, for the motivational chip. */
      streak: number
    }
  | { stage: 'session'; session: ScriptureSession }

/** What a lock overlay window needs to render. */
export interface LockContext {
  hasPasscode: boolean
  isDev: boolean
  /**
   * OS camera permission already granted. When false the overlay must NOT
   * call getUserMedia — the macOS permission prompt would appear BEHIND the
   * kiosk overlay where it can't be answered. Grant via onboarding/Settings.
   */
  cameraGranted: boolean
}

export interface PasscodeAttemptResult {
  ok: boolean
  error?: string
}
