import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Clean race name - remove sponsor info like "presented by..." or "sponsored by..."
export function cleanRaceName(name: string | null): string | null {
  if (!name) return null
  // Remove "presented by...", "sponsored by...", etc.
  return name
    .replace(/\s+presented\s+by\s+.*/i, '')
    .replace(/\s+sponsored\s+by\s+.*/i, '')
    .replace(/\s+-\s+.*/i, '') // Remove anything after " - "
    .trim()
}

export function formatMoney(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`
  }
  return `$${amount.toLocaleString()}`
}

export function formatOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function formatSexShort(sex: string | null): string {
  return sex?.toLowerCase() || ''
}

export function formatHorseDescription(sex: string | null, yob: number | null): string {
  const currentYear = new Date().getFullYear()
  const age = yob ? currentYear - yob : null

  const parts: string[] = []
  if (sex) parts.push(formatSexShort(sex))
  if (age) parts.push(String(age))

  return parts.join(', ')
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatShortDate(dateStr: string, fullYear = false): string {
  const [y, m, day] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(day)}/${fullYear ? y : y.slice(2)}`
}

export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

export function isTomorrow(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return date.toDateString() === tomorrow.toDateString()
}

// Convert distance: "Seven Furlongs" → "7f", "One Mile" → "1 mile", "One And One Eighth Miles" → "1 1/8 miles"
export function formatDistance(distance: string | null): string {
  if (!distance) return ''

  // Clean any parsing garbage (from workout emails) and strip concatenated surface text
  let cleaned = distance.split(/Time:|Track Condition:/i)[0]?.trim() || distance.trim()
  // Strip surface info concatenated to distance: "FurlongsOnTheAllWeather" → "Furlongs"
  cleaned = cleaned.replace(/\s*On\s+(?:The\s+)?(?:Outer|Inner)?\s*(?:Turf|Dirt|Main\s*Track|All\s*Weather(?:\s*Track)?|Polytrack|Tapeta|Synthetic).*$/i, '').trim()
  // Split concatenated number+unit: "SeventyYards" → "Seventy Yards"
  cleaned = cleaned.replace(/([a-z])(Furlongs?|Miles?|Yards?)\s*$/i, '$1 $2').trim()

  const wordToNum: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
  }

  const fractionToDecimal: Record<string, number> = {
    'half': 0.5,
    'one half': 0.5,
    'onehalf': 0.5,
    'quarter': 0.25,
    'one quarter': 0.25,
    'onequarter': 0.25,
    'fourth': 0.25,
    'one fourth': 0.25,
    'onefourth': 0.25,
    'three fourth': 0.75,
    'three fourths': 0.75,
    'threefourth': 0.75,
    'threefourths': 0.75,
    'eighth': 0.125,
    'one eighth': 0.125,
    'oneeighth': 0.125,
    'sixteenth': 0.0625,
    'one sixteenth': 0.0625,
    'onesixteenth': 0.0625,
    'three quarters': 0.75,
    'threequarters': 0.75,
    'three sixteenth': 0.1875,
    'three sixteenths': 0.1875,
    'three eighths': 0.375,
    'threeeighths': 0.375,
    'five eighths': 0.625,
    'fiveeighths': 0.625,
    'seven eighths': 0.875,
    'seveneighths': 0.875,
  }

  const fractionToDisplay: Record<string, string> = {
    'half': '1/2',
    'one half': '1/2',
    'onehalf': '1/2',
    'quarter': '1/4',
    'one quarter': '1/4',
    'onequarter': '1/4',
    'fourth': '1/4',
    'one fourth': '1/4',
    'onefourth': '1/4',
    'three fourth': '3/4',
    'three fourths': '3/4',
    'threefourth': '3/4',
    'threefourths': '3/4',
    'eighth': '1/8',
    'one eighth': '1/8',
    'oneeighth': '1/8',
    'sixteenth': '1/16',
    'one sixteenth': '1/16',
    'onesixteenth': '1/16',
    'three quarters': '3/4',
    'threequarters': '3/4',
    'three sixteenth': '3/16',
    'three sixteenths': '3/16',
    'three eighths': '3/8',
    'threeeighths': '3/8',
    'five eighths': '5/8',
    'fiveeighths': '5/8',
    'seven eighths': '7/8',
    'seveneighths': '7/8',
  }

  // Handle "About" prefix
  const hasAbout = /^about\s+/i.test(cleaned)
  const withoutAbout = cleaned.replace(/^about\s+/i, '')
  const prefix = hasAbout ? '~' : ''

  // Match miles/furlongs + yards: "One Mile And Seventy Yards" → "1 mile 70yds"
  const yardsMatch = withoutAbout.match(/^(\w+)\s+(Miles?|Furlongs?)\s+And\s+(\w+)\s+Yards?$/i)
  if (yardsMatch) {
    const whole = wordToNum[yardsMatch[1].toLowerCase()] || parseInt(yardsMatch[1]) || yardsMatch[1]
    const unit = /mile/i.test(yardsMatch[2]) ? (whole === 1 ? 'mile' : 'miles') : `f`
    const yards = wordToNum[yardsMatch[3].toLowerCase()] || parseInt(yardsMatch[3]) || yardsMatch[3]
    const unitStr = unit === 'f' ? `${whole}f` : `${whole} ${unit}`
    return `${prefix}${unitStr} ${yards}yds`
  }

  // Match furlongs with fraction: "Six And One Half Furlongs" → "6.5f"
  const furlongFractionMatch = withoutAbout.match(/^(\w+)\s+And\s+(\w+(?:\s+\w+)?)\s+Furlongs?$/i)
  if (furlongFractionMatch) {
    const whole = wordToNum[furlongFractionMatch[1].toLowerCase()] || parseInt(furlongFractionMatch[1]) || 0
    const fractionWord = furlongFractionMatch[2].toLowerCase()
    const fractionVal = fractionToDecimal[fractionWord] || 0
    const total = whole + fractionVal
    const formatted = total % 1 === 0 ? total.toFixed(0) : parseFloat(total.toPrecision(4)).toString()
    return `${prefix}${formatted}f`
  }

  // Match simple furlongs: "Seven Furlongs" or "7 Furlongs"
  const furlongMatch = withoutAbout.match(/^(\w+)\s+Furlongs?$/i)
  if (furlongMatch) {
    const word = furlongMatch[1].toLowerCase()
    const num = wordToNum[word] || parseInt(word) || word
    return `${prefix}${num}f`
  }

  // Match miles with fractions: "One And One Eighth Miles" → "1 1/8 miles"
  const milesFractionMatch = withoutAbout.match(/^(\w+)\s+And\s+(\w+(?:\s+\w+)?)\s+Miles?$/i)
  if (milesFractionMatch) {
    const whole = wordToNum[milesFractionMatch[1].toLowerCase()] || parseInt(milesFractionMatch[1]) || milesFractionMatch[1]
    const fractionWord = milesFractionMatch[2].toLowerCase()
    const fraction = fractionToDisplay[fractionWord] || fractionWord
    return `${prefix}${whole} ${fraction} miles`
  }

  // Match simple miles: "One Mile" → "1 mile"
  const simpleMileMatch = withoutAbout.match(/^(\w+)\s+Miles?$/i)
  if (simpleMileMatch) {
    const word = simpleMileMatch[1].toLowerCase()
    const num = wordToNum[word] || parseInt(word) || word
    const mileWord = num === 1 ? 'mile' : 'miles'
    return `${prefix}${num} ${mileWord}`
  }

  // Already formatted or numeric
  if (/^\d+\.?\d*f$/i.test(cleaned)) {
    return cleaned.toLowerCase()
  }
  if (/^\d+\s+\d+\/\d+\s+miles?$/i.test(cleaned)) {
    return cleaned.toLowerCase()
  }

  return cleaned
}

