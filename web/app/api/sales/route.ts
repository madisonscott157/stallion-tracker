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
  const year = searchParams.get('year')
  const saleType = searchParams.get('sale_type')

  // Query sales_stats with stallion join
  // RLS policies automatically filter to user's organization's stallions
  let query = supabase
    .from('sales_stats')
    .select(`
      *,
      stallions!inner (
        name
      )
    `)

  // Filter by stallion if specified
  if (stallion) {
    query = query.ilike('stallions.name', stallion)
  }

  // Filter by year if specified
  if (year) {
    query = query.eq('sale_year', parseInt(year))
  }

  // Filter by sale type if specified
  if (saleType) {
    query = query.eq('sale_type', saleType)
  }

  const { data, error } = await query
    .order('sale_year', { ascending: false })
    .order('sale_type')

  if (error) {
    console.error('Error fetching sales stats:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the response for frontend consumption
  const sales = data?.map(stat => ({
    ...stat,
    stallion_name: stat.stallions?.name,
  })) || []

  return NextResponse.json(sales)
}
