/**
 * BUILD-TIME ONLY: downloads public-domain scripture sources and converts
 * them into the clean JSON the app bundles (resources/scripture/*.json).
 * The app itself makes no network calls, ever — run this once and commit
 * the output. Sources and licenses are recorded in NOTICES.md.
 *
 *   node scripts/fetch-scripture.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'scripture')
mkdirSync(outDir, { recursive: true })

async function fetchText(url) {
  console.log(`fetching ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

// --- Bible: King James Version (public domain) ---------------------------

async function buildBible() {
  // getbible.net v2 exports the whole KJV as one JSON file:
  // { books: [{ nr, name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
  const raw = JSON.parse(await fetchText('https://api.getbible.net/v2/kjv.json'))
  console.log(`  source license field: ${raw.distribution_license}`)
  const books = raw.books.map((book) => ({
    name: book.name,
    chapters: book.chapters.map((ch) =>
      ch.verses.map((v) => String(v.text).replace(/\s+/g, ' ').trim())
    )
  }))

  const totalVerses = books.flatMap((b) => b.chapters).reduce((n, ch) => n + ch.length, 0)
  if (books.length !== 66) throw new Error(`expected 66 books, got ${books.length}`)
  if (totalVerses < 30000) throw new Error(`suspiciously few verses: ${totalVerses}`)

  const out = {
    translation: 'King James Version (KJV)',
    license: 'Public domain',
    books
  }
  writeFileSync(join(outDir, 'bible-kjv.json'), JSON.stringify(out))
  console.log(`bible-kjv.json: ${books.length} books, ${totalVerses} verses`)
}

// --- Quran: Tanzil Arabic + Pickthall English (public domain) ------------

/** Tanzil txt format: `sura|aya|text` lines (plus comment lines at the end). */
function parseTanzilTxt(txt) {
  const rows = []
  for (const line of txt.split('\n')) {
    const m = line.match(/^(\d+)\|(\d+)\|(.+)$/)
    if (m) rows.push({ sura: Number(m[1]), aya: Number(m[2]), text: m[3].trim() })
  }
  return rows
}

const SURA_NAMES = [
  'Al-Faatiha', 'Al-Baqara', 'Aal-i-Imraan', 'An-Nisaa', 'Al-Maaida', "Al-An'aam", "Al-A'raaf",
  'Al-Anfaal', 'At-Tawba', 'Yunus', 'Hud', 'Yusuf', "Ar-Ra'd", 'Ibrahim', 'Al-Hijr', 'An-Nahl',
  'Al-Israa', 'Al-Kahf', 'Maryam', 'Taa-Haa', 'Al-Anbiyaa', 'Al-Hajj', 'Al-Muminoon', 'An-Noor',
  'Al-Furqaan', "Ash-Shu'araa", 'An-Naml', 'Al-Qasas', 'Al-Ankaboot', 'Ar-Room', 'Luqman',
  'As-Sajda', 'Al-Ahzaab', 'Saba', 'Faatir', 'Yaseen', 'As-Saaffaat', 'Saad', 'Az-Zumar',
  'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhaan', 'Al-Jaathiya', 'Al-Ahqaf',
  'Muhammad', 'Al-Fath', 'Al-Hujuraat', 'Qaaf', 'Adh-Dhaariyat', 'At-Tur', 'An-Najm', 'Al-Qamar',
  'Ar-Rahmaan', 'Al-Waaqia', 'Al-Hadid', 'Al-Mujaadila', 'Al-Hashr', 'Al-Mumtahana', 'As-Saff',
  'Al-Jumua', 'Al-Munaafiqoon', 'At-Taghaabun', 'At-Talaaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam',
  'Al-Haaqqa', 'Al-Maaarij', 'Nooh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyaama',
  'Al-Insaan', 'Al-Mursalaat', 'An-Naba', "An-Naazi'aat", 'Abasa', 'At-Takwir', 'Al-Infitaar',
  'Al-Mutaffifin', 'Al-Inshiqaaq', 'Al-Burooj', 'At-Taariq', "Al-A'laa", 'Al-Ghaashiya',
  'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Lail', 'Ad-Dhuhaa', 'Ash-Sharh', 'At-Tin', 'Al-Alaq',
  'Al-Qadr', 'Al-Bayyina', 'Az-Zalzala', 'Al-Aadiyaat', 'Al-Qaaria', 'At-Takaathur', 'Al-Asr',
  'Al-Humaza', 'Al-Fil', 'Quraish', 'Al-Maaoon', 'Al-Kawthar', 'Al-Kaafiroon', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlaas', 'Al-Falaq', 'An-Naas'
]

async function buildQuran() {
  // Arabic: Tanzil "simple" text. Try tanzil.net first, then a GitHub mirror.
  let arabicTxt
  const arabicSources = [
    'https://tanzil.net/pub/download/index.php?quranType=simple&outType=txt-2&agree=true',
    'https://raw.githubusercontent.com/mustafa0x/quran-json/master/quran-simple.txt'
  ]
  for (const url of arabicSources) {
    try {
      arabicTxt = await fetchText(url)
      if (parseTanzilTxt(arabicTxt).length > 6000) break
      arabicTxt = undefined
    } catch (err) {
      console.log(`  (source failed: ${err.message})`)
    }
  }
  if (!arabicTxt) throw new Error('could not fetch Arabic Quran text')

  // English: Pickthall (1930; public domain in the US since 2026, and
  // life+70 worldwide — d. 1936). Tanzil serves it as plain text, one aya
  // per line in canonical order, with a `#` comment footer.
  const englishTxt = await fetchText('https://tanzil.net/trans/?transID=en.pickthall&type=txt')

  const arabic = parseTanzilTxt(arabicTxt)
  const englishLines = englishTxt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
  if (arabic.length !== 6236) throw new Error(`expected 6236 ayas (ar), got ${arabic.length}`)
  if (englishLines.length !== 6236) {
    throw new Error(`expected 6236 ayas (en), got ${englishLines.length}`)
  }
  // Zip plain lines to (sura, aya) via the Arabic rows' canonical order.
  const english = englishLines.map((text, i) => ({
    sura: arabic[i].sura,
    aya: arabic[i].aya,
    text
  }))

  const suras = []
  for (const row of arabic) {
    if (!suras[row.sura - 1]) {
      suras[row.sura - 1] = { number: row.sura, name: SURA_NAMES[row.sura - 1], ayas: [] }
    }
    suras[row.sura - 1].ayas.push({ ar: row.text, en: '' })
  }
  for (const row of english) {
    const aya = suras[row.sura - 1]?.ayas[row.aya - 1]
    if (!aya) throw new Error(`en verse without ar counterpart: ${row.sura}:${row.aya}`)
    aya.en = row.text
  }
  if (suras.length !== 114) throw new Error(`expected 114 suras, got ${suras.length}`)

  const out = {
    arabicSource: 'Tanzil (tanzil.net) — Quran text, simple script',
    arabicNotice:
      'Quran text courtesy of Tanzil.net. This copy of the Quran text is carefully produced, highly verified and continuously monitored by a group of specialists at Tanzil Project.',
    translation: 'The Meaning of the Glorious Koran — Marmaduke Pickthall (1930)',
    translationLicense: 'Public domain',
    suras
  }
  writeFileSync(join(outDir, 'quran.json'), JSON.stringify(out))
  console.log(`quran.json: ${suras.length} suras, ${arabic.length} ayas`)
}

await buildBible()
await buildQuran()
console.log('done')
