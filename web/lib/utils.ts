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

export function formatSex(sex: string | null): string {
  const sexMap: Record<string, string> = {
    'c': 'colt',
    'f': 'filly',
    'g': 'gelding',
    'h': 'horse',
    'm': 'mare',
  }
  return sex ? sexMap[sex.toLowerCase()] || sex : ''
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

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

  // Clean any parsing garbage (from workout emails)
  const cleaned = distance.split(/Time:|Track Condition:/i)[0]?.trim() || distance.trim()

  const wordToNum: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  }

  const fractionToDecimal: Record<string, number> = {
    'half': 0.5,
    'one half': 0.5,
    'onehalf': 0.5,
    'quarter': 0.25,
    'one quarter': 0.25,
    'onequarter': 0.25,
    'eighth': 0.125,
    'one eighth': 0.125,
    'oneeighth': 0.125,
    'sixteenth': 0.0625,
    'one sixteenth': 0.0625,
    'onesixteenth': 0.0625,
    'three quarters': 0.75,
    'threequarters': 0.75,
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
    'eighth': '1/8',
    'one eighth': '1/8',
    'oneeighth': '1/8',
    'sixteenth': '1/16',
    'one sixteenth': '1/16',
    'onesixteenth': '1/16',
    'three quarters': '3/4',
    'threequarters': '3/4',
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

  // Match furlongs with fraction: "Six And One Half Furlongs" → "6.5f"
  const furlongFractionMatch = withoutAbout.match(/^(\w+)\s+And\s+(\w+(?:\s+\w+)?)\s+Furlongs?$/i)
  if (furlongFractionMatch) {
    const whole = wordToNum[furlongFractionMatch[1].toLowerCase()] || parseInt(furlongFractionMatch[1]) || 0
    const fractionWord = furlongFractionMatch[2].toLowerCase()
    const fractionVal = fractionToDecimal[fractionWord] || 0
    const total = whole + fractionVal
    // Format nicely: 6.5, not 6.500
    const formatted = total % 1 === 0 ? total.toString() : total.toString()
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
