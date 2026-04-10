import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, isAuthError } from '@/lib/api-auth'

type OrgTheme = { id: string; name: string; primary_color: string; secondary_color: string; silks_url: string | null }

function fetchOrgThemes(): Promise<OrgTheme[]> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!serviceRoleKey) return Promise.resolve([])

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return Promise.resolve(
    adminClient
      .from('organizations')
      .select('id, name, primary_color, secondary_color, silks_url')
  ).then(({ data }) => (data as OrgTheme[]) ?? [])
}

export async function GET() {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  // Kick off org themes fetch immediately — it doesn't need user profile
  const orgThemesPromise = fetchOrgThemes()

  // Get user's organization and role
  const { data: user } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('auth_id', userId)
    .single()

  if (!user?.organization_id && user?.role !== 'admin') {
    return NextResponse.json({ reports: [], org_themes: [] })
  }

  // Scope bookings query based on role
  let bookingsQuery = supabase
    .from('stallion_bookings')
    .select('*')
    .order('report_date', { ascending: false })

  if (user?.role !== 'admin' && user?.organization_id) {
    bookingsQuery = bookingsQuery.eq('organization_id', user.organization_id)
  }

  // Bookings query and org themes fetch run in parallel
  const [bookingsResult, orgThemes] = await Promise.all([
    bookingsQuery,
    orgThemesPromise,
  ])

  if (bookingsResult.error) {
    return NextResponse.json({ error: bookingsResult.error.message }, { status: 500 })
  }

  // Must not be cached — response is user-scoped (different users see different reports)
  // Browser HTTP cache keys on URL only, not cookies, so cached responses leak across users
  const response = NextResponse.json({
    reports: bookingsResult.data ?? [],
    org_themes: orgThemes,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
