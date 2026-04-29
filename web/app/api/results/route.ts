import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences } from '@/lib/api-auth'
import { isNaJumpsRace } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  const prefs = await getUserPreferences(supabase, userId)

  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const limit = parseInt(searchParams.get('limit') || '20')
  const winnersOnly = searchParams.get('winners') === 'true'
  const days = searchParams.get('days')

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
          name,
          tdn_region
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

  // Filter by date range if specified
  if (days && !isNaN(parseInt(days))) {
    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    query = query.gte('race_date', since)
  }

  // Filter out claiming races if user preference is set
  // Allow null race_type through — only exclude explicitly tagged MCL/CLM
  if (!prefs.show_claiming_races) {
    query = query.or('race_type.is.null,race_type.not.in.("MCL","CLM")')
  }

  const { data, error } = await query
    .order('race_date', { ascending: false })
    .order('race_number', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching results:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the response, dropping NA jumps races (anything > 1m6f for NA stallions)
  const results = data
    ?.filter((result: any) => !isNaJumpsRace(result.distance ?? null, result.horses?.stallions?.tdn_region ?? 'na'))
    .map(result => ({
    ...result,
    horse_name: result.horses?.name,
    horse_sex: result.horses?.sex,
    horse_yob: result.horses?.yob,
    horse_dam: result.horses?.dam,
    horse_profile_url: result.horses?.equibase_profile_url,
    sire_name: result.horses?.stallions?.name,
  })) || []

  const response = NextResponse.json(results)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response
}
