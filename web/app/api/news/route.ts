import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'
import { requireAuth, isAuthError } from '@/lib/api-auth'
import { lookup } from 'dns/promises'
import { isIP } from 'net'

const MAX_LIMIT = 50
const OG_FETCH_TIMEOUT_MS = 8000
const OG_HTML_CAP = 250_000
const OG_MAX_REDIRECTS = 4

// SSRF guard: reject IPs that could reach internal infrastructure or the cloud
// metadata endpoint. Covers loopback, private, link-local (incl. 169.254.169.254),
// CGNAT, and the IPv6 equivalents / IPv4-mapped forms.
function isPrivateIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, '') // unwrap IPv4-mapped IPv6
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true            // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true  // CGNAT
    return false
  }
  const lower = v.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  return false
}

// Resolve a URL's host and confirm it points at a public address. Rejects
// non-http(s) schemes and any host that resolves into private/reserved space.
async function assertPublicUrl(url: string): Promise<void> {
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Unsupported scheme')
  }
  const host = u.hostname
  const literal = host.replace(/^\[|\]$/g, '')
  if (isIP(literal)) {
    if (isPrivateIp(literal)) throw new Error('Blocked address')
    return
  }
  const results = await lookup(host, { all: true })
  if (results.length === 0) throw new Error('Unresolvable host')
  for (const { address } of results) {
    if (isPrivateIp(address)) throw new Error('Blocked address')
  }
}

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
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: user } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', authUser.id)
    .single()

  if (user?.role !== 'admin') return null
  return user
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const stallionId = searchParams.get('stallion_id')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, MAX_LIMIT)
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0

  // RLS scopes both tables to the user's org-linked stallions
  let query = supabase
    .from('news_items')
    .select(`
      *,
      news_item_tags!inner (
        stallion_id,
        horse_id,
        in_headline,
        stallions ( name ),
        horses ( name )
      )
    `)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (stallionId) {
    query = query.eq('news_item_tags.stallion_id', stallionId)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching news:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data || []).map((item: any) => {
    const { news_item_tags, ...rest } = item
    return {
      ...rest,
      tags: (news_item_tags || []).map((t: any) => ({
        stallion_id: t.stallion_id,
        horse_id: t.horse_id,
        in_headline: t.in_headline ?? false,
        stallion_name: t.stallions?.name ?? null,
        horse_name: t.horses?.name ?? null,
      })),
    }
  })

  const response = NextResponse.json({ items, hasMore: items.length === limit })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&nbsp;/g, ' ')
}

function extractMeta(html: string, property: string): string | null {
  // Handle both attribute orders: property-then-content and content-then-property
  const forward = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i')
  const backward = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, 'i')
  const match = html.match(forward) || html.match(backward)
  return match ? decodeEntities(match[1].trim()) : null
}

async function fetchPageMetadata(url: string): Promise<{ title: string | null; snippet: string | null; image: string | null }> {
  try {
    // Follow redirects manually so every hop is re-validated against the SSRF
    // guard — 'follow' would let a public URL 302 into internal space.
    let current = url
    let res: Response | null = null
    for (let hop = 0; hop <= OG_MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current)
      const r = await fetch(current, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS),
      })
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get('location')
        if (!location) return { title: null, snippet: null, image: null }
        current = new URL(location, current).toString()
        continue
      }
      res = r
      break
    }
    if (!res || !res.ok) return { title: null, snippet: null, image: null }
    const html = (await res.text()).slice(0, OG_HTML_CAP)

    let title = extractMeta(html, 'og:title')
    if (!title) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      title = t ? decodeEntities(t[1].trim()) : null
    }
    const snippet = extractMeta(html, 'og:description') || extractMeta(html, 'description')
    const image = extractMeta(html, 'og:image')
    return { title, snippet, image }
  } catch {
    return { title: null, snippet: null, image: null }
  }
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

  const body = await request.json().catch(() => null)
  const url: string | undefined = body?.url?.trim()
  const stallionIds: string[] = Array.isArray(body?.stallion_ids) ? body.stallion_ids : []

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'A valid http(s) URL is required' }, { status: 400 })
  }
  if (stallionIds.length === 0) {
    return NextResponse.json({ error: 'At least one stallion is required' }, { status: 400 })
  }

  const meta = await fetchPageMetadata(url)
  const title: string | undefined = body?.title?.trim() || meta.title || undefined
  if (!title) {
    return NextResponse.json(
      { error: 'Could not read a title from that page — please provide one' },
      { status: 400 }
    )
  }

  let source: string
  try {
    source = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Only include fields with actual values (Supabase null-hang gotcha)
  const row: Record<string, string> = {
    title,
    url,
    source,
    posted_by: admin.id,
    published_at: new Date().toISOString(),
  }
  const snippet = body?.snippet?.trim() || meta.snippet
  if (snippet) row.snippet = snippet
  if (meta.image) row.image_url = meta.image

  const { data: inserted, error: insertError } = await adminClient
    .from('news_items')
    .insert(row)
    .select('id')
    .single()

  if (insertError) {
    const isDuplicate = insertError.code === '23505'
    return NextResponse.json(
      { error: isDuplicate ? 'That link has already been posted' : insertError.message },
      { status: isDuplicate ? 409 : 500 }
    )
  }

  const tags = Array.from(new Set(stallionIds)).map(stallionId => ({
    news_item_id: inserted.id,
    stallion_id: stallionId,
  }))
  const { error: tagsError } = await adminClient.from('news_item_tags').insert(tags)
  if (tagsError) {
    await adminClient.from('news_items').delete().eq('id', inserted.id)
    return NextResponse.json({ error: tagsError.message }, { status: 500 })
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await adminClient.from('news_items').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
