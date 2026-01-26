import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')

  // Get today's date for default filter
  const today = new Date().toISOString().split('T')[0]

  // Query entries table directly with joins
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

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('horses.stallions.name', stallion)
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
