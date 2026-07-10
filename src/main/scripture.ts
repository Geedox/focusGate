import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CATEGORIES,
  getCategory,
  passageId,
  pickRandomPassage,
  type BiblePassage,
  type QuranPassage
} from '../activities/scripture/catalog'
import {
  takeSequential,
  totalVerses,
  type Counts,
  type PlanPosition
} from '../activities/scripture/plan'
import {
  MOODS,
  PLAN_CATEGORY_ID,
  type CategoryOption,
  type LockSessionState,
  type Mood,
  type PlanSummary,
  type ScriptureKind,
  type ScriptureSession,
  type SessionVerse
} from '@shared/ipc'
import { endLock, isLocked, lockEvents } from './lock'
import { resourcePath } from './resources'
import { store } from './store'
import { advanceStreak, effectiveStreak, localDateString, yesterdayOf } from './streak'

/** What the streak becomes once a session completes today. */
function previewStreak(): number {
  const now = new Date()
  return advanceStreak(store.get('streak'), localDateString(now), yesterdayOf(now)).current
}

export function currentStreak(): { current: number; best: number } {
  const now = new Date()
  const state = store.get('streak')
  return {
    current: effectiveStreak(state, localDateString(now), yesterdayOf(now)),
    best: state.best
  }
}

/**
 * Scripture data + session authority (main process). Flow per lock:
 * kind (skipped when preset in settings) → category → session (one passage
 * picked at random from the category, avoiding the last few shown).
 *
 * Completion trust model: the renderer verifies the comprehension check and
 * reports completion (with the user's mood). Acceptable for v1 — offline
 * self-discipline app running our own code under contextIsolation.
 */

const RECENT_CAP = 5
const SESSION_LOG_CAP = 200

interface BibleData {
  translation: string
  books: { name: string; chapters: string[][] }[]
}
interface QuranData {
  translation: string
  suras: { number: number; name: string; ayas: { ar: string; en: string }[] }[]
}

let bible: BibleData | null = null
let quran: QuranData | null = null

function loadBible(): BibleData {
  bible ??= JSON.parse(
    readFileSync(join(resourcePath('scripture'), 'bible-kjv.json'), 'utf8')
  ) as BibleData
  return bible
}

function loadQuran(): QuranData {
  quran ??= JSON.parse(
    readFileSync(join(resourcePath('scripture'), 'quran.json'), 'utf8')
  ) as QuranData
  return quran
}

// --- session lifecycle ---------------------------------------------------

interface ActiveSession {
  session: ScriptureSession
  /** Category sessions: id for recent-repeat tracking. */
  passageId: string | null
  /** Plan sessions: progress to persist on completion. */
  planAdvance: { next: PlanPosition; count: number; wrapped: boolean } | null
}

let active: ActiveSession | null = null
/** Kind chosen on the lock screen when no settings preference exists. */
let chosenKind: ScriptureKind | null = null

// A lock ending for ANY reason (break-glass, error, dev) discards session
// state; the session log records only genuine completions.
lockEvents.on('changed', () => {
  if (!isLocked()) {
    active = null
    chosenKind = null
  }
})

function categoryOptionsFor(kind: ScriptureKind): CategoryOption[] {
  return CATEGORIES.filter((c) => (kind === 'bible' ? c.bible : c.quran).length > 0).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description
  }))
}

// --- whole-canon reading plan --------------------------------------------

function countsFor(kind: ScriptureKind): Counts {
  // The Quran maps onto the plan math as one "book" whose chapters are suras.
  return kind === 'bible'
    ? loadBible().books.map((b) => b.chapters.map((ch) => ch.length))
    : [loadQuran().suras.map((s) => s.ayas.length)]
}

function positionLabel(kind: ScriptureKind, pos: PlanPosition): string {
  if (kind === 'bible') {
    const book = loadBible().books[pos.book]
    return book ? `${book.name} ${pos.chapter + 1}:${pos.verse + 1}` : 'Genesis 1:1'
  }
  const sura = loadQuran().suras[pos.chapter]
  return sura ? `${sura.name} ${sura.number}:${pos.verse + 1}` : 'Al-Faatiha 1:1'
}

/**
 * Session length that finishes the canon in ~planMonths at the user's
 * current schedule (daily times + interval fires per day), clamped to a
 * readable range.
 */
function planVersesPerSession(kind: ScriptureKind): number {
  const schedule = store.get('schedule')
  const perDay =
    schedule.times.length +
    (schedule.intervalHours !== null && schedule.intervalHours > 0
      ? Math.floor(24 / schedule.intervalHours)
      : 0)
  const sessionsPerDay = Math.min(12, Math.max(1, perDay))
  const months = Math.max(1, store.get('planMonths'))
  const total = totalVerses(countsFor(kind))
  const ideal = Math.ceil(total / (months * 30 * sessionsPerDay))
  return Math.min(40, Math.max(kind === 'bible' ? 5 : 3, ideal))
}

