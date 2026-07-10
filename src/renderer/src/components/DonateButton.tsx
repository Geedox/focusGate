import { useState } from 'react'

/**
 * Opens the donation page in the system browser. During a lock the main
 * process defers the open until the screen unlocks (the overlay would hide
 * the browser), and the label says so.
 */
export default function DonateButton({
  variant = 'link',
  className
}: {
  variant?: 'link' | 'button'
  className?: string
}): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'deferred' | 'opened'>('idle')

  if (state === 'deferred') {
    return (
      <span className="text-xs text-neutral-500">💛 opens when the screen unlocks — thank you!</span>
    )
  }
  if (state === 'opened') {
    return <span className="text-xs text-neutral-500">💛 thank you!</span>
  }

  const click = (): void => {
    void window.godfirst.app.donate().then((r) => setState(r.deferred ? 'deferred' : 'opened'))
  }

  if (variant === 'button') {
    return (
      <button
        onClick={click}
        title="Support GodFirst's development"
        className={
          className ??
          'rounded-lg border border-rose-900/60 bg-rose-950/30 px-5 py-2.5 text-sm text-rose-200 hover:border-rose-600 hover:bg-rose-950/50'
        }
      >
        ❤️ Support development
      </button>
    )
  }

  return (
    <button
      onClick={click}
      className={`text-[11px] underline-offset-2 hover:underline ${className ?? 'text-neutral-600 hover:text-neutral-300'}`}
      title="Support GodFirst's development"
    >
      ♥ Support development
    </button>
  )
}
