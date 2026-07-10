import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient()

  // Verify admin. getUser() revalidates the JWT; getSession() only reads the cookie.
  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', caller.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const { email, name, password, organization_id, show_claiming_races = true } = await request.json()
  // Always create as 'user'. Promoting someone to admin is a deliberate
  // operation that doesn't belong in the create-user flow — it should be
  // done out-of-band (DB update or a future dedicated endpoint).
  const role = 'user'

  if (!email || !password || !organization_id) {
    return NextResponse.json({ error: 'Email, password, and organization_id are required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
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

  // Create auth user with provided password
  let authUserId: string
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    // If user already exists in auth (orphaned from a previous delete), reuse their auth record
    if (authError.message.toLowerCase().includes('already') || authError.status === 422) {
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers()
      const existing = existingUsers?.find(u => u.email === email)
      if (existing) {
        // Update their password to the new one
        await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
        authUserId = existing.id
      } else {
        console.error('Error creating auth user:', authError)
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }
    } else {
      console.error('Error creating auth user:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
  } else {
    authUserId = authUser.user.id
  }

  // Create profile in users table
  const { error: profileError } = await adminClient.from('users').insert({
    auth_id: authUserId,
    email,
    name: name || null,
    organization_id,
    role,
    show_claiming_races,
    show_dashboard: true,
  })

  if (profileError) {
    // Rollback: delete auth user if profile creation fails (only if we just created it)
    if (authUser) {
      await adminClient.auth.admin.deleteUser(authUserId)
    }
    console.error('Error creating user profile:', profileError)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    user: {
      id: authUserId,
      email,
      name,
      organization_id,
      role,
    },
  })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerComponentClient()

  // Verify admin. getUser() revalidates the JWT; getSession() only reads the cookie.
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', authUser.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const { userId } = await request.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get the user's auth_id before deleting the profile
  const { data: userProfile } = await adminClient
    .from('users')
    .select('auth_id')
    .eq('id', userId)
    .single()

  // Delete profile from users table
  const { error: deleteError } = await adminClient.from('users').delete().eq('id', userId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  // Delete auth user if auth_id exists
  if (userProfile?.auth_id) {
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userProfile.auth_id)
    if (authDeleteError) {
      console.error('Warning: profile deleted but auth user cleanup failed:', authDeleteError)
    }
  }

  return NextResponse.json({ success: true })
}