function planSummary(kind: ScriptureKind): PlanSummary {
  const progress = store.get('readingPlan')[kind]
  const counts = countsFor(kind)
  const total = totalVerses(counts)
  return {
    progressPct: Math.min(100, Math.round((progress.versesRead / total) * 1000) / 10),
    nextReference: positionLabel(kind, progress),
    versesPerSession: planVersesPerSession(kind)
  }
}

export function getPlanSummaries(): Record<ScriptureKind, PlanSummary> {
  return { bible: planSummary('bible'), quran: planSummary('quran') }
}

export function getSessionState(): LockSessionState {
  if (active) return { stage: 'session', session: active.session }
  const kind = chosenKind ?? store.get('scripture')
  if (kind === null) return { stage: 'kind' }
  return {
    stage: 'category',
    kind,
    categories: categoryOptionsFor(kind),
    plan: planSummary(kind),
    streak: currentStreak().current
  }
}

export function chooseScripture(kind: ScriptureKind): LockSessionState {
  if (!active) chosenKind = kind
  return getSessionState()
}

export function chooseCategory(categoryId: string): LockSessionState {
  if (active) return { stage: 'session', session: active.session }
  const kind = chosenKind ?? store.get('scripture')
  if (kind === null) return { stage: 'kind' }
  if (categoryId !== PLAN_CATEGORY_ID && !getCategory(categoryId)) {
    return getSessionState() // unknown id → re-offer categories
  }
  try {
    if (categoryId === PLAN_CATEGORY_ID) createPlanSession(kind)
    else createSession(kind, categoryId)
  } catch (err) {
    // Fail open: a session we cannot build must free the user, not strand
    // them on the category screen.
    console.error('[godfirst] could not build session — failing open', err)
    endLock('error')
  }
  return getSessionState()
}

/** Called when the renderer reports genuine completion (+ mood answer). */
export function completeActivity(mood: unknown): void {
  if (!isLocked()) return
  if (active) {
    const validMood: Mood | null = MOODS.includes(mood as Mood) ? (mood as Mood) : null
    const { session } = active

    if (active.passageId !== null) {
      const recent = store.get('recentPassages')
      const kindRecent = [...(recent[session.kind] ?? []), active.passageId].slice(-RECENT_CAP)
      store.set('recentPassages', { ...recent, [session.kind]: kindRecent })
    }

    if (active.planAdvance !== null) {
      const plans = store.get('readingPlan')
      const prev = plans[session.kind]
      const { next, count, wrapped } = active.planAdvance
      store.set('readingPlan', {
        ...plans,
        [session.kind]: {
          ...next,
          // A wrap means the whole canon was finished — start the count over.
          versesRead: wrapped ? 0 : prev.versesRead + count
        }
      })
      if (wrapped) {
        console.log(`[godfirst] reading plan COMPLETE for ${session.kind} — starting over`)
      }
    }

    const log = store.get('sessionLog')
    store.set('sessionLog', [
      ...log.slice(-(SESSION_LOG_CAP - 1)),
      {
        at: new Date().toISOString(),
        kind: session.kind,
        categoryId: session.categoryId,
        reference: session.reference,
        mood: validMood
      }
    ])

    // Daily streak: one completed session keeps the day alive.
    const now = new Date()
    const streak = advanceStreak(store.get('streak'), localDateString(now), yesterdayOf(now))
    store.set('streak', streak)

    console.log(
      `[godfirst] activity complete (${session.reference}, ${session.categoryId}, mood=${validMood ?? 'skipped'})`
    )
    active = null
  }
  endLock('activity-complete')
}

const PLAN_REFLECTION =
  'Read slowly; this is a long walk, not a race. One faithful page at a time ' +
  'will carry you through the whole book — and the book, through you.'

/** The user sets minutes per session; per-verse dwell adapts to length. */
function paceFor(verseCount: number): number {
  const totalSeconds = Math.max(1, store.get('sessionMinutes')) * 60
  return Math.min(120, Math.max(3, Math.round(totalSeconds / Math.max(1, verseCount))))
}

