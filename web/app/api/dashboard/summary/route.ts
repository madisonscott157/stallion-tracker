import { NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/api-auth'
import { isNaJumpsRace } from '@/lib/utils'

export async function GET() {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  // Single query for both prefs and profile — avoids two roundtrips to the same table
  const { data: userRow } = await supabase
    .from('users')
    .select('role, organization_id, show_claiming_races, organizations(allow_claiming_toggle, show_race_activity)')
    .eq('auth_id', userId)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const orgAllowsToggle = (userRow.organizations as any)?.allow_claiming_toggle ?? true
  const prefs = { show_claiming_races: orgAllowsToggle ? (userRow.show_claiming_races ?? true) : false }
  const showRaceActivity = (userRow.organizations as any)?.show_race_activity !== false
  const profile = userRow

  // 1. Fetch visible stallions (same logic as /api/stallions)
  type StallionRow = { id: string; name: string; stud_farm: string | null; stud_fee: string | null; tdn_region: string | null }
  let stallionList: StallionRow[] = []

  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('stallions')
      .select('id, name, stud_farm, stud_fee, tdn_region')
      .order('name')
    stallionList = data || []
  } else {
    if (!profile.organization_id) {
      return NextResponse.json({ stallions: [], recent_winners: [], recent_stakes: [] })
    }
    const { data } = await supabase
      .from('organization_stallions')
      .select('stallion_id, stallions(id, name, stud_farm, stud_fee, tdn_region)')
      .eq('organization_id', profile.organization_id)

    stallionList = (data || [])
      .map(os => os.stallions as unknown as StallionRow)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  if (stallionList.length === 0) {
    return NextResponse.json({ stallions: [], recent_winners: [], recent_stakes: [] })
  }

  const stallionIds = stallionList.map(s => s.id)
  const today = new Date().toISOString().split('T')[0]
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  try {

  // Build claiming race filter helper
  // Allow null race_type through — only exclude explicitly tagged MCL/CLM
  const applyClaimingFilter = (query: any) => {
    if (!prefs.show_claiming_races) {
      query = query.or('race_type.is.null,race_type.not.in.("MCL","CLM")')
    }
    return query
  }

  const emptyQuery = Promise.resolve({ data: [], error: null })
  const currentYear = new Date().getFullYear()

  // 2-5. Parallel queries
  const [entriesRes, entryResultsRes, ytdRes, winnersRes, stakesRes, rankingsRes] = await Promise.all([
    // Upcoming entries (all stallions, not scratched, from today).
    // Pull distance + sire's tdn_region so we can drop NA jumps races client-side.
    showRaceActivity
      ? applyClaimingFilter(
          supabase
            .from('entries')
            .select('id, horse_id, race_date, track, race_number, distance, horses!inner(sire_id, stallions!inner(tdn_region))')
            .eq('scratched', false)
            .gte('race_date', today)
        )
      : emptyQuery,

    // Results for today+ (to exclude entries whose race has already run)
    showRaceActivity
      ? supabase
          .from('results')
          .select('horse_id, race_date, track, race_number')
          .gte('race_date', today)
      : emptyQuery,

    // YTD stats from view (use stallion_name since view may not have stallion_id)
    supabase
      .from('stallion_ytd_stats')
      .select('*')
      .in('stallion_name', stallionList.map(s => s.name)),

    // Recent winners (last 14 days, limit 15)
    showRaceActivity
      ? applyClaimingFilter(
          supabase
            .from('results')
            .select(`
              *,
              horses!inner (
                name, sex, yob, dam, equibase_profile_url,
                stallions!inner ( name, tdn_region )
              )
            `)
            .eq('finish_position', 1)
            .gte('race_date', fourteenDaysAgo)
        )
          .order('race_date', { ascending: false })
          .order('race_number', { ascending: false })
          .limit(15)
      : emptyQuery,

    // Recent stakes (last 14 days, limit 15)
    showRaceActivity
      ? applyClaimingFilter(
          supabase
            .from('results')
            .select(`
              *,
              horses!inner (
                name, sex, yob, dam, equibase_profile_url,
                stallions!inner ( name, tdn_region )
              )
            `)
            .eq('is_stakes', true)
            .gte('race_date', fourteenDaysAgo)
        )
          .order('race_date', { ascending: false })
          .order('race_number', { ascending: false })
          .limit(15)
      : emptyQuery,

    supabase
      .from('sire_rankings')
      .select('stallion_id, starters, winners, total_earnings')
      .eq('year', currentYear)
      .in('stallion_id', stallionIds),
  ])

  // Log any query errors
  if (entriesRes.error) console.error('Dashboard entries query error:', entriesRes.error)
  if (entryResultsRes.error) console.error('Dashboard entry-results query error:', entryResultsRes.error)
  if (ytdRes.error) console.error('Dashboard YTD query error:', ytdRes.error)
  if (winnersRes.error) console.error('Dashboard winners query error:', winnersRes.error)
  if (stakesRes.error) console.error('Dashboard stakes query error:', stakesRes.error)
  if (rankingsRes.error) console.error('Dashboard rankings query error:', rankingsRes.error)

  // Build a set of results to exclude entries whose race has already run
  const resultKeys = new Set(
    (entryResultsRes.data || []).map((r: any) =>
      `${r.horse_id}|${r.race_date}|${r.track}|${r.race_number}`
    )
  )

  // Group entry counts by sire_id, excluding entries with matching results
  // and NA jumps races (anything > 1m6f for NA-region sires).
  const entryCounts: Record<string, number> = {}
  if (entriesRes.data) {
    for (const entry of entriesRes.data) {
      const key = `${entry.horse_id}|${(entry as any).race_date}|${(entry as any).track}|${(entry as any).race_number}`
      if (resultKeys.has(key)) continue
      const sireId = (entry.horses as any)?.sire_id
      const region = (entry.horses as any)?.stallions?.tdn_region ?? 'na'
      if (isNaJumpsRace((entry as any).distance ?? null, region)) continue
      if (sireId && stallionIds.includes(sireId)) {
        entryCounts[sireId] = (entryCounts[sireId] || 0) + 1
      }
    }
  }

  // Map YTD stats by stallion_name
  const ytdMap: Record<string, any> = {}
  if (ytdRes.data) {
    for (const stat of ytdRes.data) {
      ytdMap[stat.stallion_name] = stat
    }
  }

  // Map current-year sire rankings (TDN) by stallion_id.
  // Each stallion has at most one row per (year, list_type); typically one row for the current year.
  // If multiple exist, prefer the one with highest starters count.
  const rankingMap: Record<string, { starters: number | null; winners: number | null; total_earnings: number | null }> = {}
  if (rankingsRes.data) {
    for (const row of rankingsRes.data as any[]) {
      const existing = rankingMap[row.stallion_id]
      if (!existing || (row.starters ?? 0) > (existing.starters ?? 0)) {
        rankingMap[row.stallion_id] = {
          starters: row.starters,
          winners: row.winners,
          total_earnings: row.total_earnings,
        }
      }
    }
  }

  // Build stallion summaries
  const stallions = stallionList.map(s => {
    const tdn = rankingMap[s.id]
    return {
      id: s.id,
      name: s.name,
      stud_farm: s.stud_farm,
      stud_fee: s.stud_fee,
      tdn_region: s.tdn_region ?? 'na',
      upcoming_entries: entryCounts[s.id] || 0,
      ytd_starters: ytdMap[s.name]?.starters || 0,
      ytd_winners: ytdMap[s.name]?.winners || 0,
      ytd_earnings: ytdMap[s.name]?.total_earnings || 0,
      // TDN current-year stats — undefined when no ranking row exists
      tdn_year: tdn ? currentYear : null,
      tdn_starters: tdn?.starters ?? null,
      tdn_winners: tdn?.winners ?? null,
      tdn_earnings: tdn?.total_earnings ?? null,
    }
  })

  // Flatten results for frontend
  const flattenResult = (result: any) => ({
    ...result,
    horse_name: result.horses?.name,
    horse_sex: result.horses?.sex,
    horse_yob: result.horses?.yob,
    horse_dam: result.horses?.dam,
    horse_profile_url: result.horses?.equibase_profile_url,
    sire_name: result.horses?.stallions?.name,
  })

  // Drop NA jumps races (>1m6f for NA-region sires). International stallions
  // can legitimately race longer than 14f, so we only filter the NA case.
  const dropNaJumps = (rows: any[]) =>
    rows.filter(r => !isNaJumpsRace(r.distance ?? null, r.horses?.stallions?.tdn_region ?? 'na'))

  const recent_winners = dropNaJumps(winnersRes.data || []).map(flattenResult)
  const recent_stakes = dropNaJumps(stakesRes.data || []).map(flattenResult)

  const response = NextResponse.json({ stallions, recent_winners, recent_stakes })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response

  } catch (error) {
    console.error('Error fetching dashboard summary:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard summary' }, { status: 500 })
  }
}
