import { useEffect, useState } from 'react'
import LockScreen from './lock/LockScreen'
import SecondaryLockScreen from './lock/SecondaryLockScreen'
import Onboarding from './onboarding/Onboarding'
import Settings from './settings/Settings'
import { renderStreakCard } from './components/streakCard'

function ShareCardPreview({ current, best }: { current: number; best: number }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    void renderStreakCard(current, best).then((png) => {
      setSrc(URL.createObjectURL(new Blob([png.slice().buffer], { type: 'image/png' })))
    })
  }, [current, best])
  return (
    <div className="flex h-screen items-center justify-center bg-black">
      {src ? <img src={src} className="max-w-full" /> : <span className="text-neutral-500">rendering…</span>}
    </div>
  )
}

/**
 * Hash-based routing (no router dep needed for 4 static routes):
 *   #/lock?role=primary    primary-display lock overlay
 *   #/lock?role=secondary  other displays
 *   #/onboarding           first-run wizard
 *   #/settings (default)   settings window
 */
function parseRoute(hash: string): { path: string; params: URLSearchParams } {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?')
  return { path, params: new URLSearchParams(query) }
}

export default function App(): React.JSX.Element {
  const { path, params } = parseRoute(window.location.hash)

  if (path === 'lock') {
    return params.get('role') === 'secondary' ? <SecondaryLockScreen /> : <LockScreen />
  }
  if (path === 'onboarding') return <Onboarding />
  if (path === 'sharecard') {
    // Dev-only visual check of the share-card renderer (reachable solely by
    // explicit hash; no UI links here).
    return (
      <ShareCardPreview
        current={Number(params.get('n') ?? 7)}
        best={Number(params.get('best') ?? 12)}
      />
    )
  }
  return <Settings />
}
