import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError, getUserPreferences } from '@/lib/api-auth'

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
          name
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
  if (!prefs.show_claiming_races) {
    query = query.not('race_type', 'in', '(MCL,CLM)')
  }

  const { data, error } = await query
    .order('race_date', { ascending: true })
    .order('post_time', { ascending: true })

  if (error) {
    console.error('Error fetching entries:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the response for easier frontend consumption
  const entries = data?.map(entry => ({
    ...entry,
    horse_name: entry.horses?.name,
    horse_sex: entry.horses?.sex,
    horse_yob: entry.horses?.yob,
    horse_dam: entry.horses?.dam,
    horse_is_unnamed: entry.horses?.is_unnamed,
    horse_profile_url: entry.horses?.equibase_profile_url,
    sire_name: entry.horses?.stallions?.name,
  })) || []

  return NextResponse.json(entries)
}
