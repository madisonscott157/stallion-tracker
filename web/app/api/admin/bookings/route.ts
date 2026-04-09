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

async function verifyAdmin() {
  const supabase = createServerComponentClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: user } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('auth_id', session.user.id)
    .single()

  if (user?.role !== 'admin') return null
  return user
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { report_date, label, data, organization_id } = body

  if (!report_date || !data || !Array.isArray(data)) {
    return NextResponse.json({ error: 'report_date and data array are required' }, { status: 400 })
  }

  // Use provided org_id (admin may target a specific org) or fall back to admin's own org
  const orgId = organization_id || admin.organization_id
  if (!orgId) {
    return NextResponse.json({ error: 'No organization_id available' }, { status: 400 })
  }

  const insertData: Record<string, unknown> = {
    organization_id: orgId,
    report_date,
    data,
  }
  if (label) {
    insertData.label = label
  }

  const { data: result, error } = await adminClient
    .from('stallion_bookings')
    .insert(insertData)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, report: result?.[0] })
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { id, report_date, label, data, organization_id } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (report_date) {
    updateData.report_date = report_date
  }
  if (label !== undefined) {
    // Use empty string rather than null to avoid Supabase client hang
    updateData.label = label || ''
  }
  if (data) {
    updateData.data = data
  }
  if (organization_id) {
    updateData.organization_id = organization_id
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: result, error } = await adminClient
    .from('stallion_bookings')
    .update(updateData)
    .eq('id', id)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, report: result?.[0] })
}
