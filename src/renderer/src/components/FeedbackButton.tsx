import { useState } from 'react'

/**
 * Opens the user's mail app pre-addressed to the maintainer so they can send
 * feedback. GodFirst is offline and runs no server — there is no form and
 * nothing is collected; it just hands off to the default mail client. During a
 * lock the main process defers the open until the screen unlocks (the overlay
 * would hide the mail window), and the label says so.
 */
export default function FeedbackButton({
  variant = 'link',
  className
}: {
  variant?: 'link' | 'button'
  className?: string
}): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'deferred' | 'opened'>('idle')

  if (state === 'deferred') {
    return (
      <span className="text-xs text-neutral-500">
        ✉️ your mail app opens when the screen unlocks
      </span>
    )
  }
  if (state === 'opened') {
    return <span className="text-xs text-neutral-500">✉️ thank you for the feedback!</span>
  }

  const click = (): void => {
    void window.godfirst.app.feedback().then((r) => setState(r.deferred ? 'deferred' : 'opened'))
  }

  if (variant === 'button') {
    return (
      <button
        onClick={click}
        title="Send feedback to the GodFirst maintainer"
        className={
          className ??
          'rounded-lg border border-sky-900/60 bg-sky-950/30 px-5 py-2.5 text-sm text-sky-200 hover:border-sky-600 hover:bg-sky-950/50'
        }
      >
        ✉️ Send feedback
      </button>
    )
  }

  return (
    <button
      onClick={click}
      className={`text-[11px] underline-offset-2 hover:underline ${className ?? 'text-neutral-600 hover:text-neutral-300'}`}
      title="Send feedback to the GodFirst maintainer"
    >
      ✉ Send feedback
    </button>
  )
}
