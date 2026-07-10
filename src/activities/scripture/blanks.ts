/**
 * Pure comprehension-check logic (no DOM, no Electron): pick words to blank
 * out of a verse and judge the user's answers. Safety-critical: this is the
 * unlock condition, so it is unit-tested directly.
 */

export interface BlankSpec {
  /** Indices into the verse's word array (as split by splitWords). */
  wordIndexes: number[]
}

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
}

/** Case-, punctuation- and diacritic-insensitive canonical form. */
export function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[‘’]/g, "'") // curly quotes -> straight (BEFORE stripping)
    .toLowerCase()
    .replace(/[^a-z0-9']/g, '') // keep letters/digits/apostrophes
}

/**
 * Choose 2–3 word positions to blank. Prefers "meaty" words (≥4 letters
 * after normalization, all distinct) so the check isn't "the"/"and".
 * Deterministic given the rng; pass Math.random in production.
 */
export function pickBlanks(words: string[], rng: () => number = Math.random): BlankSpec {
  const candidates: number[] = []
  const seen = new Set<string>()
  words.forEach((word, i) => {
    const norm = normalizeWord(word)
    if (norm.length >= 4 && !seen.has(norm)) {
      seen.add(norm)
      candidates.push(i)
    }
  })
  // Degenerate verses (very short / repetitive): fall back to any non-empty
  // words so the check still works rather than blocking the unlock.
  const pool =
    candidates.length >= 2
      ? candidates
      : words.map((w, i) => (normalizeWord(w).length > 0 ? i : -1)).filter((i) => i >= 0)

  const count = Math.min(pool.length >= 3 ? (rng() < 0.5 ? 3 : 2) : 2, pool.length)
  const picked: number[] = []
  const available = [...pool]
  for (let k = 0; k < count && available.length > 0; k++) {
    const idx = Math.min(Math.floor(rng() * available.length), available.length - 1)
    picked.push(available[idx]!)
    available.splice(idx, 1)
  }
  return { wordIndexes: picked.sort((a, b) => a - b) }
}

/** True iff every answer matches its blanked word (normalized). */
export function checkAnswers(
  words: string[],
  spec: BlankSpec,
  answers: readonly string[]
): boolean {
  if (spec.wordIndexes.length === 0) return false
  if (answers.length !== spec.wordIndexes.length) return false
  return spec.wordIndexes.every((wordIndex, i) => {
    const expected = words[wordIndex]
    const given = answers[i]
    if (expected === undefined || given === undefined) return false
    const normExpected = normalizeWord(expected)
    if (normExpected.length === 0) return false
    return normalizeWord(given) === normExpected
  })
}