function createSession(kind: ScriptureKind, categoryId: string): void {
  const category = getCategory(categoryId)!
  const recentIds = store.get('recentPassages')[kind] ?? []

  let verses: SessionVerse[]
  let reference: string
  let id: string

  if (kind === 'bible') {
    const data = loadBible()
    // Only offer passages that resolve against the data (belt-and-braces on
    // top of the catalog unit tests) — a bad ref must not block an unlock.
    const valid = category.bible.filter((p) => {
      const book = data.books.find((bk) => bk.name === p.book)
      const chapter = book?.chapters[p.chapter - 1]
      return chapter !== undefined && p.from >= 1 && p.to >= p.from && p.to <= chapter.length
    })
    const picked = pickRandomPassage(valid, (p) => passageId('bible', p), recentIds)
    if (!picked) throw new Error(`no valid bible passages for category ${categoryId}`)
    id = passageId('bible', picked)
    verses = versesForBible(data, picked)
    reference = `${picked.book} ${picked.chapter}:${picked.from}–${picked.to}`
  } else {
    const data = loadQuran()
    const valid = category.quran.filter((p) => {
      const sura = data.suras[p.sura - 1]
      return sura !== undefined && p.from >= 1 && p.to >= p.from && p.to <= sura.ayas.length
    })
    const picked = pickRandomPassage(valid, (p) => passageId('quran', p), recentIds)
    if (!picked) throw new Error(`no valid quran passages for category ${categoryId}`)
    id = passageId('quran', picked)
    verses = versesForQuran(data, picked)
    const sura = data.suras[picked.sura - 1]!
    reference = `${sura.name} ${picked.sura}:${picked.from}–${picked.to}`
  }

  active = {
    passageId: id,
    planAdvance: null,
    session: {
      kind,
      categoryId,
      categoryLabel: category.label,
      reference,
      verses,
      secondsPerVerse: paceFor(verses.length),
      reflection: category.reflection,
      streakAfterCompletion: previewStreak()
    }
  }
}

/** Next sequential slice of the whole canon. */
function createPlanSession(kind: ScriptureKind): void {
  const counts = countsFor(kind)
  const from = store.get('readingPlan')[kind]
  const n = planVersesPerSession(kind)
  const { refs, next, wrapped } = takeSequential(counts, from, n)
  if (refs.length === 0) throw new Error('empty plan session')

  let verses: SessionVerse[]
  let reference: string

  if (kind === 'bible') {
    const data = loadBible()
    verses = refs.map((ref) => ({
      label: `${data.books[ref.book]!.name} ${ref.chapter + 1}:${ref.verse + 1}`,
      en: data.books[ref.book]!.chapters[ref.chapter]![ref.verse]!
    }))
    const first = refs[0]!
    const last = refs[refs.length - 1]!
    reference =
      first.book === last.book
        ? `${data.books[first.book]!.name} ${first.chapter + 1}:${first.verse + 1} – ${last.chapter + 1}:${last.verse + 1}`
        : `${data.books[first.book]!.name} ${first.chapter + 1}:${first.verse + 1} – ${data.books[last.book]!.name} ${last.chapter + 1}:${last.verse + 1}`
  } else {
    const data = loadQuran()
    verses = refs.map((ref) => {
      const sura = data.suras[ref.chapter]!
      return {
        label: `${sura.number}:${ref.verse + 1}`,
        en: sura.ayas[ref.verse]!.en,
        ar: sura.ayas[ref.verse]!.ar
      }
    })
    const first = refs[0]!
    const last = refs[refs.length - 1]!
    const firstSura = data.suras[first.chapter]!
    const lastSura = data.suras[last.chapter]!
    reference =
      first.chapter === last.chapter
        ? `${firstSura.name} ${firstSura.number}:${first.verse + 1}–${last.verse + 1}`
        : `${firstSura.name} ${firstSura.number}:${first.verse + 1} – ${lastSura.name} ${lastSura.number}:${last.verse + 1}`
  }

  active = {
    passageId: null,
    planAdvance: { next, count: refs.length, wrapped },
    session: {
      kind,
      categoryId: PLAN_CATEGORY_ID,
      categoryLabel: 'Reading Plan',
      reference,
      verses,
      secondsPerVerse: paceFor(verses.length),
      reflection: PLAN_REFLECTION,
      streakAfterCompletion: previewStreak()
    }
  }
}

function versesForBible(data: BibleData, p: BiblePassage): SessionVerse[] {
  const book = data.books.find((bk) => bk.name === p.book)!
  const chapter = book.chapters[p.chapter - 1]!
  const verses: SessionVerse[] = []
  for (let v = p.from; v <= p.to; v++) {
    verses.push({ label: `${p.book} ${p.chapter}:${v}`, en: chapter[v - 1]! })
  }
  return verses
}

function versesForQuran(data: QuranData, p: QuranPassage): SessionVerse[] {
  const sura = data.suras[p.sura - 1]!
  const verses: SessionVerse[] = []
  for (let a = p.from; a <= p.to; a++) {
    const aya = sura.ayas[a - 1]!
    verses.push({ label: `${p.sura}:${a}`, en: aya.en, ar: aya.ar })
  }
  return verses
}
