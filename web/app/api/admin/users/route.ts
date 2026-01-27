import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient()

  // Verify admin
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', session.user.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const { email, name, organization_id, role = 'user' } = await request.json()

  if (!email || !organization_id) {
    return NextResponse.json({ error: 'Email and organization_id are required' }, { status: 400 })
  }

  // Use service role to create user in Supabase Auth
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Generate a temporary password
  const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12)

  // Create auth user
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authError) {
    console.error('Error creating auth user:', authError)
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Create profile in users table
  const { error: profileError } = await adminClient.from('users').insert({
    auth_id: authUser.user.id,
    email,
    name: name || null,
    organization_id,
    role,
  })

  if (profileError) {
    // Rollback: delete auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(authUser.user.id)
    console.error('Error creating user profile:', profileError)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // Send password reset email so user can set their own password
  const { error: resetError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  if (resetError) {
    console.error('Error sending password reset:', resetError)
    // Don't fail the request, user was created successfully
  }

  return NextResponse.json({
    success: true,
    user: {
      id: authUser.user.id,
      email,
      name,
      organization_id,
      role,
    },
    // Only return temp password in development for testing
    ...(process.env.NODE_ENV === 'development' && { tempPassword }),
  })
}
