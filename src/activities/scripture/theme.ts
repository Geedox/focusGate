import type { CSSProperties } from 'react'
import type { ScriptureKind } from '@shared/ipc'

/**
 * Per-text visual identity for the lock session screens. Everything is
 * generated locally (CSS gradients + inline SVG data URIs) — nothing
 * fetched, nothing bright enough to fight the text.
 *
 * Bible: deep indigo night with a warm dawn glow and a faint quatrefoil
 * lattice (gothic window tracery). Quran: deep emerald with a gold glow and
 * a faint eight-point star lattice (classic Islamic geometry).
 */

const quatrefoil = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'>` +
    `<g fill='none' stroke='#ffffff' stroke-opacity='0.045'>` +
    `<circle cx='36' cy='18' r='14'/><circle cx='18' cy='36' r='14'/>` +
    `<circle cx='54' cy='36' r='14'/><circle cx='36' cy='54' r='14'/>` +
    `</g></svg>`
)

const eightPointStar = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'>` +
    `<g fill='none' stroke='#ffffff' stroke-opacity='0.05'>` +
    `<rect x='18' y='18' width='36' height='36'/>` +
    `<rect x='18' y='18' width='36' height='36' transform='rotate(45 36 36)'/>` +
    `<circle cx='36' cy='36' r='6'/>` +
    `</g></svg>`
)

export interface ScriptureTheme {
  /** Fullscreen backdrop for every session phase. */
  backdrop: CSSProperties
  /** Tailwind classes for accented text (category label, chips). */
  accentText: string
  /** Tailwind classes for the reveal progress bar fill. */
  accentBar: string
  /** Tailwind classes for the primary (Start) button. */
  accentButton: string
}

export const SCRIPTURE_THEMES: Record<ScriptureKind, ScriptureTheme> = {
  bible: {
    backdrop: {
      backgroundColor: '#06060d',
      backgroundImage:
        `url("data:image/svg+xml,${quatrefoil}"), ` +
        `radial-gradient(120% 70% at 50% -12%, rgba(85, 70, 190, 0.30), transparent 62%), ` +
        `radial-gradient(70% 50% at 88% 112%, rgba(196, 148, 66, 0.16), transparent 65%), ` +
        `radial-gradient(55% 45% at 8% 105%, rgba(56, 78, 170, 0.14), transparent 65%)`
    },
    accentText: 'text-indigo-300',
    accentBar: 'bg-indigo-400',
    accentButton: 'bg-indigo-100 text-indigo-950 hover:bg-white'
  },
  quran: {
    backdrop: {
      backgroundColor: '#040a09',
      backgroundImage:
        `url("data:image/svg+xml,${eightPointStar}"), ` +
        `radial-gradient(120% 70% at 50% -12%, rgba(18, 128, 96, 0.30), transparent 62%), ` +
        `radial-gradient(70% 50% at 12% 112%, rgba(196, 158, 62, 0.16), transparent 65%), ` +
        `radial-gradient(55% 45% at 92% 105%, rgba(14, 96, 88, 0.16), transparent 65%)`
    },
    accentText: 'text-emerald-300',
    accentBar: 'bg-emerald-400',
    accentButton: 'bg-emerald-50 text-emerald-950 hover:bg-white'
  }
}
