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
    .select('show_claiming_races')
    .eq('auth_id', userId)
    .single()

  return {
    show_claiming_races: data?.show_claiming_races ?? true,
  }
}
