import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase } = auth

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
