import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')
  const limit = parseInt(searchParams.get('limit') || '20')
  const winnersOnly = searchParams.get('winners') === 'true'

  // Build query using the view
  let query = supabase
    .from('recent_results')
    .select('*')

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('sire_name', stallion)
  }

  // Filter to winners only if requested
  if (winnersOnly) {
    query = query.eq('finish_position', 1)
  }

  const { data, error } = await query
    .order('race_date', { ascending: false })
    .order('race_number', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching results:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
