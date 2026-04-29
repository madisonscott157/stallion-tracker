import type { Metadata, Viewport } from 'next'
import { AuthProvider, type Organization, type UserProfile } from '@/lib/auth-context'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { createServerComponentClient } from '@/lib/supabase-server'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stallion Tracker',
  description: 'Track racing entries and results for stallion progeny',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Stallion Tracker',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0f172a',
}

// SSR auth + profile hydration. The browser-side AuthProvider used to start with
// {user:null, profile:null, isLoading:true} and rely on a 5-second timeout safety
// net. That net manufactured a "logged-out" client state for any user whose
// initial getSession() was slow — the DashboardHeader would then render the
// "Stallion Tracker" + bare Logout fallback even though server-side auth was fine.
// Hydrating from cookies on the server eliminates that race entirely.
async function loadInitialAuth(): Promise<{
  user: { id: string; email?: string } | null
  profile: UserProfile | null
  allOrgsWithSilks: Organization[]
}> {
  try {
    const supabase = createServerComponentClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, profile: null, allOrgsWithSilks: [] }

    const { data: profileRow } = await supabase
      .from('users')
      .select(`*, organization:organizations(*)`)
      .eq('auth_id', user.id)
      .single()

    const profile = (profileRow ?? null) as UserProfile | null

    let allOrgsWithSilks: Organization[] = []
    if (profile?.role === 'admin') {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .not('silks_url', 'is', null)
      allOrgsWithSilks = (data ?? []) as Organization[]
    }

    return { user: { id: user.id, email: user.email }, profile, allOrgsWithSilks }
  } catch {
    return { user: null, profile: null, allOrgsWithSilks: [] }
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user: initialUser, profile: initialProfile, allOrgsWithSilks: initialOrgsWithSilks } =
    await loadInitialAuth()

  // Inline org colors on <html> so the SSR'd header paints with the correct
  // background instead of flashing navy defaults. The client AuthProvider
  // mirrors these into the same CSS variables on hydration.
  const orgPrimary = initialProfile?.organization?.primary_color ?? '#0f172a'
  const orgSecondary = initialProfile?.organization?.secondary_color ?? '#64748b'
  const sec = orgSecondary.toLowerCase().replace(/\s/g, '')
  const dataWhiteSecondary = (sec === '#ffffff' || sec === '#fff' || sec === 'white') ? '' : undefined

  return (
    <html
      lang="en"
      style={{ ['--org-primary' as any]: orgPrimary, ['--org-secondary' as any]: orgSecondary }}
      {...(dataWhiteSecondary !== undefined ? { 'data-white-secondary': dataWhiteSecondary } : {})}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50">
        <ErrorBoundary>
          <AuthProvider
            initialUser={initialUser}
            initialProfile={initialProfile}
            initialOrgsWithSilks={initialOrgsWithSilks}
          >
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
