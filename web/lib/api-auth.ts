import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AuthResult {
  supabase: SupabaseClient
  userId: string
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
