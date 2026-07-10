import { useEffect, useMemo, useRef, useState } from 'react'
import type { Mood, ScriptureSession } from '@shared/ipc'
import { MOODS } from '@shared/ipc'
import { useFacePresence } from '@renderer/lock/facePresence'
import DonateButton from '@renderer/components/DonateButton'
import ShareStreakButton from '@renderer/components/ShareStreakButton'
import type { ActivityContext, ActivityModule } from '../types'
import { checkAnswers, pickBlanks, splitWords } from './blanks'
import { SCRIPTURE_THEMES } from './theme'

/**
 * The v1 activity: timed scripture reader + fill-in-the-blank check.
 *
 * Session phases: intro (Start button) → reading → check → mood.
 *
 * Anti-skip mechanics:
 *  - Verses reveal on a dwell timer with no fast-forward input.
 *  - The timer only accrues while the camera sees a face (walking away
 *    pauses it). If the camera is unavailable, the timer runs normally —
 *    presence detection must never strand a present reader.
 *  - One verse then reappears with 2–3 words blanked; typing them (scrolling
 *    back is allowed — that's re-reading) completes the check.
 */

type Phase = 'intro' | 'reading' | 'check' | 'mood'

const MOOD_LABELS: Record<Mood, string> = {
  calmer: '😌 Calmer',
  encouraged: '💪 Encouraged',
  neutral: '😐 About the same',
  heavy: '😔 Sitting heavy'
}

