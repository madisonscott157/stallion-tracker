import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin() {
  const supabase = createServerComponentClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return false

  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', authUser.id)
    .single()

  return user?.role === 'admin'
}

// Create a stallion
export async function POST(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const stallionData = await request.json()
  if (!stallionData.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const { data, error } = await adminClient.from('stallions').insert(stallionData).select()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, stallion: data?.[0] })
}

// Update a stallion
export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'Stallion id is required' }, { status: 400 })
  }

  // Whitelist editable fields. Anything else in the body (e.g. id, created_at,
  // sire_id, owner) is silently dropped so a malicious or buggy caller can't
  // mutate columns the admin UI doesn't intend to expose.
  const ALLOWED_FIELDS = [
    'name', 'yob', 'sire', 'dam', 'dam_sire',
    'stud_farm', 'stud_fee', 'fee_currency', 'tdn_region',
    'equineline_url', 'tdn_url', 'equibase_profile_url',
  ] as const
  const updates: Record<string, unknown> = {}
  for (const k of ALLOWED_FIELDS) {
    if (k in body) updates[k] = body[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
  }

  const { data, error } = await adminClient.from('stallions').update(updates).eq('id', id).select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, stallion: data?.[0] })
}

// Toggle stallion-org link
export async function PUT(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const { stallion_id, organization_id } = await request.json()
  if (!stallion_id || !organization_id) {
    return NextResponse.json({ error: 'stallion_id and organization_id are required' }, { status: 400 })
  }

  // Check if link exists
  const { data: existing } = await adminClient
    .from('organization_stallions')
    .select('*')
    .eq('stallion_id', stallion_id)
    .eq('organization_id', organization_id)

  if (existing && existing.length > 0) {
    const { error } = await adminClient
      .from('organization_stallions')
      .delete()
      .eq('stallion_id', stallion_id)
      .eq('organization_id', organization_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, linked: false })
  } else {
    const { error } = await adminClient
      .from('organization_stallions')
      .insert({ stallion_id, organization_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, linked: true })
  }
}

// Delete a stallion
export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'Stallion id is required' }, { status: 400 })
  }

  // Remove org links first
  await adminClient.from('organization_stallions').delete().eq('stallion_id', id)

  const { error } = await adminClient.from('stallions').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
