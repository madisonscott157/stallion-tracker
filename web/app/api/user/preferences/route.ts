import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/api-auth'

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase, userId } = auth

  let body: { show_claiming_races?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.show_claiming_races !== 'boolean') {
    return NextResponse.json(
      { error: 'show_claiming_races must be a boolean' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('users')
    .update({ show_claiming_races: body.show_claiming_races })
    .eq('auth_id', userId)
    .select('show_claiming_races')
    .single()

  if (error) {
    console.error('Error updating preferences:', error)
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  if (!data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
