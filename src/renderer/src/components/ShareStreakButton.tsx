import { useState } from 'react'
import { renderStreakCard } from './streakCard'

/**
 * Renders the streak card on-device and copies it to the clipboard, ready
 * to paste to friends (WhatsApp, iMessage, anywhere). No network involved.
 */
export default function ShareStreakButton({
  current,
  best
}: {
  current: number
  best: number
}): React.JSX.Element | null {
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle')

  if (current < 1) return null

  if (state === 'copied') {
    return (
      <span className="text-xs text-green-400">
        ✓ Streak card copied — paste it to your friends
      </span>
    )
  }

  return (
    <button
      disabled={state === 'busy'}
      onClick={() => {
        setState('busy')
        void renderStreakCard(current, Math.max(best, current))
          .then((png) => window.godfirst.app.shareStreak(png))
          .then((ok) => setState(ok ? 'copied' : 'failed'))
          .catch(() => setState('failed'))
      }}
      className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-2 text-xs text-amber-200 hover:border-amber-600 hover:bg-amber-950/50 disabled:opacity-50"
      title="Copy a streak card image to share"
    >
      {state === 'failed' ? 'Could not copy — try again' : '📤 Share my streak'}
    </button>
  )
}
