import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const limit = parseInt(searchParams.get('limit') || '50')
  const track = searchParams.get('track')

  // Query workouts table directly with joins
  // RLS policies automatically filter to user's organization's stallions
  let query = supabase
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
        owner,
        stallions!inner (
          name
        )
      )
    `)

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('horses.stallions.name', stallion)
  }

  // Filter by track if specified
  if (track) {
    query = query.ilike('track', `%${track}%`)
  }

  const { data, error } = await query
    .order('workout_date', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching workouts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the response
  const workouts = data?.map(workout => ({
    ...workout,
    horse_name: workout.horses?.name,
    horse_sex: workout.horses?.sex,
    horse_yob: workout.horses?.yob,
    horse_dam: workout.horses?.dam,
    horse_is_unnamed: workout.horses?.is_unnamed,
    horse_profile_url: workout.horses?.equibase_profile_url,
    sire_name: workout.horses?.stallions?.name,
    owner: workout.horses?.owner,
  })) || []

  return NextResponse.json(workouts)
}
