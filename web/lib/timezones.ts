// Display-time conversion of post times to America/New_York (Eastern).
// Uses native Intl.DateTimeFormat with IANA zone names so DST is handled
// automatically — including Southern-Hemisphere transitions, the Arabian
// Peninsula's lack of DST, etc. No third-party dep.
//
// Source data quirks we paper over here:
//   - parser/parsers/entry_parser.py stores per-track US abbrevs (ET/CT/MT/PT)
//   - parser/parsers/arion_entry_parser.py stores per-country abbrevs that
//     are wrong half the year ("BST" even in winter, "CET" even when CEST).
//     Mapping the abbreviation back to its country's IANA zone is correct
//     because the IANA zone handles DST itself.

const COUNTRY_TO_IANA: Record<string, string> = {
  // North America
  'USA': 'America/New_York',
  'United States': 'America/New_York',
  'US': 'America/New_York',
  'Canada': 'America/New_York',
  'CAN': 'America/New_York',
  // British Isles
  'Great Britain': 'Europe/London',
  'GB': 'Europe/London',
  'GBR': 'Europe/London',
  'United Kingdom': 'Europe/London',
  'UK': 'Europe/London',
  'Ireland': 'Europe/Dublin',
  'IRE': 'Europe/Dublin',
  // Continental Europe — all CET/CEST, same IANA semantics
  'France': 'Europe/Paris',
  'FR': 'Europe/Paris',
  'FRA': 'Europe/Paris',
  'Germany': 'Europe/Berlin',
  'GER': 'Europe/Berlin',
  'Italy': 'Europe/Rome',
  'ITY': 'Europe/Rome',
  'Spain': 'Europe/Madrid',
  'Belgium': 'Europe/Brussels',
  'Netherlands': 'Europe/Amsterdam',
  'Switzerland': 'Europe/Zurich',
  'Austria': 'Europe/Vienna',
  'Poland': 'Europe/Warsaw',
  'Czech Republic': 'Europe/Prague',
  'Hungary': 'Europe/Budapest',
  'Sweden': 'Europe/Stockholm',
  'Denmark': 'Europe/Copenhagen',
  'Norway': 'Europe/Oslo',
  // Gulf / Arabia (no DST)
  'Qatar': 'Asia/Qatar',
  'UAE': 'Asia/Dubai',
  'Saudi Arabia': 'Asia/Riyadh',
  'Bahrain': 'Asia/Bahrain',
  // East Asia (no DST)
  'Japan': 'Asia/Tokyo',
  'JPN': 'Asia/Tokyo',
  'Hong Kong': 'Asia/Hong_Kong',
  'HK': 'Asia/Hong_Kong',
  'Singapore': 'Asia/Singapore',
  // Southern Hemisphere — DST flipped vs. NA
  'Australia': 'Australia/Sydney',
  'AUS': 'Australia/Sydney',
  'New Zealand': 'Pacific/Auckland',
  'NZ': 'Pacific/Auckland',
  'Argentina': 'America/Argentina/Buenos_Aires',
  'ARG': 'America/Argentina/Buenos_Aires',
  'Chile': 'America/Santiago',
  'Brazil': 'America/Sao_Paulo',
  'South Africa': 'Africa/Johannesburg',
  // Other Tier-1-eligible jurisdictions in the Arion feed
  'South Korea': 'Asia/Seoul',
  'Korea': 'Asia/Seoul',
  'KOR': 'Asia/Seoul',
  'Turkey': 'Europe/Istanbul',
  'TUR': 'Europe/Istanbul',
  'Morocco': 'Africa/Casablanca',
  'Slovakia': 'Europe/Bratislava',
  'Finland': 'Europe/Helsinki',
  'Russia': 'Europe/Moscow',
}

// Abbreviation fallback when race_country isn't populated. These are the
// labels parser/parsers/* writes into entries.timezone.
const ABBREV_TO_IANA: Record<string, string> = {
  'ET': 'America/New_York',
  'EST': 'America/New_York',
  'EDT': 'America/New_York',
  'CT': 'America/Chicago',
  'CST': 'America/Chicago',
  'CDT': 'America/Chicago',
  'MT': 'America/Denver',
  'MST': 'America/Denver',
  'MDT': 'America/Denver',
  'PT': 'America/Los_Angeles',
  'PST': 'America/Los_Angeles',
  'PDT': 'America/Los_Angeles',
  'GMT': 'Europe/London',
  'BST': 'Europe/London',
  'CET': 'Europe/Paris',
  'CEST': 'Europe/Paris',
  'JST': 'Asia/Tokyo',
  'HKT': 'Asia/Hong_Kong',
  'AST': 'Asia/Qatar',
  'GST': 'Asia/Dubai',
}

