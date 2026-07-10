/**
 * Curated passage catalog: categories (encouragement, admonishment, …) each
 * mapping to passages in both texts. A lock session shows one passage picked
 * at random from the chosen category (avoiding recent repeats).
 *
 * All ranges are single-chapter/single-sura. Every entry is validated
 * against the bundled scripture JSON by catalog.test.ts, so a typo here
 * fails the build, not the user's lock screen.
 */

export interface BiblePassage {
  book: string // exact name as in bible-kjv.json
  chapter: number // 1-based
  from: number // 1-based verse
  to: number
}

export interface QuranPassage {
  sura: number // 1-based
  from: number // 1-based aya
  to: number
}

export interface Category {
  id: string
  label: string
  description: string
  /** A brief word (2–3 sentences) shown after reading a passage from this theme. */
  reflection: string
  bible: BiblePassage[]
  quran: QuranPassage[]
}

const b = (book: string, chapter: number, from: number, to: number): BiblePassage => ({
  book,
  chapter,
  from,
  to
})
const q = (sura: number, from: number, to: number): QuranPassage => ({ sura, from, to })

export const CATEGORIES: Category[] = [
  {
    id: 'encouragement',
    label: 'Encouragement',
    description: 'Strength and courage when you feel small',
    reflection:
      "Fear shrinks when we remember who goes with us. Take these words as spoken to you today — the God who commands courage also promises His presence, and He has not left.",
    bible: [
      b('Isaiah', 41, 8, 13),
      b('Joshua', 1, 5, 9),
      b('Psalms', 27, 1, 6),
      b('Psalms', 46, 1, 7),
      b('Psalms', 121, 1, 8),
      b('Philippians', 4, 4, 9),
      b('Romans', 8, 31, 39),
      b('Deuteronomy', 31, 6, 8),
      b('2 Timothy', 1, 6, 10)
    ],
    quran: [
      q(94, 1, 8),
      q(93, 1, 11),
      q(41, 30, 32),
      q(10, 62, 64),
      q(3, 139, 142),
      q(39, 36, 38)
    ]
  },
  {
    id: 'admonishment',
    label: 'Admonishment',
    description: 'Correction and warning for the drifting heart',
    reflection:
      "Correction is not rejection; it is the surgeon's kindness. Let what you just read name one habit plainly — and leave it here rather than carry it further.",
    bible: [
      b('Proverbs', 3, 5, 12),
      b('Matthew', 7, 1, 5),
      b('Galatians', 6, 1, 5),
      b('James', 4, 6, 10),
      b('Hebrews', 12, 5, 11),
      b('Ephesians', 4, 25, 32),
      b('Colossians', 3, 5, 10),
      b('Luke', 6, 41, 45)
    ],
    quran: [
      q(31, 12, 15),
      q(49, 11, 13),
      q(25, 63, 70),
      q(6, 151, 153),
      q(104, 1, 9),
      q(102, 1, 8),
      q(17, 23, 29)
    ]
  },
  {
    id: 'salvation',
    label: 'Salvation',
    description: 'Rescue, mercy, and being made new',
    reflection:
      "Rescue is not a wage to be earned but a gift to be received. If these words are true, your standing rests on mercy — begin again from there.",
    bible: [
      b('John', 3, 14, 21),
      b('Romans', 10, 8, 13),
      b('Ephesians', 2, 4, 10),
      b('Titus', 3, 3, 8),
      b('Acts', 4, 8, 12),
      b('Romans', 5, 1, 8),
      b('1 Peter', 1, 3, 9),
      b('Isaiah', 53, 1, 6),
      b('1 John', 5, 9, 13)
    ],
    quran: [
      q(39, 53, 56),
      q(61, 10, 13),
      q(87, 14, 19),
      q(5, 15, 16),
      q(20, 75, 76),
      q(25, 68, 71),
      q(11, 114, 115)
    ]
  },
  {
    id: 'peace',
    label: 'Peace & Comfort',
    description: 'Rest for an anxious mind',
    reflection:
      "Peace is not the absence of noise but the presence of trust. Breathe once, slowly: what worried you an hour ago is already held by the One who does not sleep.",
    bible: [
      b('Psalms', 23, 1, 6),
      b('Matthew', 11, 25, 30),
      b('John', 14, 25, 27),
      b('Psalms', 4, 1, 8),
      b('Psalms', 91, 1, 10),
      b('Isaiah', 43, 1, 7),
      b('1 Peter', 5, 6, 11),
      b('Lamentations', 3, 21, 26),
      b('Revelation', 21, 1, 5)
    ],
    quran: [
      q(13, 28, 29),
      q(89, 27, 30),
      q(33, 41, 44),
      q(36, 55, 58),
      q(15, 45, 49),
      q(97, 1, 5),
      q(106, 1, 4)
    ]
  },
  {
    id: 'wisdom',
    label: 'Wisdom',
    description: 'Learning to see and choose rightly',
    reflection:
      "Wisdom begins with the humility to be taught. Ask for it plainly today — and let one decision this afternoon be made the slow, honest way.",
    bible: [
      b('Proverbs', 2, 1, 9),
      b('Proverbs', 4, 5, 9),
      b('Proverbs', 3, 13, 18),
      b('Proverbs', 9, 8, 12),
      b('Psalms', 1, 1, 6),
      b('James', 1, 2, 8),
      b('James', 3, 13, 18),
      b('Ecclesiastes', 7, 8, 12),
      b('1 Kings', 3, 9, 12)
    ],
    quran: [
      q(96, 1, 5),
      q(55, 1, 13),
      q(45, 3, 5),
      q(30, 20, 24),
      q(31, 16, 19),
      q(67, 1, 4),
      q(23, 78, 80)
    ]
  },
  {
    id: 'gratitude',
    label: 'Gratitude & Praise',
    description: 'Remembering what has been given',
    reflection:
      "Gratitude turns what we have into enough. Name three things from this week — small ones count — and give thanks for them before you return to work.",
    bible: [
      b('Psalms', 100, 1, 5),
      b('Psalms', 103, 1, 12),
      b('Psalms', 145, 1, 9),
      b('Psalms', 136, 1, 9),
      b('Psalms', 150, 1, 6),
      b('Psalms', 95, 1, 7),
      b('1 Thessalonians', 5, 15, 22),
      b('Colossians', 3, 12, 17),
      b('Luke', 17, 11, 19)
    ],
    quran: [
      q(16, 78, 81),
      q(14, 32, 34),
      q(16, 10, 14),
      q(59, 22, 24),
      q(35, 1, 3),
      q(24, 41, 42),
      q(3, 190, 194)
    ]
  },
  {
    id: 'patience',
    label: 'Patience & Perseverance',
    description: 'Endurance through the long middle',
    reflection:
      "Endurance is grown, not granted overnight. The waiting you resent may be the very ground where something lasting is taking root.",
    bible: [
      b('James', 5, 7, 11),
      b('Hebrews', 12, 1, 3),
      b('Galatians', 6, 7, 10),
      b('Psalms', 40, 1, 5),
      b('Isaiah', 40, 28, 31),
      b('2 Corinthians', 4, 16, 18),
      b('Philippians', 3, 12, 14)
    ],
    quran: [
      q(2, 153, 157),
      q(103, 1, 3),
      q(2, 45, 46),
      q(8, 45, 46),
      q(76, 23, 26),
      q(68, 48, 50),
      q(70, 19, 23)
    ]
  },
  {
    id: 'forgiveness',
    label: 'Forgiveness',
    description: 'Being forgiven, and forgiving',
    reflection:
      "The forgiven forgive. Whatever debt you are still holding, you have just read what was done with yours — release it, and walk lighter.",
    bible: [
      b('Psalms', 51, 1, 10),
      b('Psalms', 32, 1, 5),
      b('1 John', 1, 5, 9),
      b('Matthew', 6, 9, 15),
      b('Matthew', 18, 21, 27),
      b('Luke', 15, 17, 24),
      b('Isaiah', 1, 16, 18),
      b('Micah', 7, 18, 20)
    ],
    quran: [
      q(3, 133, 136),
      q(4, 106, 110),
      q(24, 21, 22),
      q(42, 36, 40),
      q(7, 199, 201),
      q(71, 10, 12),
      q(110, 1, 3)
    ]
  },
  {
    id: 'faith',
    label: 'Faith & Trust',
    description: 'Leaning on what you cannot yet see',
    reflection:
      "Faith is not certainty about outcomes; it is confidence in a Person. Trust is built the way you just practiced it — one passage, one step, one day at a time.",
    bible: [
      b('Hebrews', 11, 1, 6),
      b('Psalms', 37, 3, 7),
      b('Mark', 11, 22, 25),
      b('Matthew', 21, 18, 22),
      b('Romans', 4, 18, 25),
      b('2 Corinthians', 5, 1, 7),
      b('Psalms', 62, 5, 8),
      b('James', 2, 14, 18)
    ],
    quran: [
      q(2, 285, 286),
      q(49, 14, 15),
      q(3, 173, 175),
      q(8, 2, 4),
      q(64, 11, 13),
      q(33, 21, 23)
    ]
  },
  {
    id: 'hope',
    label: 'Hope',
    description: 'A future worth waiting for',
    reflection:
      "Hope is memory turned forward. The same faithfulness that carried you to today is already waiting in tomorrow.",
    bible: [
      b('Jeremiah', 29, 11, 14),
      b('Romans', 15, 8, 13),
      b('Psalms', 42, 5, 11),
      b('Isaiah', 61, 1, 4),
      b('Titus', 2, 11, 14),
      b('Revelation', 22, 1, 5),
      b('Psalms', 130, 1, 8),
      b('Romans', 8, 18, 25)
    ],
    quran: [
      q(29, 5, 7),
      q(30, 48, 50),
      q(40, 60, 62),
      q(48, 1, 4),
      q(2, 218, 218)
    ]
  },
  {
    id: 'love',
    label: 'Love & Compassion',
    description: 'Loving God, loving people',
    reflection:
      "Love here is not first a feeling but a practice. Choose one person to make it concrete for before this day ends.",
    bible: [
      b('1 Corinthians', 13, 1, 8),
      b('1 John', 4, 7, 12),
      b('John', 15, 9, 13),
      b('Romans', 12, 9, 13),
      b('Luke', 10, 30, 37),
      b('Matthew', 22, 34, 40),
      b('1 Peter', 4, 8, 11)
    ],
    quran: [
      q(3, 31, 32),
      q(60, 7, 8),
      q(90, 12, 18),
      q(76, 8, 11),
      q(2, 177, 177),
      q(8, 62, 63)
    ]
  },
  {
    id: 'humility',
    label: 'Humility',
    description: 'The low door into every virtue',
    reflection:
      "The low door is the only one that leads upward. Lay down the need to be seen today, and notice how much lighter the work becomes.",
    bible: [
      b('Philippians', 2, 1, 11),
      b('Micah', 6, 6, 8),
      b('Luke', 14, 7, 11),
      b('Luke', 18, 9, 14),
      b('Proverbs', 15, 31, 33),
      b('Matthew', 23, 8, 12),
      b('Psalms', 131, 1, 3)
    ],
    quran: [
      q(23, 1, 5),
      q(7, 55, 56),
      q(17, 37, 39),
      q(22, 34, 35),
      q(28, 83, 84),
      q(4, 36, 37)
    ]
  },
  {
    id: 'fear',
    label: 'Fear & Anxiety',
    description: 'When worry is louder than truth',
    reflection:
      "Anxiety tells long stories about short facts. Set the story down — you were just reminded who holds the facts.",
    bible: [
      b('Matthew', 6, 25, 34),
      b('Psalms', 34, 1, 8),
      b('Psalms', 56, 1, 4),
      b('Isaiah', 35, 3, 6),
      b('1 John', 4, 16, 19),
      b('Psalms', 94, 16, 19),
      b('Luke', 12, 22, 32)
    ],
    quran: [
      q(9, 51, 52),
      q(20, 67, 69),
      q(27, 62, 64),
      q(67, 12, 14),
      q(16, 96, 97)
    ]
  },
  {
    id: 'guidance',
    label: 'Guidance',
    description: 'Finding the next right step',
    reflection:
      "Guidance rarely arrives as a whole map; it comes as enough light for the next step. Take that step — the path appears under moving feet.",
    bible: [
      b('Psalms', 25, 4, 10),
      b('Psalms', 119, 105, 112),
      b('Proverbs', 16, 1, 9),
      b('Isaiah', 30, 19, 21),
      b('John', 16, 12, 15),
      b('Psalms', 32, 8, 11),
      b('Isaiah', 58, 9, 11)
    ],
    quran: [
      q(1, 1, 7),
      q(2, 2, 5),
      q(6, 161, 163),
      q(42, 52, 53),
      q(20, 1, 8),
      q(18, 10, 13)
    ]
  },
  {
    id: 'provision',
    label: 'Provision & Contentment',
    description: 'Enough, and the giver of enough',
    reflection:
      "What you have was given, and the Giver is not done. Work faithfully, hold loosely, and let enough be enough today.",
    bible: [
      b('Philippians', 4, 10, 13),
      b('1 Timothy', 6, 6, 10),
      b('Psalms', 37, 23, 26),
      b('2 Corinthians', 9, 6, 11),
      b('Matthew', 7, 7, 11),
      b('Deuteronomy', 8, 6, 10),
      b('Hebrews', 13, 5, 6)
    ],
    quran: [
      q(65, 2, 3),
      q(29, 60, 62),
      q(62, 9, 11),
      q(17, 30, 31),
      q(2, 261, 262),
      q(34, 39, 39)
    ]
  },
  {
    id: 'healing',
    label: 'Healing & Restoration',
    description: 'Mending for body and heart',
    reflection:
      "Some mending is quick and some is slow, but none of it is forgotten. Bring the sore places honestly — hiding them heals nothing.",
    bible: [
      b('Psalms', 147, 1, 6),
      b('Jeremiah', 17, 13, 14),
      b('James', 5, 13, 16),
      b('Psalms', 30, 1, 5),
      b('Matthew', 9, 18, 26),
      b('2 Kings', 20, 1, 7),
      b('Joel', 2, 25, 27)
    ],
    quran: [
      q(17, 82, 82),
      q(26, 78, 82),
      q(10, 57, 58),
      q(16, 68, 69),
      q(21, 83, 84)
    ]
  },
  {
    id: 'temptation',
    label: 'Temptation & Self-Control',
    description: 'Holding the line under pressure',
    reflection:
      "The battle is usually decided in the first minute, not the last. Decide now, while it is quiet, what you will do when it gets loud.",
    bible: [
      b('1 Corinthians', 10, 12, 14),
      b('James', 1, 12, 16),
      b('Matthew', 26, 36, 41),
      b('Galatians', 5, 16, 24),
      b('Proverbs', 25, 26, 28),
      b('Romans', 6, 11, 14),
      b('Matthew', 4, 1, 11),
      b('2 Timothy', 2, 22, 26)
    ],
    quran: [
      q(12, 23, 24),
      q(79, 37, 41),
      q(3, 14, 17),
      q(41, 34, 36),
      q(91, 7, 10),
      q(113, 1, 5)
    ]
  },
  {
    id: 'grief',
    label: 'Grief & Sorrow',
    description: 'Company for the valley',
    reflection:
      "Sorrow is love with nowhere to go — and it is seen. You do not grieve alone, and you are not asked to hurry.",
    bible: [
      b('Psalms', 34, 17, 19),
      b('Matthew', 5, 1, 10),
      b('John', 11, 32, 36),
      b('1 Thessalonians', 4, 13, 18),
      b('Psalms', 6, 6, 9),
      b('Ecclesiastes', 3, 1, 8),
      b('2 Corinthians', 1, 3, 7),
      b('Psalms', 116, 1, 9)
    ],
    quran: [
      q(12, 83, 87),
      q(9, 40, 40),
      q(3, 169, 171),
      q(28, 7, 13),
      q(53, 43, 48)
    ]
  },
  {
    id: 'prayer',
    label: 'Prayer & Devotion',
    description: 'Learning to talk with God',
    reflection:
      "Prayer is not a performance; it is a child's honest voice. Say the true thing simply — that is enough, and it is heard.",
    bible: [
      b('Matthew', 6, 5, 8),
      b('Luke', 11, 5, 13),
      b('Psalms', 5, 1, 8),
      b('Daniel', 6, 6, 10),
      b('Psalms', 141, 1, 4),
      b('Colossians', 4, 2, 6),
      b('Psalms', 63, 1, 8)
    ],
    quran: [
      q(2, 186, 186),
      q(17, 78, 81),
      q(73, 1, 8),
      q(29, 45, 45),
      q(25, 74, 77),
      q(108, 1, 3)
    ]
  },
  {
    id: 'purpose',
    label: 'Purpose & Work',
    description: 'Why you are here, done well',
    reflection:
      "You were made on purpose, for purpose. Do the next piece of work as if it were an offering — because it is.",
    bible: [
      b('Ecclesiastes', 9, 7, 10),
      b('Colossians', 3, 22, 24),
      b('Ephesians', 4, 1, 7),
      b('Proverbs', 6, 6, 11),
      b('Jeremiah', 1, 4, 8),
      b('Matthew', 5, 13, 16),
      b('Psalms', 139, 13, 16),
      b('1 Corinthians', 15, 57, 58)
    ],
    quran: [
      q(51, 56, 58),
      q(23, 115, 118),
      q(90, 4, 11),
      q(53, 39, 42),
      q(9, 105, 105)
    ]
  }
]

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id)
}

/** Stable id for a passage, used for recent-repeat avoidance. */
export function passageId(kind: 'bible' | 'quran', p: BiblePassage | QuranPassage): string {
  return kind === 'bible'
    ? `b:${(p as BiblePassage).book}:${(p as BiblePassage).chapter}:${p.from}-${p.to}`
    : `q:${(p as QuranPassage).sura}:${p.from}-${p.to}`
}

/**
 * Random pick avoiding recently shown ids. If everything has been shown
 * recently, ignore the exclusion rather than fail — some passage must
 * always be available (the unlock depends on it).
 */
export function pickRandomPassage<T>(
  passages: readonly T[],
  idOf: (p: T) => string,
  recentIds: readonly string[],
  rng: () => number = Math.random
): T | null {
  if (passages.length === 0) return null
  const fresh = passages.filter((p) => !recentIds.includes(idOf(p)))
  const pool = fresh.length > 0 ? fresh : passages
  const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1)
  return pool[index]!
}
