import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AuthResult {
  supabase: SupabaseClient
  userId: string
}

interface UserPreferences {
  show_claiming_races: boolean
}

export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const supabase = createServerComponentClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return { supabase, userId: session.user.id }
}

export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}

export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPreferences> {
  const { data } = await supabase
    .from('users')
    .select('show_claiming_races, organizations(allow_claiming_toggle)')
    .eq('auth_id', userId)
    .single()

  // If the org has disabled the CLM toggle, force claiming races off
  const orgAllowsToggle = (data?.organizations as any)?.allow_claiming_toggle ?? true
  const showClaiming = orgAllowsToggle ? (data?.show_claiming_races ?? true) : false

  return {
    show_claiming_races: showClaiming,
  }
}

export async function getOrgShowRaceActivity(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('organizations(show_race_activity)')
    .eq('auth_id', userId)
    .single()

  // Missing/null is treated as true (belt-and-suspenders for rows created
  // before the migration ran)
  return (data?.organizations as any)?.show_race_activity !== false
}
