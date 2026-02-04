import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient()

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user profile to check role and org
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (profile.role === 'admin') {
    // Admin sees all stallions
    const { data, error } = await supabase
      .from('stallions')
      .select('id, name')
      .order('name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data || [])
  } else {
    // Non-admin sees org-linked stallions
    if (!profile.organization_id) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('organization_stallions')
      .select('stallion_id, stallions(id, name)')
      .eq('organization_id', profile.organization_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const stallions = (data || [])
      .map(os => os.stallions)
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json(stallions)
  }
}
