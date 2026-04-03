import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences } from '@/lib/api-auth'

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

  const today = new Date().toISOString().split('T')[0]

  // Build claiming filter helper
  const claimingFilter = !prefs.show_claiming_races
    ? 'race_type.is.null,race_type.not.in.("MCL","CLM")'
    : null

  try {

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
    (() => {
      let q = supabase
        .from('entries')
        .select('*, horses!inner ( name, sex, yob, dam, is_unnamed, equibase_profile_url, stallions!inner ( name ) )')
        .eq('scratched', false)
        .gte('race_date', today)
        .ilike('horses.stallions.name', stallion)
      if (claimingFilter) q = q.or(claimingFilter)
      return q.order('race_date', { ascending: true }).order('post_time', { ascending: true })
    })(),

    // Results
    (() => {
      let q = supabase
        .from('results')
        .select('*, horses!inner ( name, sex, yob, dam, equibase_profile_url, stallions!inner ( name ) )')
        .ilike('horses.stallions.name', stallion)
      if (claimingFilter) q = q.or(claimingFilter)
      return q.order('race_date', { ascending: false }).order('race_number', { ascending: false }).limit(1000)
    })(),

    // YTD Stats
    supabase
      .from('stallion_ytd_stats')
      .select('*')
      .ilike('stallion_name', stallion),

    // Stallion ID lookup (needed for rankings, equineline, sales)
    supabase
      .from('stallions')
      .select('id')
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
    supabase
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
      .limit(100),
  ])

  // Second batch: rankings + equineline need stallion ID
  const stallionId = stallionIdRes.data?.id
  const [rankingsRes, equinelineRes] = stallionId
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
      ])
    : [{ data: [], error: null }, { data: null, error: null }]

  // Flatten entries
  const entries = (entriesRes.data || []).map((entry: any) => ({
    ...entry,
    horse_name: entry.horses?.name,
    horse_sex: entry.horses?.sex,
    horse_yob: entry.horses?.yob,
    horse_dam: entry.horses?.dam,
    horse_is_unnamed: entry.horses?.is_unnamed,
    horse_profile_url: entry.horses?.equibase_profile_url,
    sire_name: entry.horses?.stallions?.name,
  }))

  // Flatten results
  const results = (resultsRes.data || []).map((result: any) => ({
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
  })
  response.headers.set('Cache-Control', 'private, s-maxage=300, stale-while-revalidate=600')
  return response

  } catch (error) {
    console.error('Error fetching stallion data:', error)
    return NextResponse.json({ error: 'Failed to fetch stallion data' }, { status: 500 })
  }
}
