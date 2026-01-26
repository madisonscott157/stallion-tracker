import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')

  // Build query using the view
  let query = supabase
    .from('stallion_ytd_stats')
    .select('*')

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('stallion_name', stallion)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return first result or default stats
  if (data && data.length > 0) {
    return NextResponse.json(data[0])
  }

  return NextResponse.json({
    starters: 0,
    winners: 0,
    win_pct: 0,
    stakes_winners: 0,
    total_earnings: 0,
  })
}
