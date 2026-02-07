import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  const prefs = await getUserPreferences(supabase, userId)

  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const limit = parseInt(searchParams.get('limit') || '20')
  const winnersOnly = searchParams.get('winners') === 'true'

  // Query results table with joins to get horse profile URL
  // RLS policies automatically filter to user's organization's stallions
  let query = supabase
    .from('results')
    .select(`
      *,
      horses!inner (
        name,
        sex,
        yob,
        dam,
        equibase_profile_url,
        stallions!inner (
          name
        )
      )
    `)

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('horses.stallions.name', stallion)
  }

  // Filter to winners only if requested
  if (winnersOnly) {
    query = query.eq('finish_position', 1)
  }

  // Filter out claiming races if user preference is set
  if (!prefs.show_claiming_races) {
    query = query.not('race_type', 'in', '(MCL,CLM)')
  }

  const { data, error } = await query
    .order('race_date', { ascending: false })
    .order('race_number', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching results:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the response for easier frontend consumption
  const results = data?.map(result => ({
    ...result,
    horse_name: result.horses?.name,
    horse_sex: result.horses?.sex,
    horse_yob: result.horses?.yob,
    horse_dam: result.horses?.dam,
    horse_profile_url: result.horses?.equibase_profile_url,
    sire_name: result.horses?.stallions?.name,
  })) || []

  return NextResponse.json(results)
}
