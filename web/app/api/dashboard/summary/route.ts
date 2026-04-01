import { NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences } from '@/lib/api-auth'

export async function GET() {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  const prefs = await getUserPreferences(supabase, userId)

  // Get user profile for org-based stallion scoping
  const { data: profile } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('auth_id', userId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // 1. Fetch visible stallions (same logic as /api/stallions)
  let stallionList: { id: string; name: string; stud_farm: string | null; stud_fee: string | null }[] = []

  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('stallions')
      .select('id, name, stud_farm, stud_fee')
      .order('name')
    stallionList = data || []
  } else {
    if (!profile.organization_id) {
      return NextResponse.json({ stallions: [], recent_winners: [], recent_stakes: [] })
    }
    const { data } = await supabase
      .from('organization_stallions')
      .select('stallion_id, stallions(id, name, stud_farm, stud_fee)')
      .eq('organization_id', profile.organization_id)

    stallionList = (data || [])
      .map(os => os.stallions as unknown as { id: string; name: string; stud_farm: string | null; stud_fee: string | null })
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

  // 2-5. Parallel queries
  const [entriesRes, ytdRes, winnersRes, stakesRes] = await Promise.all([
    // Upcoming entries (all stallions, not scratched, from today)
    applyClaimingFilter(
      supabase
        .from('entries')
        .select('id, horse_id, horses!inner(sire_id)')
        .eq('scratched', false)
        .gte('race_date', today)
    ),

    // YTD stats from view (use stallion_name since view may not have stallion_id)
    supabase
      .from('stallion_ytd_stats')
      .select('*')
      .in('stallion_name', stallionList.map(s => s.name)),

    // Recent winners (last 14 days, limit 15)
    applyClaimingFilter(
      supabase
        .from('results')
        .select(`
          *,
          horses!inner (
            name, sex, yob, dam, equibase_profile_url,
            stallions!inner ( name )
          )
        `)
        .eq('finish_position', 1)
        .gte('race_date', fourteenDaysAgo)
    )
      .order('race_date', { ascending: false })
      .order('race_number', { ascending: false })
      .limit(15),

    // Recent stakes (last 14 days, limit 15)
    applyClaimingFilter(
      supabase
        .from('results')
        .select(`
          *,
          horses!inner (
            name, sex, yob, dam, equibase_profile_url,
            stallions!inner ( name )
          )
        `)
        .eq('is_stakes', true)
        .gte('race_date', fourteenDaysAgo)
    )
      .order('race_date', { ascending: false })
      .order('race_number', { ascending: false })
      .limit(15),
  ])

  // Log any query errors
  if (entriesRes.error) console.error('Dashboard entries query error:', entriesRes.error)
  if (ytdRes.error) console.error('Dashboard YTD query error:', ytdRes.error)
  if (winnersRes.error) console.error('Dashboard winners query error:', winnersRes.error)
  if (stakesRes.error) console.error('Dashboard stakes query error:', stakesRes.error)

  // Group entry counts by sire_id
  const entryCounts: Record<string, number> = {}
  if (entriesRes.data) {
    for (const entry of entriesRes.data) {
      const sireId = (entry.horses as any)?.sire_id
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

  // Build stallion summaries
  const stallions = stallionList.map(s => ({
    id: s.id,
    name: s.name,
    stud_farm: s.stud_farm,
    stud_fee: s.stud_fee,
    upcoming_entries: entryCounts[s.id] || 0,
    ytd_starters: ytdMap[s.name]?.starters || 0,
    ytd_winners: ytdMap[s.name]?.winners || 0,
    ytd_earnings: ytdMap[s.name]?.total_earnings || 0,
  }))

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

  const recent_winners = (winnersRes.data || []).map(flattenResult)
  const recent_stakes = (stakesRes.data || []).map(flattenResult)

  return NextResponse.json({ stallions, recent_winners, recent_stakes })

  } catch (error) {
    console.error('Error fetching dashboard summary:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard summary' }, { status: 500 })
  }
}