export function getIanaTimezone(
  country?: string | null,
  tzAbbrev?: string | null
): string | null {
  if (country) {
    const iana = COUNTRY_TO_IANA[country] ?? COUNTRY_TO_IANA[country.toUpperCase()]
    if (iana) return iana
  }
  if (tzAbbrev) {
    const iana = ABBREV_TO_IANA[tzAbbrev.toUpperCase()]
    if (iana) return iana
  }
  return null
}

// "3:20 PM" / "15:20" / "15:20:00" → { hour, minute } in 24-hour form. Returns
// null if the string can't be parsed. We accept whatever shape the parser
// happened to write because the input format isn't strictly normalized.
function parseTimeOfDay(s: string): { hour: number; minute: number } | null {
  const trimmed = s.trim()
  // 12-hour: "3:20 PM" (AM/PM may be lower/upper, with or without space)
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?[Mm]\.?$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = parseInt(m12[2], 10)
    const isPM = m12[3].toUpperCase() === 'P'
    if (h === 12) h = 0
    if (isPM) h += 12
    return { hour: h, minute: min }
  }
  // 24-hour: "15:20" or "15:20:00"
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (m24) {
    return { hour: parseInt(m24[1], 10), minute: parseInt(m24[2], 10) }
  }
  return null
}

// Native-Intl wall-clock-in-zone -> UTC instant. Uses a single round-trip
// formatToParts to compute the zone's offset at that instant, including DST.
function wallClockInZoneToUTC(
  year: number,
  month1: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  zone: string
): Date {
  // Step 1: pretend the wall clock is UTC.
  const asUTC = Date.UTC(year, month1 - 1, day, hour, minute)
  // Step 2: format that instant *in the target zone*. The result tells us
  // what wall clock the zone would show — i.e. the wall clock plus offset.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(asUTC)).map(p => [p.type, p.value])
  )
  const shifted = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  // offset = (zone wall clock for asUTC) - (asUTC). The real UTC of the
  // original wall clock is asUTC minus this offset.
  const offset = shifted - asUTC
  return new Date(asUTC - offset)
}

export interface ConvertedPostTime {
  // "3:20 PM ET"
  time: string
  // The ET calendar date (YYYY-MM-DD) corresponding to the post-time instant.
  // May differ from the source race_date for east-of-ET zones (Asia, Gulf)
  // when the local race time falls before the day's UTC offset to ET.
  etDate: string
  // The original race_date for comparison.
  sourceDate: string
  // True iff etDate !== sourceDate. Lets callers decide whether to show a
  // shifted date label (e.g. "Nov 22" instead of "Nov 23").
  dayShift: boolean
  // The absolute UTC instant — handy for sorting after conversion.
  utcMs: number
}

// Format an entry's local post time as Eastern. Returns null if we can't
// determine the source zone or parse the time — caller should fall back to
// showing whatever the parser stored.
export function convertPostTimeToET(
  postTime: string | null | undefined,
  raceDate: string | null | undefined,
  country?: string | null,
  tzAbbrev?: string | null
): ConvertedPostTime | null {
  if (!postTime || !raceDate) return null
  const sourceIana = getIanaTimezone(country, tzAbbrev)
  if (!sourceIana) return null

  const tod = parseTimeOfDay(postTime)
  if (!tod) return null

  const dateMatch = raceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!dateMatch) return null
  const [, y, mo, d] = dateMatch

  try {
    const utc = wallClockInZoneToUTC(
      Number(y), Number(mo), Number(d),
      tod.hour, tod.minute, sourceIana
    )
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(utc) + ' ET'
    // Derive the ET calendar date for the same instant. We extract Y/M/D from
    // formatToParts so we don't have to deal with locale string ordering.
    const dateParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(utc).map(p => [p.type, p.value])
    )
    const etDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
    return {
      time,
      etDate,
      sourceDate: raceDate,
      dayShift: etDate !== raceDate,
      utcMs: utc.getTime(),
    }
  } catch {
    return null
  }
}

// Backwards-compat shim: returns just the time string for callers that don't
// need date / sort metadata.
export function formatPostTimeET(
  postTime: string | null | undefined,
  raceDate: string | null | undefined,
  country?: string | null,
  tzAbbrev?: string | null
): string | null {
  return convertPostTimeToET(postTime, raceDate, country, tzAbbrev)?.time ?? null
}
