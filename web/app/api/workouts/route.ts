import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const limit = parseInt(searchParams.get('limit') || '10')

  // Query workouts table directly with joins
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
        stallions!inner (
          name
        )
      )
    `)

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('horses.stallions.name', stallion)
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
  })) || []

  return NextResponse.json(workouts)
}
