import { describe, it, expect } from 'vitest'
import { checkAnswers, normalizeWord, pickBlanks, splitWords } from './blanks'

const VERSE = 'In the beginning, God created the heavens and the earth.'
const WORDS = splitWords(VERSE)

describe('comprehension check (the unlock condition)', () => {
  it('correct answers unlock', () => {
    const spec = { wordIndexes: [3, 4] } // God, created
    expect(checkAnswers(WORDS, spec, ['God', 'created'])).toBe(true)
  })

  it('wrong answers do NOT unlock', () => {
    const spec = { wordIndexes: [3, 4] }
    expect(checkAnswers(WORDS, spec, ['God', 'destroyed'])).toBe(false)
    expect(checkAnswers(WORDS, spec, ['', ''])).toBe(false)
    expect(checkAnswers(WORDS, spec, ['created', 'God'])).toBe(false) // order matters
  })

  it('is case- and punctuation-insensitive (typing "beginning" matches "beginning,")', () => {
    const spec = { wordIndexes: [2, 6] } // "beginning,", "heavens"
    expect(checkAnswers(WORDS, spec, ['BEGINNING', 'Heavens'])).toBe(true)
    expect(checkAnswers(WORDS, spec, ['beginning,', 'heavens'])).toBe(true)
  })

  it('answer count must match blank count', () => {
    const spec = { wordIndexes: [3, 4] }
    expect(checkAnswers(WORDS, spec, ['God'])).toBe(false)
    expect(checkAnswers(WORDS, spec, ['God', 'created', 'extra'])).toBe(false)
  })

  it('never unlocks on an empty/invalid spec', () => {
    expect(checkAnswers(WORDS, { wordIndexes: [] }, [])).toBe(false)
    expect(checkAnswers(WORDS, { wordIndexes: [999] }, ['whatever'])).toBe(false)
  })

  it('handles curly apostrophes and diacritics', () => {
    expect(normalizeWord('favoured;')).toBe('favoured')
    expect(normalizeWord('Thou’s')).toBe(normalizeWord("Thou's"))
    expect(normalizeWord('Élan')).toBe('elan')
  })
})

describe('pickBlanks', () => {
  const seq = (...vals: number[]): (() => number) => {
    let i = 0
    return () => vals[i++ % vals.length]!
  }

  it('picks 2–3 distinct meaty words within range', () => {
    for (let seed = 0; seed < 20; seed++) {
      const spec = pickBlanks(WORDS, seq(seed / 20, 0.3, 0.7, 0.1))
      expect(spec.wordIndexes.length).toBeGreaterThanOrEqual(2)
      expect(spec.wordIndexes.length).toBeLessThanOrEqual(3)
      expect(new Set(spec.wordIndexes).size).toBe(spec.wordIndexes.length)
      for (const i of spec.wordIndexes) {
        expect(normalizeWord(WORDS[i]!).length).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('picked blanks are always answerable (round-trips through checkAnswers)', () => {
    const spec = pickBlanks(WORDS, seq(0.9, 0.2, 0.5))
    const answers = spec.wordIndexes.map((i) => WORDS[i]!)
    expect(checkAnswers(WORDS, spec, answers)).toBe(true)
  })

  it('degenerate short verses still produce a workable check', () => {
    const short = splitWords('He wept.') // only one ≥4-letter word
    const spec = pickBlanks(short, seq(0.1, 0.6))
    expect(spec.wordIndexes.length).toBeGreaterThanOrEqual(1)
    const answers = spec.wordIndexes.map((i) => short[i]!)
    expect(checkAnswers(short, spec, answers)).toBe(true)
  })
})