// Parse a distance string into furlongs (1 mile = 8f). Returns null if
// the format isn't recognized. Used to detect NA jumps races, which by
// convention are anything longer than 1m6f (14 furlongs).
export function parseDistanceToFurlongs(distance: string | null): number | null {
  if (!distance) return null
  const raw = distance.trim()
  if (!raw) return null

  const wordToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16,
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  }
  const fractionMap: Record<string, number> = {
    'half': 0.5, 'one half': 0.5, 'onehalf': 0.5,
    'quarter': 0.25, 'one quarter': 0.25, 'onequarter': 0.25,
    'fourth': 0.25, 'one fourth': 0.25, 'onefourth': 0.25,
    'three fourth': 0.75, 'three fourths': 0.75,
    'eighth': 0.125, 'one eighth': 0.125, 'oneeighth': 0.125,
    'sixteenth': 0.0625, 'one sixteenth': 0.0625, 'onesixteenth': 0.0625,
    'three quarters': 0.75, 'threequarters': 0.75,
    'three eighths': 0.375, 'threeeighths': 0.375,
    'five eighths': 0.625, 'fiveeighths': 0.625,
    'seven eighths': 0.875, 'seveneighths': 0.875,
    'three sixteenths': 0.1875, 'five sixteenths': 0.3125,
    'seven sixteenths': 0.4375, 'nine sixteenths': 0.5625,
    'eleven sixteenths': 0.6875, 'thirteen sixteenths': 0.8125,
    'fifteen sixteenths': 0.9375,
    'three sixteenth': 0.1875, 'five sixteenth': 0.3125,
  }
  const parseWord = (w: string): number | null => {
    const k = w.toLowerCase()
    if (k in wordToNum) return wordToNum[k]
    const n = parseFloat(w)
    return isNaN(n) ? null : n
  }
  const parseFractionDisplay = (s: string): number => {
    const m = s.match(/^(\d+)\/(\d+)$/)
    return m ? parseInt(m[1]) / parseInt(m[2]) : 0
  }

  // Strip jumps-race suffix so the underlying distance still parses.
  // Equibase chart text emits e.g. "Two And One Eighth Miles On The Hurdle"
  // — without this the whole string fails to match any pattern below and
  // the row would be wrongly classified as non-jumps.
  const cleaned = raw
    .replace(/^about\s+/i, '')
    .replace(/\s*(?:On\s+The\s+)?(?:Hurdle|Steeplechase|Jump)s?\s*$/i, '')
    .trim()

  // "7F", "6.5F", "7f"
  let m = cleaned.match(/^([\d.]+)\s*F$/i)
  if (m) return parseFloat(m[1])

  // "1 1/8 miles", "2 1/8 miles"
  m = cleaned.match(/^(\d+)\s+(\d+\/\d+)\s+miles?$/i)
  if (m) return (parseFloat(m[1]) + parseFractionDisplay(m[2])) * 8

  // "1 mile", "2 miles"
  m = cleaned.match(/^(\d+(?:\.\d+)?)\s+miles?$/i)
  if (m) return parseFloat(m[1]) * 8

  // "1 mile 70 yds"
  m = cleaned.match(/^(\d+)\s+miles?\s+(\d+)\s*yds?$/i)
  if (m) return parseFloat(m[1]) * 8 + parseFloat(m[2]) / 220

  // "Six Furlongs", "7 Furlongs"
  m = cleaned.match(/^(\w+)\s+Furlongs?$/i)
  if (m) {
    const n = parseWord(m[1])
    if (n !== null) return n
  }

  // "Six And One Half Furlongs"
  m = cleaned.match(/^(\w+)\s+And\s+(\w+(?:\s+\w+)?)\s+Furlongs?$/i)
  if (m) {
    const whole = parseWord(m[1])
    const frac = fractionMap[m[2].toLowerCase()] ?? 0
    if (whole !== null) return whole + frac
  }

  // "One Mile" / "Two Miles"
  m = cleaned.match(/^(\w+)\s+Miles?$/i)
  if (m) {
    const n = parseWord(m[1])
    if (n !== null) return n * 8
  }

  // "One And One Eighth Miles"
  m = cleaned.match(/^(\w+)\s+And\s+(\w+(?:\s+\w+)?)\s+Miles?$/i)
  if (m) {
    const whole = parseWord(m[1])
    const frac = fractionMap[m[2].toLowerCase()] ?? 0
    if (whole !== null) return (whole + frac) * 8
  }

  // "One Mile And Seventy Yards"
  m = cleaned.match(/^(\w+)\s+(Miles?|Furlongs?)\s+And\s+(\w+)\s+Yards?$/i)
  if (m) {
    const whole = parseWord(m[1])
    const yards = parseWord(m[3])
    if (whole !== null && yards !== null) {
      return (/mile/i.test(m[2]) ? whole * 8 : whole) + yards / 220
    }
  }

  return null
}

