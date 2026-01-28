import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient()

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const stallion = searchParams.get('stallion')

  if (!stallion) {
    return NextResponse.json({ error: 'stallion parameter required' }, { status: 400 })
  }

  // First get the stallion ID
  // RLS will filter to user's organization's stallions
  const { data: stallionData, error: stallionError } = await supabase
    .from('stallions')
    .select('id')
    .ilike('name', stallion)
    .single()

  if (stallionError || !stallionData) {
    return NextResponse.json({ error: 'Stallion not found' }, { status: 404 })
  }

  // Get sire rankings for this stallion
  const { data, error } = await supabase
    .from('sire_rankings')
    .select('*')
    .eq('stallion_id', stallionData.id)
    .order('year', { ascending: false })
    .order('list_type')

  if (error) {
    console.error('Error fetching sire rankings:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
