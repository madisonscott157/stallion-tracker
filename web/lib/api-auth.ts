import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AuthResult {
  supabase: SupabaseClient
  userId: string
}

interface UserPreferences {
  show_claiming_races: boolean
  show_stakes_only: boolean
}

// Resolves the effective filter values for a request. The CLM/stakes toggles
// are now per-context (stallion or dashboard) and live in client localStorage,
// so the client passes the desired state via ?show_clm and ?stakes_only.
// `users.show_claiming_races` is the admin-granted permission — without it
// we silently force CLM off regardless of what the client asked for.
export function resolveToggles(
  searchParams: URLSearchParams,
  prefs: UserPreferences
): { show_claiming_races: boolean; show_stakes_only: boolean } {
  const clmParam = searchParams.get('show_clm')
  const stakesParam = searchParams.get('stakes_only')
  // Permission gate: if the user can't view CLM, server always filters it out.
  // Otherwise the client value wins; missing param defaults to off.
  const showClaiming = prefs.show_claiming_races && clmParam === 'true'
  const stakesOnly = stakesParam === 'true'
  return { show_claiming_races: showClaiming, show_stakes_only: stakesOnly }
}

// Hide non-stakes European handicaps (race_type=HCP + is_stakes=false). Only
// affects FR/GB/IRE-style data — US races aren't tagged HCP, US handicap
// stakes are STK with is_stakes=true, and Listed/Group handicaps upstream
// are tagged STK regardless of "Handicap" in the name. Nurseries (NUR),
// maidens, novices, conditions, and allowances are unaffected.
export function applyHideLowLevelHandicaps<T extends {
  or: (filters: string) => T
}>(query: T): T {
  return query.or('race_type.is.null,race_type.neq.HCP,is_stakes.eq.true')
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
    .select('show_claiming_races, show_stakes_only, organizations(allow_claiming_toggle)')
    .eq('auth_id', userId)
    .single()

  // If the org has disabled the CLM toggle, force claiming races off
  const orgAllowsToggle = (data?.organizations as any)?.allow_claiming_toggle ?? true
  const showClaiming = orgAllowsToggle ? (data?.show_claiming_races ?? true) : false

  return {
    show_claiming_races: showClaiming,
    show_stakes_only: data?.show_stakes_only ?? false,
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
