import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIES, passageId, pickRandomPassage } from './catalog'

// Validate every curated entry against the REAL bundled scripture, so a
// typo'd book name or out-of-range verse fails here instead of on someone's
// locked screen.
const root = join(__dirname, '..', '..', '..')
const bible = JSON.parse(
  readFileSync(join(root, 'resources', 'scripture', 'bible-kjv.json'), 'utf8')
) as { books: { name: string; chapters: string[][] }[] }
const quran = JSON.parse(
  readFileSync(join(root, 'resources', 'scripture', 'quran.json'), 'utf8')
) as { suras: { number: number; ayas: { ar: string; en: string }[] }[] }

describe('catalog integrity (every passage must resolve)', () => {
  for (const category of CATEGORIES) {
    it(`${category.id}: has passages for both texts`, () => {
      expect(category.bible.length).toBeGreaterThanOrEqual(5)
      expect(category.quran.length).toBeGreaterThanOrEqual(5)
    })

    it(`${category.id}: bible refs resolve in the KJV data`, () => {
      for (const p of category.bible) {
        const book = bible.books.find((bk) => bk.name === p.book)
        expect(book, `unknown book "${p.book}"`).toBeDefined()
        const chapter = book!.chapters[p.chapter - 1]
        expect(chapter, `${p.book} has no chapter ${p.chapter}`).toBeDefined()
        expect(p.from, `${p.book} ${p.chapter}: from < 1`).toBeGreaterThanOrEqual(1)
        expect(p.to, `${p.book} ${p.chapter}: from > to`).toBeGreaterThanOrEqual(p.from)
        expect(
          p.to,
          `${p.book} ${p.chapter}:${p.from}-${p.to} exceeds ${chapter!.length} verses`
        ).toBeLessThanOrEqual(chapter!.length)
        expect(p.to - p.from + 1).toBeLessThanOrEqual(20) // keep sessions readable
      }
    })

    it(`${category.id}: quran refs resolve in the Tanzil data`, () => {
      for (const p of category.quran) {
        const sura = quran.suras[p.sura - 1]
        expect(sura, `no sura ${p.sura}`).toBeDefined()
        expect(p.from).toBeGreaterThanOrEqual(1)
        expect(p.to, `sura ${p.sura}: from > to`).toBeGreaterThanOrEqual(p.from)
        expect(
          p.to,
          `sura ${p.sura}:${p.from}-${p.to} exceeds ${sura!.ayas.length} ayas`
        ).toBeLessThanOrEqual(sura!.ayas.length)
        expect(p.to - p.from + 1).toBeLessThanOrEqual(20)
      }
    })
  }

  it('passage ids are unique within each category+kind', () => {
    for (const category of CATEGORIES) {
      const bibleIds = category.bible.map((p) => passageId('bible', p))
      const quranIds = category.quran.map((p) => passageId('quran', p))
      expect(new Set(bibleIds).size).toBe(bibleIds.length)
      expect(new Set(quranIds).size).toBe(quranIds.length)
    }
  })
})

describe('pickRandomPassage', () => {
  const items = ['a', 'b', 'c']
  const id = (s: string): string => s

  it('avoids recently shown passages', () => {
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomPassage(items, id, ['a', 'b'], Math.random)
      expect(picked).toBe('c')
    }
  })

  it('falls back to the full pool when everything is recent (never null with items)', () => {
    const picked = pickRandomPassage(items, id, ['a', 'b', 'c'], () => 0.5)
    expect(picked).not.toBeNull()
  })

  it('returns null only for an empty pool', () => {
    expect(pickRandomPassage([], id, [], Math.random)).toBeNull()
  })

  it('rng edge values stay in bounds', () => {
    expect(pickRandomPassage(items, id, [], () => 0)).toBe('a')
    expect(pickRandomPassage(items, id, [], () => 0.999999)).toBe('c')
  })
})
