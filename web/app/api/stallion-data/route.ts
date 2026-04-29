import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences, getOrgShowRaceActivity } from '@/lib/api-auth'
import { isNaJumpsRace } from '@/lib/utils'
import { convertPostTimeToET } from '@/lib/timezones'

/**
 * Combined endpoint that returns all data for a stallion page in a single request.
 * Replaces 6 separate API calls (entries, results, stats, sales, rankings, equineline)
 * with one auth check, one preferences query, and parallel data fetches.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  const { searchParams } = new URL(request.url)
  let stallion = searchParams.get('stallion')
  const stallionIdParam = searchParams.get('id')

  // Accept either name or ID — resolve name from ID if needed
  if (!stallion && stallionIdParam) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(stallionIdParam)) {
      return NextResponse.json({ error: 'Invalid stallion id format' }, { status: 400 })
    }
    const { data: stallionRow } = await supabase
      .from('stallions')
      .select('name')
      .eq('id', stallionIdParam)
      .single()
    if (!stallionRow) {
      return NextResponse.json({ error: 'Stallion not found' }, { status: 404 })
    }
    stallion = stallionRow.name
  }

  if (!stallion) {
    return NextResponse.json({ error: 'stallion or id parameter required' }, { status: 400 })
  }

  // Single auth + preferences query (was duplicated across 6 routes)
  const prefs = await getUserPreferences(supabase, userId)
  const showRaceActivity = await getOrgShowRaceActivity(supabase, userId)

  const today = new Date().toISOString().split('T')[0]

  // Build claiming filter helper
  const claimingFilter = !prefs.show_claiming_races
    ? 'race_type.is.null,race_type.not.in.("MCL","CLM")'
    : null

  try {

  // When the caller's org has race activity hidden, skip the entries/results/
  // workouts roundtrips entirely — the UI treats these as empty arrays anyway.
  const emptyQuery = Promise.resolve({ data: [], error: null })

  // All data queries in parallel — single DB connection, single auth context
  const [
    entriesRes,
    resultsRes,
    statsRes,
    stallionIdRes,
    salesRes,
    workoutsRes,
  ] = await Promise.all([
    // Entries
    showRaceActivity ? (() => {
      let q = supabase
        .from('entries')
        .select('*, horses!inner ( name, sex, yob, dam, is_unnamed, equibase_profile_url, stallions!inner ( name ) )')
        .eq('scratched', false)
        .gte('race_date', today)
        .ilike('horses.stallions.name', stallion)
      if (claimingFilter) q = q.or(claimingFilter)
      return q.order('race_date', { ascending: true }).order('post_time', { ascending: true })
    })() : emptyQuery,

    // Results
    showRaceActivity ? (() => {
      let q = supabase
        .from('results')
        .select('*, horses!inner ( name, sex, yob, dam, equibase_profile_url, stallions!inner ( name ) )')
        .ilike('horses.stallions.name', stallion)
      if (claimingFilter) q = q.or(claimingFilter)
      return q.order('race_date', { ascending: false }).order('race_number', { ascending: false }).limit(1000)
    })() : emptyQuery,

    // YTD Stats
    supabase
      .from('stallion_ytd_stats')
      .select('*')
      .ilike('stallion_name', stallion),

    // Stallion ID lookup (needed for rankings, equineline, sales)
    supabase
      .from('stallions')
      .select('id, tdn_region')
      .ilike('name', stallion)
      .single(),

    // Sales
    supabase
      .from('sales_stats')
      .select('*, stallions!inner ( name )')
      .ilike('stallions.name', stallion)
      .order('sale_year', { ascending: false })
      .order('sale_type'),

    // Workouts
    showRaceActivity ? supabase
      .from('workouts')
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
            name
          )
        )
      `)
      .ilike('horses.stallions.name', stallion)
      .order('workout_date', { ascending: false })
      .limit(100) : emptyQuery,
  ])

  // Second batch: rankings + equineline + fee history need stallion ID
  const stallionId = stallionIdRes.data?.id
  const [rankingsRes, equinelineRes, historyRes] = stallionId
    ? await Promise.all([
        supabase
          .from('sire_rankings')
          .select('*')
          .eq('stallion_id', stallionId)
          .order('year', { ascending: false })
          .order('list_type'),
        supabase
          .from('equineline_stats')
          .select('*')
          .eq('stallion_id', stallionId)
          .maybeSingle(),
        supabase
          .from('stallion_fee_history')
          .select('id, stallion_id, year, stud_fee, mares_bred, standing_at')
          .eq('stallion_id', stallionId)
          .order('year', { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: null, error: null }, { data: [], error: null }]

  // Build a set of results keyed by horse_id+race_date+track+race_number
  // so we can exclude entries whose race has already run
  const resultKeys = new Set(
    (resultsRes.data || []).map((r: any) =>
      `${r.horse_id}|${r.race_date}|${r.track}|${r.race_number}`
    )
  )

  const stallionRegion = (stallionIdRes.data as any)?.tdn_region ?? 'na'

  // Flatten entries, excluding any where a matching result already exists,
  // and (for NA stallions) any race longer than 1m6f — those are jumps races.
  const entries = (entriesRes.data || [])
    .filter((entry: any) => !resultKeys.has(
      `${entry.horse_id}|${entry.race_date}|${entry.track}|${entry.race_number}`
    ))
    .filter((entry: any) => !isNaJumpsRace(entry.distance ?? null, stallionRegion))
    .map((entry: any) => ({
      ...entry,
      horse_name: entry.horses?.name,
      horse_sex: entry.horses?.sex,
      horse_yob: entry.horses?.yob,
      horse_dam: entry.horses?.dam,
      horse_is_unnamed: entry.horses?.is_unnamed,
      horse_profile_url: entry.horses?.equibase_profile_url,
      sire_name: entry.horses?.stallions?.name,
    }))

  // Re-sort entries by UTC instant — see entries/route.ts for the rationale.
  entries.sort((a: any, b: any) => {
    const ax = convertPostTimeToET(a.post_time, a.race_date, a.race_country, a.timezone)?.utcMs
    const bx = convertPostTimeToET(b.post_time, b.race_date, b.race_country, b.timezone)?.utcMs
    if (ax != null && bx != null) return ax - bx
    if (a.race_date !== b.race_date) return a.race_date < b.race_date ? -1 : 1
    return (a.post_time ?? '').localeCompare(b.post_time ?? '')
  })

  // Flatten results, dropping NA jumps races (anything > 1m6f for NA stallions)
  const results = (resultsRes.data || [])
    .filter((result: any) => !isNaJumpsRace(result.distance ?? null, stallionRegion))
    .map((result: any) => ({
    ...result,
    horse_name: result.horses?.name,
    horse_sex: result.horses?.sex,
    horse_yob: result.horses?.yob,
    horse_dam: result.horses?.dam,
    horse_profile_url: result.horses?.equibase_profile_url,
    sire_name: result.horses?.stallions?.name,
  }))

  // Stats
  const stats = statsRes.data?.[0] || {
    starters: 0, winners: 0, win_pct: 0, stakes_winners: 0, total_earnings: 0,
  }

  // Flatten sales
  const sales = (salesRes.data || []).map((stat: any) => ({
    ...stat,
    stallion_name: stat.stallions?.name,
  }))

  // Flatten workouts
  const workouts = (workoutsRes.data || []).map((workout: any) => ({
    ...workout,
    horse_name: workout.horses?.name,
    horse_sex: workout.horses?.sex,
    horse_yob: workout.horses?.yob,
    horse_dam: workout.horses?.dam,
    horse_is_unnamed: workout.horses?.is_unnamed,
    horse_profile_url: workout.horses?.equibase_profile_url,
    sire_name: workout.horses?.stallions?.name,
  }))

  const response = NextResponse.json({
    entries,
    results,
    stats,
    sales,
    workouts,
    rankings: rankingsRes.data || [],
    equineline: equinelineRes.data || null,
    history: historyRes.data || [],
    tdn_region: (stallionIdRes.data as any)?.tdn_region ?? 'na',
  })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response

  } catch (error) {
    console.error('Error fetching stallion data:', error)
    return NextResponse.json({ error: 'Failed to fetch stallion data' }, { status: 500 })
  }
}
