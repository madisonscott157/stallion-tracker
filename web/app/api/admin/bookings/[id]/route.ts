import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!serviceRoleKey) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(): Promise<boolean> {
  const supabase = createServerComponentClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false

  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', session.user.id)
    .single()

  return user?.role === 'admin'
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const { error } = await adminClient
    .from('stallion_bookings')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