// NA flat racing tops out at 1m6f. Anything longer in NA is a jumps race.
// We don't apply this to international stallions — Ascot Gold Cup etc. are
// legitimate flat races over 14f.
export const NA_FLAT_MAX_FURLONGS = 14

export function isNaJumpsRace(
  distance: string | null,
  tdnRegion: string | null | undefined
): boolean {
  if (tdnRegion && tdnRegion !== 'na') return false
  const f = parseDistanceToFurlongs(distance)
  return f !== null && f > NA_FLAT_MAX_FURLONGS
}

// Display aliases for tracks whose official name is a mouthful.
const TRACK_DISPLAY_ALIASES: Record<string, string> = {
  'hollywood casino at charles town races': 'Charles Town',
}

// Build an Equibase static-entry URL that deep-links to a specific race.
// Equibase only covers US and Canadian racing — for European tracks the
// caller should fall through and render the track text plain. Returns null
// when we don't have enough info to build a working link.
//
// URL format: http://www.equibase.com/static/entry/{TC}{MMDDYY}{CTRY}-EQB.html#RACE{N}
export function buildEquibaseRaceUrl(
  trackCode: string | null | undefined,
  raceDate: string | null | undefined,
  raceCountry: string | null | undefined,
  raceNumber: number | null | undefined,
): string | null {
  if (!trackCode || !raceDate || !raceNumber) return null
  // Only US/Canada are on Equibase. The Equibase parser leaves race_country
  // null for US rows and sets it explicitly for foreign rows.
  const ctry = raceCountry == null
    ? 'USA'
    : raceCountry === 'Canada' ? 'CAN'
    : raceCountry === 'USA' || raceCountry === 'CAN' ? raceCountry
    : null
  if (!ctry) return null
  const m = raceDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const yy = m[1].slice(2)
  const mmddyy = `${m[2]}${m[3]}${yy}`
  return `http://www.equibase.com/static/entry/${trackCode}${mmddyy}${ctry}-EQB.html#RACE${raceNumber}`
}

