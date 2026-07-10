import { useCallback, useEffect, useState } from 'react'
import type { SettingsView } from '@shared/ipc'
import DonateButton from '../components/DonateButton'
import {
  AutostartToggle,
  PasscodeSection,
  ReadingSection,
  ScheduleSection
} from '../settings/sections'

/**
 * First-run wizard. Five steps; the recovery passcode step cannot be
 * skipped — an app that can lock your screen must never exist without its
 * break-glass escape configured.
 */

const STEPS = ['Welcome', 'Recovery passcode', 'Camera', 'Reading', 'Schedule', 'Finish'] as const

export default function Onboarding(): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [view, setView] = useState<SettingsView | null>(null)

  const reload = useCallback(() => {
    void window.godfirst.settings.get().then(setView)
  }, [])

  useEffect(reload, [reload])

  if (!view) return <div className="p-8 text-neutral-500">Loading…</div>

  const canContinue = step !== 1 || view.hasPasscode
  const isLast = step === STEPS.length - 1

  return (
    <div className="flex h-screen flex-col p-8">
      {/* step indicator */}
      <div className="mb-6 flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`h-1 flex-1 rounded ${i <= step ? 'bg-neutral-300' : 'bg-neutral-800'}`}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="text-4xl">📖</div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to GodFirst</h1>
            <p className="text-sm leading-relaxed text-neutral-300">
              GodFirst runs quietly in your {view && window.godfirst.platform === 'darwin' ? 'menu bar' : 'system tray'}.
              On the schedule you choose, it locks your screen behind a fullscreen overlay until
              you finish a short scripture reading — a deliberate interruption that makes you
              stop and reset.
            </p>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-400">
              <span className="font-medium text-neutral-200">Private by construction.</span> GodFirst
              is fully offline: no account, no telemetry, no update checks, no network requests —
              ever. Everything, including the scripture text, lives on this machine.
            </div>
            <p className="text-xs text-neutral-500">
              You always stay in control: OS escapes like the power button are never blocked, and
              you're about to set an emergency exit of your own.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Your emergency exit</h1>
            <p className="text-sm leading-relaxed text-neutral-300">
              If a lock ever appears at a terrible moment, the{' '}
              <span className="text-neutral-100">recovery passcode</span> frees you immediately —
              it's the only way out besides finishing the reading, so this step can't be skipped.
              GodFirst will refuse to lock at all until one is set.
            </p>
            <PasscodeSection hasPasscode={view.hasPasscode} onChanged={reload} />
            {view.hasPasscode && (
              <p className="text-xs text-green-400">Passcode set — you can continue.</p>
            )}
          </div>
        )}

        {step === 2 && <CameraStep granted={view.cameraGranted} onChanged={reload} />}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">What you'll read</h1>
            <ReadingSection view={view} onChanged={reload} />
            <p className="text-xs leading-relaxed text-neutral-500">
              At each lock you pick a theme (encouragement, peace, forgiveness, …) and a passage
              from it is chosen for you, revealed at your reading pace, followed by a quick
              fill-in-the-blank from what you just read.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">When it locks</h1>
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-xs leading-relaxed text-neutral-300">
              <span className="font-medium text-amber-300">
                Already on: after {view.schedule.activeUseHours ?? 3} hours of real use.
              </span>{' '}
              GodFirst watches how long you've actually been at the keyboard — once you've been
              working for {view.schedule.activeUseHours ?? 3} hours (cumulative since your last
              reading), it locks for a session. Idle time, sleep, and days the computer sits
              unused don't count, so it never interrupts a machine nobody is using. Adjust the
              hours below, or add fixed times on top.
            </div>
            <ScheduleSection schedule={view.schedule} onChanged={reload} />
            <p className="text-xs text-neutral-500">
              You can also lock on demand from the tray ("Lock me now") and pause the schedule
              for an hour when you need to.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Last things</h1>
            <AutostartToggle view={view} onChanged={reload} />
            <p className="text-xs text-neutral-500">
              Recommended on — GodFirst only keeps you honest if it's running.
            </p>
            {window.godfirst.platform === 'darwin' && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-400">
                <span className="font-medium text-neutral-200">macOS keyboard note.</span> While
                locked, GodFirst suppresses most app-switching shortcuts. Fully intercepting
                system chords like Cmd+Tab would need the Accessibility permission — optional,
                and the overlay stays on top either way (switching apps just shows black).
                <button
                  onClick={() => void window.godfirst.app.openAccessibilitySettings()}
                  className="mt-2 block underline hover:text-neutral-200"
                >
                  Open System Settings → Privacy &amp; Security → Accessibility
                </button>
              </div>
            )}
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm leading-relaxed text-neutral-200">
              <span className="font-medium text-emerald-300">One more thing:</span> when you click
              Finish, GodFirst will run your <span className="font-medium">first reading session
              right now</span> — a real lock, exactly as it will happen on your schedule — so you
              see the whole flow once and start your streak on day one. (Your recovery passcode
              works if you need out.)
            </div>
            <p className="text-sm text-neutral-300">
              After that, GodFirst lives in the tray — this window won't open again on its own.
            </p>
            <p className="text-xs text-neutral-500">
              GodFirst is free and offline, with no accounts or ads. If it earns its keep, you
              can <DonateButton className="text-neutral-400 hover:text-neutral-200" /> anytime
              from here or Settings.
            </p>
          </div>
        )}
      </div>

      {/* nav */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded border border-neutral-700 px-4 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-30"
        >
          Back
        </button>
        <div className="text-xs text-neutral-600">{STEPS[step]}</div>
        <button
          data-testid="onboarding-continue"
          onClick={() => {
            if (isLast) void window.godfirst.app.finishOnboarding()
            else setStep((s) => s + 1)
          }}
          disabled={!canContinue}
          className="rounded bg-neutral-100 px-5 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
          title={canContinue ? undefined : 'Set a recovery passcode first'}
        >
          {isLast ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function CameraStep({
  granted,
  onChanged
}: {
  granted: boolean
  onChanged: () => void
}): React.JSX.Element {
  const [denied, setDenied] = useState(false)
  const [askedOnce, setAskedOnce] = useState(false)

  const request = useCallback(() => {
    void window.godfirst.app.requestCameraAccess().then((ok) => {
      setDenied(!ok)
      onChanged()
    })
  }, [onChanged])

  // The explanation below is on screen — request permission right away so
  // the system prompt appears while the "why" is visible. (This is also the
  // ONLY safe moment: mid-lock, the prompt would hide behind the overlay.)
  useEffect(() => {
    if (!granted && !askedOnce) {
      setAskedOnce(true)
      request()
    }
  }, [granted, askedOnce, request])

  return (
    <div className="flex flex-col gap-4">
      <div className="text-4xl">📷</div>
      <h1 className="text-2xl font-semibold tracking-tight">Why GodFirst asks for your camera</h1>
      <p className="text-sm leading-relaxed text-neutral-300">
        A reading only counts if someone is actually reading it. During a session, GodFirst
        looks for a face in front of the screen:
      </p>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed text-neutral-300">
        <li>
          <span className="text-neutral-100">You're there</span> — the passage unfolds at your
          reading pace.
        </li>
        <li>
          <span className="text-neutral-100">You walk away</span> — the timer pauses and waits,
          so a session can't be waited out from another room.
        </li>
      </ul>
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-400">
        <span className="font-medium text-neutral-200">Your privacy is absolute.</span> Face
        detection runs entirely on this device — no video or image is ever recorded, stored, or
        transmitted (GodFirst has no internet capability at all). The camera is active only
        during the reading itself, never in the background.
      </div>

      {granted ? (
        <p className="text-sm text-green-400">✓ Camera access granted — the presence check is on.</p>
      ) : denied ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-amber-400">
            Camera access was declined. Everything still works — readings just won't pause when
            you step away. To enable it later:
          </p>
          <div className="flex gap-2">
            <button
              onClick={request}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
            >
              Try again
            </button>
            {window.godfirst.platform === 'darwin' && (
              <button
                onClick={() => void window.godfirst.app.openCameraSettings()}
                className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
              >
                Open System Settings → Camera
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={request}
          className="self-start rounded bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          Enable camera
        </button>
      )}
    </div>
  )
}
