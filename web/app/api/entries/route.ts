import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences } from '@/lib/api-auth'
import { isNaJumpsRace } from '@/lib/utils'
import { convertPostTimeToET } from '@/lib/timezones'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  const prefs = await getUserPreferences(supabase, userId)

  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')

  // Get today's date for default filter
  const today = new Date().toISOString().split('T')[0]

  // Query entries table directly with joins
  // RLS policies automatically filter to user's organization's stallions
  let query = supabase
    .from('entries')
    .select(`
      *,
      horses!inner (
        name,
        sex,
        yob,
        dam,
        is_unnamed,
        equibase_profile_url,
        stallions!inner (
          name,
          tdn_region
        )
      )
    `)
    .eq('scratched', false)
    .gte('race_date', dateFrom || today)

  if (dateTo) {
    query = query.lte('race_date', dateTo)
  }

  // Filter by stallion if specified (in addition to RLS filtering)
  if (stallion) {
    query = query.ilike('horses.stallions.name', stallion)
  }

  // Filter out claiming races if user preference is set
  // Allow null race_type through — only exclude explicitly tagged MCL/CLM
  if (!prefs.show_claiming_races) {
    query = query.or('race_type.is.null,race_type.not.in.("MCL","CLM")')
  }

  // Stakes-only mode: drop everything except is_stakes = true
  if (prefs.show_stakes_only) {
    query = query.eq('is_stakes', true)
  }

  // Fetch entries and results with matching dates in parallel
  // so we can exclude entries whose race has already run
  let resultsQuery = supabase
    .from('results')
    .select('horse_id, race_date, track, race_number')
    .gte('race_date', dateFrom || today)

  if (dateTo) {
    resultsQuery = resultsQuery.lte('race_date', dateTo)
  }

  const [entriesResult, resultsResult] = await Promise.all([
    query
      .order('race_date', { ascending: true })
      .order('post_time', { ascending: true }),
    resultsQuery,
  ])

  if (entriesResult.error) {
    console.error('Error fetching entries:', entriesResult.error)
    return NextResponse.json({ error: entriesResult.error.message }, { status: 500 })
  }

  // Build a set of results keyed by horse_id+race_date+track+race_number
  const resultKeys = new Set(
    (resultsResult.data || []).map(r =>
      `${r.horse_id}|${r.race_date}|${r.track}|${r.race_number}`
    )
  )

  // Flatten the response, excluding entries whose race has already run
  const entries = (entriesResult.data || [])
    .filter(entry => !resultKeys.has(
      `${entry.horse_id}|${entry.race_date}|${entry.track}|${entry.race_number}`
    ))
    .filter((entry: any) => !isNaJumpsRace(entry.distance ?? null, entry.horses?.stallions?.tdn_region ?? 'na'))
    .map(entry => ({
      ...entry,
      horse_name: entry.horses?.name,
      horse_sex: entry.horses?.sex,
      horse_yob: entry.horses?.yob,
      horse_dam: entry.horses?.dam,
      horse_is_unnamed: entry.horses?.is_unnamed,
      horse_profile_url: entry.horses?.equibase_profile_url,
      sire_name: entry.horses?.stallions?.name,
    }))

  // Re-sort by absolute UTC instant so east-of-ET races (Tokyo morning races
  // that fall on the prior ET day) appear in correct chronological order
  // alongside same-source-date NA races. The DB-side ORDER BY only saw the
  // raw local clock so it can flip when display shifts to ET.
  entries.sort((a: any, b: any) => {
    const ax = convertPostTimeToET(a.post_time, a.race_date, a.race_country, a.timezone)?.utcMs
    const bx = convertPostTimeToET(b.post_time, b.race_date, b.race_country, b.timezone)?.utcMs
    if (ax != null && bx != null) return ax - bx
    // Unparseable rows fall back to race_date + raw post_time string
    if (a.race_date !== b.race_date) return a.race_date < b.race_date ? -1 : 1
    return (a.post_time ?? '').localeCompare(b.post_time ?? '')
  })

  const response = NextResponse.json(entries)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response
}
