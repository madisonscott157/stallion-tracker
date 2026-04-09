import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, isAuthError } from '@/lib/api-auth'

export async function GET() {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  // Get user's organization and role
  const { data: user } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('auth_id', userId)
    .single()

  if (!user?.organization_id && user?.role !== 'admin') {
    return NextResponse.json({ reports: [], org_themes: [] })
  }

  // Admins see all bookings; regular users see only their org's bookings
  let bookingsQuery = supabase
    .from('stallion_bookings')
    .select('*')
    .order('report_date', { ascending: false })

  if (user?.role !== 'admin' && user?.organization_id) {
    bookingsQuery = bookingsQuery.eq('organization_id', user.organization_id)
  }

  const { data, error } = await bookingsQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch all org themes using service role (bypasses RLS)
  // so PDF export can use any org's colors/silks regardless of user's org
  let orgThemes: { id: string; name: string; primary_color: string; secondary_color: string; silks_url: string | null }[] = []
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (serviceRoleKey) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: orgs } = await adminClient
      .from('organizations')
      .select('id, name, primary_color, secondary_color, silks_url')

    if (orgs) orgThemes = orgs
  }

  return NextResponse.json({ reports: data ?? [], org_themes: orgThemes })
}
