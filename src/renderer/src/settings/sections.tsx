import { useState } from 'react'
import type { ScheduleConfig, SettingsView } from '@shared/ipc'

/**
 * Settings building blocks shared by the settings window and the first-run
 * onboarding wizard. Each writes through IPC immediately and calls
 * onChanged() so the host can re-fetch the view.
 */

export const inputClass =
  'rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500'

export function AutostartToggle({
  view,
  onChanged
}: {
  view: SettingsView
  onChanged: () => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm">Start GodFirst when I log in</span>
      <input
        type="checkbox"
        checked={view.launchAtLogin}
        onChange={(e) => {
          void window.godfirst.settings.setLaunchAtLogin(e.target.checked).then(onChanged)
        }}
        className="h-4 w-4 accent-neutral-300"
      />
    </label>
  )
}

export function ReadingSection({
  view,
  onChanged
}: {
  view: SettingsView
  onChanged: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Reading</h2>
      <div className="flex flex-col gap-1.5 text-sm">
        {(
          [
            ['bible', 'Bible (King James Version)'],
            ['quran', 'Quran (Arabic + Pickthall English)'],
            [null, 'Ask me each time']
          ] as const
        ).map(([value, label]) => (
          <label key={String(value)} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="scripture"
              checked={view.scripture === value}
              onChange={() => {
                void window.godfirst.settings.setScripture(value).then(onChanged)
              }}
              className="accent-neutral-300"
            />
            {label}
          </label>
        ))}
      </div>
      <label className="mt-2 flex items-center justify-between text-sm">
        <span>
          Reading duration
          <span className="ml-2 text-xs text-neutral-500">(minutes per session, 1–60)</span>
        </span>
        <input
          type="number"
          min={1}
          max={60}
          value={view.sessionMinutes}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) {
              void window.godfirst.settings.setSessionMinutes(v).then(onChanged)
            }
          }}
          className={`${inputClass} w-20 px-2 py-1 text-right`}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Each session takes about this long regardless of passage length — the per-verse pace
        adapts automatically.
      </p>
    </div>
  )
}

export function CameraSection({
  view,
  onChanged
}: {
  view: SettingsView
  onChanged: () => void
}): React.JSX.Element {
  const [denied, setDenied] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Reading presence (camera)</h2>
      <p className="text-xs text-neutral-500">
        During a reading, on-device face detection pauses the timer when nobody is in front of
        the screen. No video is recorded or transmitted; the camera runs only while reading.
      </p>
      {view.cameraGranted ? (
        <p className="text-xs text-green-400">Camera access granted — presence check is active.</p>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              void window.godfirst.app.requestCameraAccess().then((granted) => {
                setDenied(!granted)
                onChanged()
              })
            }}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
          >
            Enable camera
          </button>
          {denied && (
            <span className="text-xs text-amber-400">
              Denied — allow it under System Settings → Privacy &amp; Security → Camera.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function PlanSection({
  view,
  onChanged
}: {
  view: SettingsView
  onChanged: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-medium">Reading plan</h2>
        <p className="mt-1 text-xs text-neutral-500">
          The "Reading Plan" option on the lock screen walks the whole text cover to cover.
          Session length adapts to your schedule to finish in the target time.
        </p>
      </div>
      <label className="flex items-center justify-between text-sm">
        <span>Finish the whole text in</span>
        <select
          value={view.planMonths}
          onChange={(e) => {
            void window.godfirst.settings.setPlanMonths(Number(e.target.value)).then(onChanged)
          }}
          className={`${inputClass} w-32 px-2 py-1`}
        >
          {[3, 6, 12, 18, 24, 36].map((m) => (
            <option key={m} value={m}>
              {m >= 12 ? `${m / 12} year${m > 12 ? 's' : ''}` : `${m} months`}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-1 flex flex-col gap-1 text-xs text-neutral-500">
        <div>
          Bible: {view.plan.bible.progressPct}% · next {view.plan.bible.nextReference} ·{' '}
          {view.plan.bible.versesPerSession} verses/session
        </div>
        <div>
          Quran: {view.plan.quran.progressPct}% · next {view.plan.quran.nextReference} ·{' '}
          {view.plan.quran.versesPerSession} verses/session
        </div>
      </div>
    </div>
  )
}

export function ScheduleSection({
  schedule,
  onChanged
}: {
  schedule: ScheduleConfig
  onChanged: () => void
}): React.JSX.Element {
  const [newTime, setNewTime] = useState('')

  const save = (config: ScheduleConfig): void => {
    void window.godfirst.settings.setSchedule(config).then(onChanged)
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-medium">Schedule</h2>
        <p className="mt-1 text-xs text-neutral-500">
          When GodFirst locks your screen automatically. Both kinds can be active at once.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {schedule.times.map((t) => (
          <div key={t} className="flex items-center justify-between text-sm">
            <span>Daily at {t}</span>
            <button
              onClick={() => save({ ...schedule, times: schedule.times.filter((x) => x !== t) })}
              className="text-xs text-neutral-500 underline hover:text-neutral-300"
            >
              remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className={`${inputClass} px-2 py-1`}
          />
          <button
            disabled={newTime.length === 0}
            onClick={() => {
              save({ ...schedule, times: [...schedule.times, newTime] })
              setNewTime('')
            }}
            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-40"
          >
            Add time
          </button>
        </div>
      </div>

      <label className="mt-2 flex items-center justify-between text-sm">
        <span>
          Lock after active use of
          <span className="ml-2 text-xs text-neutral-500">(hours, 0.5–16; empty = off)</span>
        </span>
        <input
          type="number"
          min={0.5}
          max={16}
          step={0.5}
          value={schedule.activeUseHours ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            save({ ...schedule, activeUseHours: v !== null && Number.isFinite(v) ? v : null })
          }}
          className={`${inputClass} w-20 px-2 py-1 text-right`}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Counts real keyboard/mouse time only — idle time, sleep, and days the computer sits
        unused don't count, so this never fires on a machine that isn't being used.
      </p>
    </div>
  )
}

export function UpdateSection({
  view,
  onChanged
}: {
  view: SettingsView
  onChanged: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Updates</h2>
      {view.availableUpdate !== null && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3">
          <span className="text-sm text-emerald-200">
            \u2b06 GodFirst v{view.availableUpdate} is available (you have v{view.appVersion})
          </span>
          <button
            onClick={() => void window.godfirst.app.openDownloadPage()}
            className="rounded bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-white"
          >
            Download
          </button>
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-between text-sm">
        <span>
          Check for updates once a day
          <span className="ml-2 block text-xs text-neutral-500">
            The app's only network use: it fetches the latest version number \u2014 nothing about
            you is ever sent. Turn it off for a fully offline app.
          </span>
        </span>
        <input
          type="checkbox"
          checked={view.updateCheckEnabled}
          onChange={(e) => {
            void window.godfirst.settings.setUpdateCheck(e.target.checked).then(onChanged)
          }}
          className="h-4 w-4 shrink-0 accent-neutral-300"
        />
      </label>
      {view.availableUpdate === null && (
        <p className="text-xs text-neutral-600">You're on v{view.appVersion}.</p>
      )}
    </div>
  )
}
