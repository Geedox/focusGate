import { useCallback, useEffect, useState } from 'react'
import { PLAN_CATEGORY_ID } from '@shared/ipc'
import type { LockContext, LockSessionState, Mood, ScriptureKind } from '@shared/ipc'
import { scriptureActivity } from '@activities/scripture/ScriptureActivity'
import { SCRIPTURE_THEMES } from '@activities/scripture/theme'

/**
 * Primary-display lock overlay. Flow: choose text (if unset) → choose
 * category → activity (start → read → check → mood). The break-glass escape
 * (the user's own OS login password) is always reachable at the bottom.
 */
export default function LockScreen(): React.JSX.Element {
  const [ctx, setCtx] = useState<LockContext | null>(null)
  const [state, setState] = useState<LockSessionState | null>(null)

  useEffect(() => {
    void window.godfirst.lock.getContext().then(setCtx)
    void window.godfirst.lock.getSession().then(setState)
  }, [])

  const chooseScripture = useCallback((kind: ScriptureKind) => {
    void window.godfirst.lock.chooseScripture(kind).then((s) => s && setState(s))
  }, [])

  const chooseCategory = useCallback((id: string) => {
    void window.godfirst.lock.chooseCategory(id).then((s) => s && setState(s))
  }, [])

  const onActivityComplete = useCallback((mood: Mood | null) => {
    void window.godfirst.lock.activityComplete(mood)
  }, [])

  // Session screens get the per-text themed backdrop; the earlier choice
  // screens stay plain black.
  const backdrop =
    state?.stage === 'session' ? SCRIPTURE_THEMES[state.session.kind].backdrop : undefined

  return (
    <div
      className="flex h-screen select-none flex-col items-center justify-center bg-black text-neutral-100"
      style={backdrop}
    >
      {ctx?.isDev && (
        <button
          onClick={() => void window.godfirst.lock.devUnlock()}
          className="absolute right-4 top-4 rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-900"
        >
          Unlock (dev only)
        </button>
      )}

      <div className="flex h-full w-full flex-col items-center overflow-hidden pb-20">
        {state === null ? (
          <div className="flex h-full items-center text-neutral-600">Loading…</div>
        ) : state.stage === 'kind' ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-6 text-5xl">🔒</div>
            <h1 className="text-3xl font-semibold tracking-tight">Screen locked</h1>
            <p className="mt-3 text-neutral-400">Choose what to read to unlock:</p>
            <div className="mt-6 flex gap-4">
              <button
                onClick={() => chooseScripture('bible')}
                className="rounded-lg border border-neutral-700 px-6 py-3 text-lg hover:bg-neutral-900"
              >
                Bible
              </button>
              <button
                onClick={() => chooseScripture('quran')}
                className="rounded-lg border border-neutral-700 px-6 py-3 text-lg hover:bg-neutral-900"
              >
                Quran
              </button>
            </div>
          </div>
        ) : state.stage === 'category' ? (
          <div className="flex h-full w-full max-w-4xl flex-col items-center justify-center px-8 text-center">
            <div className="mb-2 text-4xl">🔒</div>
            <h1 className="text-2xl font-semibold tracking-tight">What do you need right now?</h1>
            <p className="mt-2 text-sm text-neutral-400">
              A passage from this theme will be chosen for you.
            </p>
            {state.streak > 0 && (
              <div className="mt-3 rounded-full border border-amber-900/60 bg-amber-950/30 px-4 py-1 text-xs text-amber-300">
                🔥 {state.streak}-day reading streak — finish today's session to keep it
              </div>
            )}

            {/* Whole-canon reading plan — always first */}
            <button
              data-category={PLAN_CATEGORY_ID}
              onClick={() => chooseCategory(PLAN_CATEGORY_ID)}
              className={`mt-6 w-full rounded-lg border px-5 py-4 text-left ${
                state.kind === 'bible'
                  ? 'border-indigo-900 bg-indigo-950/30 hover:border-indigo-600'
                  : 'border-emerald-900 bg-emerald-950/30 hover:border-emerald-600'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-medium">
                  📖 Reading Plan — the whole {state.kind === 'bible' ? 'Bible' : 'Quran'}, cover
                  to cover
                </div>
                <div className="text-xs text-neutral-400">
                  {state.plan.progressPct}% complete
                </div>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-neutral-800">
                <div
                  className={`h-full ${state.kind === 'bible' ? 'bg-indigo-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.max(1, state.plan.progressPct)}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-neutral-500">
                Continue at {state.plan.nextReference} · {state.plan.versesPerSession} verses this
                session
              </div>
            </button>

            <div className="mt-4 grid max-h-[52vh] w-full grid-cols-3 gap-3 overflow-y-auto pr-1">
              {state.categories.map((category) => (
                <button
                  key={category.id}
                  data-category={category.id}
                  onClick={() => chooseCategory(category.id)}
                  className="rounded-lg border border-neutral-800 px-4 py-3 text-left hover:border-neutral-600 hover:bg-neutral-950"
                >
                  <div className="text-sm font-medium">{category.label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{category.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          scriptureActivity.render(state.session, {
            onComplete: onActivityComplete,
            cameraGranted: ctx?.cameraGranted ?? false
          })
        )}
      </div>

      <EmergencyUnlock osUsername={ctx?.osUsername ?? ''} />
    </div>
  )
}

/** Reveal the force-escape once the OS-password path clearly can't help. */
const FAILED_ATTEMPTS_BEFORE_FORCE = 5

function EmergencyUnlock({ osUsername }: { osUsername: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState(0)
  const [showForce, setShowForce] = useState(false)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (password.length === 0) return
    void window.godfirst.lock.unlock(password).then((result) => {
      if (result.ok) return // main tears down this window on success.
      setPassword('')
      setError(result.error ?? 'Incorrect password.')
      if (result.unavailable) {
        // Automatic verification can't decide — never trap: offer the escape.
        setShowForce(true)
        return
      }
      setFailures((n) => {
        const next = n + 1
        if (next >= FAILED_ATTEMPTS_BEFORE_FORCE) setShowForce(true)
        return next
      })
    })
  }

  const forceUnlock = (): void => {
    void window.godfirst.lock.forceUnlock()
  }

  return (
    <div className="absolute bottom-6 flex w-full max-w-md flex-col items-center gap-2 px-8">
      {open ? (
        <form onSubmit={submit} className="flex w-full flex-col items-center gap-2">
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            placeholder={
              osUsername ? `Password for ${osUsername}` : 'Your computer login password'
            }
            className="w-72 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-center text-sm outline-none focus:border-neutral-500"
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex gap-3 text-xs text-neutral-500">
            <button type="submit" className="underline hover:text-neutral-300">
              Unlock
            </button>
            <button
              type="button"
              className="hover:text-neutral-300"
              onClick={() => {
                setOpen(false)
                setPassword('')
                setError(null)
              }}
            >
              Cancel
            </button>
          </div>
          {showForce && (
            <div className="mt-1 flex flex-col items-center gap-1 text-center">
              <p className="max-w-xs text-[11px] leading-relaxed text-neutral-500">
                Can't get in with your computer password? Use the safety escape below — it
                unlocks now and turns off auto-start so this won't happen again.
              </p>
              <button
                type="button"
                onClick={forceUnlock}
                className="text-xs text-amber-500/80 underline hover:text-amber-400"
              >
                Force unlock &amp; disable auto-lock
              </button>
            </div>
          )}
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-neutral-700 underline hover:text-neutral-400"
        >
          Emergency unlock (your computer password)
        </button>
      )}
    </div>
  )
}
