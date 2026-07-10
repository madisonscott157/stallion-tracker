import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, isAuthError } from '@/lib/api-auth'

type OrgTheme = { id: string; name: string; primary_color: string; secondary_color: string; silks_url: string | null }

// Fetch org themes for the PDF export. `orgIds === null` means the caller is an
// admin (may see every org); otherwise the list is restricted to the orgs the
// user can actually view, so we don't leak every tenant's branding.
function fetchOrgThemes(orgIds: string[] | null): Promise<OrgTheme[]> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!serviceRoleKey) return Promise.resolve([])
  if (orgIds && orgIds.length === 0) return Promise.resolve([])

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  let query = adminClient
    .from('organizations')
    .select('id, name, primary_color, secondary_color, silks_url')
  if (orgIds) query = query.in('id', orgIds)
  return Promise.resolve(query).then(({ data }) => (data as OrgTheme[]) ?? [])
}

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

  // Scope bookings query based on role
  let bookingsQuery = supabase
    .from('stallion_bookings')
    .select('*')
    .order('report_date', { ascending: false })

  // Admins see all orgs' themes; everyone else only the orgs they can view.
  let themeOrgIds: string[] | null = null

  if (user?.role !== 'admin' && user?.organization_id) {
    // Own org plus any source orgs granted via organization_booking_access
    const { data: accessRows } = await supabase
      .from('organization_booking_access')
      .select('source_organization_id')
      .eq('viewer_organization_id', user.organization_id)

    const sourceIds = (accessRows ?? []).map(r => r.source_organization_id as string)
    const visibleOrgIds = [user.organization_id, ...sourceIds]
    bookingsQuery = bookingsQuery.in('organization_id', visibleOrgIds)
    themeOrgIds = visibleOrgIds
  }

  // Bookings query and (scoped) org themes fetch run in parallel
  const [bookingsResult, orgThemes] = await Promise.all([
    bookingsQuery,
    fetchOrgThemes(themeOrgIds),
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
