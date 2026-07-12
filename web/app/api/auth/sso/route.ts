import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createHmac, timingSafeEqual } from 'crypto'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const email = searchParams.get('email')
  const org = searchParams.get('org')
  const exp = searchParams.get('exp')
  const sig = searchParams.get('sig')

  // Validate required params
  if (!email || !org || !exp || !sig) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // Normalize email to match Supabase Auth behavior
  const normalizedEmail = email.toLowerCase().trim()

  // Check expiry
  const expiry = parseInt(exp, 10)
  if (isNaN(expiry) || Math.floor(Date.now() / 1000) > expiry) {
    return NextResponse.json({ error: 'Link expired' }, { status: 401 })
  }

  // Look up per-org secret (slug hyphens become underscores in env var names)
  const envKey = `SSO_SECRET_${org.toUpperCase().replace(/-/g, '_')}`
  const secret = process.env[envKey]
  if (!secret) {
    return NextResponse.json({ error: 'Unknown organization' }, { status: 403 })
  }

  // Verify HMAC-SHA256 (timing-safe)
  const payload = `${email}|${org}|${exp}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')

  const sigBuffer = Buffer.from(sig, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // Admin client (service role)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Replay protection: each signed link may be redeemed exactly once. Record the
  // signature; a duplicate hits the primary key and is rejected. Done after the
  // signature/expiry checks so we never persist tokens for forged requests.
  const { error: replayError } = await adminClient
    .from('sso_used_tokens')
    .insert({ sig, expires_at: new Date(expiry * 1000).toISOString() })
  if (replayError) {
    // 23505 = unique_violation → this link was already used.
    if ((replayError as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Link already used' }, { status: 401 })
    }
    console.error('SSO: Error recording token:', replayError)
    return NextResponse.json({ error: 'Failed to validate link' }, { status: 500 })
  }

  // The insert above is an early claim that blocks replays and races. But a
  // signed link should only be permanently "spent" on a *successful* login —
  // otherwise a transient failure below (org lookup, user creation, session
  // mint) would burn a valid link and lock the user out for good. So every
  // failure path after the claim releases it, leaving the link usable on retry.
  const releaseClaimAnd = async (
    body: Record<string, unknown>,
    status: number
  ): Promise<NextResponse> => {
    await adminClient.from('sso_used_tokens').delete().eq('sig', sig)
    return NextResponse.json(body, { status })
  }

  // Resolve organization by slug
  const { data: organization, error: orgError } = await adminClient
    .from('organizations')
    .select('id')
    .eq('slug', org)
    .single()

  if (orgError || !organization) {
    return releaseClaimAnd({ error: 'Organization not found' }, 404)
  }

  // Find or create auth user (no password — SSO-only)
  let authUserId: string

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
  })

  if (authError) {
    if (authError.message.toLowerCase().includes('already') || authError.status === 422) {
      const { data: listData } = await adminClient.auth.admin.listUsers()
      const existing = listData?.users?.find((u: { email?: string }) => u.email === normalizedEmail)
      if (existing) {
        authUserId = existing.id
      } else {
        console.error('SSO: Could not find existing auth user:', normalizedEmail)
        return releaseClaimAnd({ error: 'Failed to resolve user' }, 500)
      }
    } else {
      console.error('SSO: Error creating auth user:', authError)
      return releaseClaimAnd({ error: authError.message }, 500)
    }
  } else {
    authUserId = authUser.user.id
  }

  // Find or create profile in users table
  const { data: existingProfile } = await adminClient
    .from('users')
    .select('id, organization_id')
    .eq('auth_id', authUserId)
    .single()

  if (existingProfile) {
    // Cross-tenant guard: the signing org must own this account. Otherwise a
    // partner holding one valid SSO secret could sign another org's email and
    // be logged in as that org's user. The org param only selects the verifying
    // secret — it must not grant access to accounts it doesn't own.
    if (existingProfile.organization_id !== organization.id) {
      console.error('SSO: org mismatch for', normalizedEmail)
      return releaseClaimAnd({ error: 'Account belongs to a different organization' }, 403)
    }
  } else {
    const { error: profileError } = await adminClient.from('users').insert({
      auth_id: authUserId,
      email: normalizedEmail,
      organization_id: organization.id,
      role: 'user',
      show_claiming_races: true,
      show_dashboard: true,
    })

    if (profileError) {
      console.error('SSO: Error creating user profile:', profileError)
      return releaseClaimAnd({ error: 'Failed to create user profile' }, 500)
    }
  }

  // Generate magic link token (server-side only, no email sent)
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizedEmail,
  })

  if (linkError || !linkData) {
    console.error('SSO: Error generating magic link:', linkError)
    return releaseClaimAnd({ error: 'Failed to generate session' }, 500)
  }

  // Create session via SSR client wired to set cookies on the redirect response
  const redirectUrl = new URL('/dashboard', request.url)
  const response = NextResponse.redirect(redirectUrl)

  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { error: sessionError } = await ssrClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (sessionError) {
    console.error('SSO: Error creating session:', sessionError)
    return releaseClaimAnd({ error: 'Failed to create session' }, 500)
  }

  return response
}
