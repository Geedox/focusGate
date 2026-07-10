import { useCallback, useEffect, useState } from 'react'
import type { SettingsView } from '@shared/ipc'
import DonateButton from '../components/DonateButton'
import ShareStreakButton from '../components/ShareStreakButton'
import {
  AutostartToggle,
  CameraSection,
  UpdateSection,
  PasscodeSection,
  PlanSection,
  ReadingSection,
  ScheduleSection
} from './sections'

export default function Settings(): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)

  const reload = useCallback(() => {
    void window.godfirst.settings.get().then(setView)
  }, [])

  useEffect(reload, [reload])

  if (!view) return <div className="p-8 text-neutral-500">Loading…</div>

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">GodFirst Settings</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Fully offline — no accounts, no network, ever.
        </p>
        {(view.streak.current > 0 || view.streak.best > 0) && (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm text-amber-300">
              🔥 {view.streak.current}-day reading streak
              <span className="ml-2 text-xs text-neutral-500">(best: {view.streak.best} days)</span>
            </p>
            <ShareStreakButton current={view.streak.current} best={view.streak.best} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => void window.godfirst.app.command('lock-now')}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
        >
          Lock me now
        </button>
        <button
          onClick={() => void window.godfirst.app.command('pause-1h')}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
        >
          Pause for 1 hour
        </button>
        <button
          onClick={() => void window.godfirst.app.command('quit')}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900"
        >
          Quit GodFirst
        </button>
      </div>

      <AutostartToggle view={view} onChanged={reload} />
      <ReadingSection view={view} onChanged={reload} />
      <PlanSection view={view} onChanged={reload} />
      <CameraSection view={view} onChanged={reload} />
      <UpdateSection view={view} onChanged={reload} />
      <ScheduleSection schedule={view.schedule} onChanged={reload} />
      <PasscodeSection hasPasscode={view.hasPasscode} onChanged={reload} />

      <div className="border-t border-neutral-800 pt-5">
        <p className="text-xs text-neutral-500">
          GodFirst is free, offline, and has no accounts or ads. If it helps you, you can support
          its continued development — <DonateButton className="text-neutral-400 hover:text-neutral-200" />
        </p>
      </div>
    </div>
  )
}