export function formatTrack(track: string): string {
  const key = track.toLowerCase().trim()
  if (TRACK_DISPLAY_ALIASES[key]) return TRACK_DISPLAY_ALIASES[key]
  return track
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Normalize for silks owner-name matching: lowercase, drop punctuation,
// collapse whitespace. Lets "L.N.J. Foxwoods, LLC" match a pattern like "LNJ".
function normalizeOwnerName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SilksOrg {
  name?: string
  silks_url?: string | null
  owner_match_patterns?: string[] | null
}

// Effective patterns for an org: explicit patterns if set, else fall back to the org name.
function patternsFor(org: SilksOrg): string[] {
  const explicit = (org.owner_match_patterns ?? []).filter(p => p && p.trim())
  if (explicit.length > 0) return explicit
  return org.name ? [org.name] : []
}

function ownerMatches(ownerNorm: string, patterns: string[]): boolean {
  return patterns.some(p => {
    const norm = normalizeOwnerName(p)
    return norm.length > 0 && ownerNorm.includes(norm)
  })
}

export function shouldShowSilks(
  organization: SilksOrg | undefined,
  owner: string | null | undefined,
  allOrgsWithSilks?: SilksOrg[],
  isAdmin?: boolean
): { show: boolean; silksUrls: string[] } {
  if (!owner) return { show: false, silksUrls: [] }
  const ownerNorm = normalizeOwnerName(owner)

  // For admins: show ALL matching org silks (multiple owners)
  if (isAdmin && allOrgsWithSilks && allOrgsWithSilks.length > 0) {
    const matchingSilks: string[] = []
    for (const org of allOrgsWithSilks) {
      if (!org.silks_url) continue
      if (ownerMatches(ownerNorm, patternsFor(org))) {
        matchingSilks.push(org.silks_url)
      }
    }
    if (matchingSilks.length > 0) {
      return { show: true, silksUrls: matchingSilks }
    }
  }

  // For regular users: only show their own org's silks if they're one of the owners
  const silksUrl = organization?.silks_url
  if (organization && silksUrl && ownerMatches(ownerNorm, patternsFor(organization))) {
    return { show: true, silksUrls: [silksUrl] }
  }
  return { show: false, silksUrls: [] }
}