function Reader({
  session,
  ctx
}: {
  session: ScriptureSession
  ctx: ActivityContext
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro')
  const total = session.verses.length
  const totalSeconds = total * session.secondsPerVerse
  const [remaining, setRemaining] = useState(totalSeconds)
  const currentRef = useRef<HTMLDivElement | null>(null)
  const theme = SCRIPTURE_THEMES[session.kind]

  // Camera runs only while reading/checking, not on the intro/mood screens.
  const presence = useFacePresence(phase === 'reading' || phase === 'check', ctx.cameraGranted)

  // Dwell countdown: the FULL passage is visible from the start (real
  // readers move unevenly and re-read); honesty is enforced by time — the
  // countdown only runs while a face is present (or detection is off).
  const elapsedRef = useRef(0)
  useEffect(() => {
    if (phase !== 'reading') return
    const TICK_MS = 250
    const timer = window.setInterval(() => {
      if (!presence.present) return
      elapsedRef.current += TICK_MS / 1000
      const left = Math.max(0, totalSeconds - elapsedRef.current)
      setRemaining(left)
      if (left <= 0) setPhase('check')
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [phase, totalSeconds, presence.present])

  useEffect(() => {
    if (phase === 'check') {
      currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [phase])

  const countdown = `${Math.floor(remaining / 60)}:${String(Math.ceil(remaining % 60)).padStart(2, '0')}`

  if (phase === 'intro') {
    return (
      <div className="flex h-full w-full max-w-2xl flex-col items-center justify-center px-8 text-center">
        <div className={`text-xs uppercase tracking-widest ${theme.accentText}`}>
          {session.categoryLabel}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{session.reference}</h1>
        <p className="mt-3 text-sm text-neutral-400">
          {total} verses · about {Math.ceil((total * session.secondsPerVerse) / 60)} min ·{' '}
          {session.kind === 'bible' ? 'King James Version' : 'Quran, Pickthall translation'}
        </p>
        <p className="mt-6 max-w-md text-xs leading-relaxed text-neutral-500">
          {ctx.cameraGranted
            ? "The whole passage is yours to read at your own pace; the screen unlocks once the timer completes, and your camera checks you're still there — walking away pauses it. Everything runs on this device; no video ever leaves your machine."
            : 'The whole passage is yours to read at your own pace; the screen unlocks once the timer completes. Camera presence check is off (no permission) — enable it anytime in Settings.'}
        </p>
        <button
          data-testid="start-reading"
          onClick={() => setPhase('reading')}
          className={`mt-8 rounded-lg px-10 py-3 text-lg font-medium ${theme.accentButton}`}
        >
          Start reading
        </button>
      </div>
    )
  }

  if (phase === 'mood') {
    return <MoodPanel session={session} ctx={ctx} />
  }

  return (
    <div className="flex h-full w-full max-w-3xl flex-col px-8">
      <div className="border-b border-neutral-800/60 pb-3 pt-6 text-center">
        <div className={`text-xs uppercase tracking-widest ${theme.accentText}`}>
          {session.categoryLabel} · {session.kind === 'bible' ? 'King James Version' : 'Quran — Pickthall'}
        </div>
        <div className="mt-1 text-lg font-medium">{session.reference}</div>
        <div className="mt-1 text-xs text-neutral-500">
          {phase === 'check' ? (
            'Reading time complete — answer the question below to unlock.'
          ) : (
            <>
              Read at your own pace — unlocks in{' '}
              <span className={`font-medium tabular-nums ${theme.accentText}`}>{countdown}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <div className="flex flex-col gap-5">
          {session.verses.map((verse) => (
            <div key={verse.label}>
              {verse.ar && (
                <div dir="rtl" lang="ar" className="mb-1 text-right text-2xl leading-relaxed">
                  {verse.ar}
                </div>
              )}
              <div className="text-base leading-relaxed text-neutral-200">
                <span className="mr-2 align-super text-[10px] text-neutral-500">
                  {verse.label}
                </span>{' '}
                {verse.en}
              </div>
            </div>
          ))}

          {phase === 'check' && (
            <div ref={currentRef} className="flex flex-col gap-4">
              {/* A brief word on the passage before the check. */}
              <div className="rounded-lg border border-neutral-800/70 bg-neutral-950/60 p-5 backdrop-blur-sm">
                <div className={`text-xs uppercase tracking-widest ${theme.accentText}`}>
                  A brief word
                </div>
                <p className="mt-2 text-sm italic leading-relaxed text-neutral-300">
                  {session.reflection}
                </p>
              </div>
              <CheckPanel session={session} onPassed={() => setPhase('mood')} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 pb-4">
        {phase === 'reading' && (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded bg-neutral-800/70">
              <div
                className={`h-full transition-[width] duration-500 ${theme.accentBar}`}
                style={{ width: `${((totalSeconds - remaining) / totalSeconds) * 100}%` }}
              />
            </div>
            <div className={`text-xs font-medium tabular-nums ${theme.accentText}`}>
              {countdown}
            </div>
          </>
        )}
        <PresenceChip present={presence.present} status={presence.status} />
      </div>

      {/* Self-view while "paused": show exactly what the camera sees so the
          reader can fix angle/lighting instead of distrusting the app. */}
      {presence.status === 'active' && !presence.present && presence.stream && (
        <div className="absolute bottom-20 right-6 w-44 overflow-hidden rounded-lg border border-amber-800/60 bg-black shadow-lg">
          <video
            autoPlay
            muted
            playsInline
            ref={(el) => {
              if (el && el.srcObject !== presence.stream) el.srcObject = presence.stream
            }}
            className="w-full -scale-x-100"
          />
          <div className="px-2 py-1.5 text-center text-[10px] leading-snug text-amber-300">
            Can't see a face — adjust your angle or add some light
          </div>
        </div>
      )}
    </div>
  )
}

function PresenceChip({
  present,
  status
}: {
  present: boolean
  status: 'starting' | 'active' | 'unavailable' | 'no-permission'
}): React.JSX.Element | null {
  if (status === 'starting') {
    return <div className="text-[11px] text-neutral-600">📷 starting camera…</div>
  }
  if (status === 'no-permission') {
    return (
      <div className="text-[11px] text-neutral-600">
        📷 presence check off — enable the camera in Settings
      </div>
    )
  }
  if (status === 'unavailable') {
    return <div className="text-[11px] text-neutral-600">📷 camera unavailable — presence check off</div>
  }
  return present ? (
    <div className="text-[11px] text-neutral-500">📷 reading with you</div>
  ) : (
    <div className="rounded bg-amber-950 px-2 py-1 text-[11px] text-amber-400">
      ⏸ paused — come back to the screen
    </div>
  )
}

function CheckPanel({
  session,
  onPassed
}: {
  session: ScriptureSession
  onPassed: () => void
}): React.JSX.Element {
  const { verseIndex, words, spec } = useMemo(() => {
    const verseIndex = Math.floor(Math.random() * session.verses.length)
    const words = splitWords(session.verses[verseIndex]!.en)
    return { verseIndex, words, spec: pickBlanks(words) }
  }, [session])

  const [answers, setAnswers] = useState<string[]>(() => spec.wordIndexes.map(() => ''))
  const [error, setError] = useState<string | null>(null)
  const verse = session.verses[verseIndex]!

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (checkAnswers(words, spec, answers)) {
      onPassed()
    } else {
      setError('Not quite — scroll back and find the verse.')
    }
  }

  let blankCursor = 0
  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-neutral-800/70 bg-neutral-950/70 p-5 backdrop-blur-sm"
    >
      <div className="text-xs uppercase tracking-widest text-neutral-500">
        Fill in the missing words — {verse.label}
      </div>
      <p className="mt-3 leading-loose text-neutral-200">
        {words.map((word, i) => {
          if (spec.wordIndexes.includes(i)) {
            const answerIndex = blankCursor++
            return (
              <input
                key={i}
                value={answers[answerIndex] ?? ''}
                onChange={(e) => {
                  const next = [...answers]
                  next[answerIndex] = e.target.value
                  setAnswers(next)
                  setError(null)
                }}
                size={Math.max(4, word.length)}
                autoFocus={answerIndex === 0}
                className="mx-1 rounded border-b border-neutral-600 bg-neutral-900 px-2 py-0.5 text-center text-sm outline-none focus:border-neutral-300"
              />
            )
          }
          return <span key={i}>{word} </span>
        })}
      </p>
      {error && <div className="mt-3 text-xs text-amber-400">{error}</div>}
      <button
        type="submit"
        className="mt-4 rounded bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
      >
        Check & unlock
      </button>
    </form>
  )
}

function MoodPanel({
  session,
  ctx
}: {
  session: ScriptureSession
  ctx: ActivityContext
}): React.JSX.Element {
  // Selecting a mood does NOT unlock — the reader stays here to share their
  // streak or support development, and leaves via the explicit Unlock button.
  const [selected, setSelected] = useState<Mood | null>(null)
  const firedRef = useRef(false)
  const unlock = (): void => {
    if (firedRef.current) return
    firedRef.current = true
    ctx.onComplete(selected)
  }

  return (
    <div className="flex h-full w-full max-w-xl flex-col items-center justify-center px-8 text-center">
      <div className="text-4xl">✅</div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Well read.</h1>
      {session.streakAfterCompletion > 0 && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-amber-300">
            🔥 {session.streakAfterCompletion}-day streak
            {session.streakAfterCompletion === 1 ? ' — day one. Come back tomorrow.' : ' — keep it alive tomorrow.'}
          </p>
          <ShareStreakButton
            current={session.streakAfterCompletion}
            best={session.streakAfterCompletion}
          />
        </div>
      )}
      <p className="mt-2 text-sm text-neutral-400">
        {session.reference} — how do you feel after this session?
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {MOODS.map((mood) => (
          <button
            key={mood}
            onClick={() => setSelected((m) => (m === mood ? null : mood))}
            className={`rounded-lg border px-5 py-3 text-sm ${
              selected === mood
                ? 'border-neutral-300 bg-neutral-100 text-neutral-900'
                : 'border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            {MOOD_LABELS[mood]}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <DonateButton variant="button" />
        <button
          data-testid="unlock-screen"
          onClick={unlock}
          className="rounded-lg bg-neutral-100 px-8 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          🔓 Unlock screen
        </button>
      </div>
      <p className="mt-3 text-[11px] text-neutral-600">
        {selected
          ? 'Your answer will be saved when you unlock.'
          : 'You can unlock with or without answering.'}
      </p>
    </div>
  )
}

export const scriptureActivity: ActivityModule<ScriptureSession> = {
  id: 'scripture',
  render: (session, ctx) => <Reader session={session} ctx={ctx} />
}
