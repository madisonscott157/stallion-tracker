'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClientComponentClient } from './supabase'

const ORG_THEME_STORAGE_KEY = 'st_org_theme_v1'

interface CachedOrgTheme {
  primary_color: string
  secondary_color: string
}

function readCachedOrgTheme(): CachedOrgTheme | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ORG_THEME_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.primary_color === 'string' && typeof parsed?.secondary_color === 'string') {
      return { primary_color: parsed.primary_color, secondary_color: parsed.secondary_color }
    }
    return null
  } catch {
    return null
  }
}

function writeCachedOrgTheme(theme: CachedOrgTheme | null): void {
  if (typeof window === 'undefined') return
  try {
    if (theme === null) window.localStorage.removeItem(ORG_THEME_STORAGE_KEY)
    else window.localStorage.setItem(ORG_THEME_STORAGE_KEY, JSON.stringify(theme))
  } catch {
    // localStorage unavailable (private mode / quota) — ignore
  }
}

function applyOrgColorsToDom(primary: string, secondary: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--org-primary', primary)
  document.documentElement.style.setProperty('--org-secondary', secondary)
  const sec = secondary?.toLowerCase().replace(/\s/g, '')
  if (sec === '#ffffff' || sec === '#fff' || sec === 'white') {
    document.documentElement.setAttribute('data-white-secondary', '')
  } else {
    document.documentElement.removeAttribute('data-white-secondary')
  }
}

export interface Organization {
  id: string
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  silks_url: string | null
  allow_claiming_toggle: boolean
  show_race_activity: boolean
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  organization_id: string
  role: 'user' | 'admin'
  default_stallion_id: string | null
  show_claiming_races: boolean
  show_dashboard: boolean
  organization?: Organization
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  isLoading: boolean
  isSigningOut: boolean
  isAdmin: boolean
  hasBookings: boolean
  allOrgsWithSilks: Organization[]
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: { show_claiming_races?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [allOrgsWithSilks, setAllOrgsWithSilks] = useState<Organization[]>([])
  const [hasBookings, setHasBookings] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const signOutRef = useRef(false)
  // Tracks whether org colors have been successfully applied this session.
  // Once set, we never overwrite with defaults — profile can be transiently null
  // during back-navigation / token refresh without resetting the header colors.
  const hasAppliedOrgColors = useRef(false)

  const supabase = createClientComponentClient()

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    // One pass: join, plus direct-org fallback (different RLS evaluation path).
    const tryOnce = async (): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from('users')
        .select(`*, organization:organizations(*)`)
        .eq('auth_id', userId)
        .single()

      if (error || !data) return null

      if (data.organization_id && !data.organization) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', data.organization_id)
          .single()
        return { ...data, organization: orgData ?? null } as UserProfile
      }
      return data as UserProfile
    }

    // Up to 3 passes with backoff. We return the first pass that yields a complete
    // profile (with org) — otherwise we fall through and return the best we got.
    let lastResult: UserProfile | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 400 * (1 << (attempt - 1))))
      }
      const result = await tryOnce()
      if (result) lastResult = result
      // Only short-circuit when org is fully resolved. If org_id is null (rare),
      // there's nothing to wait for either — return immediately.
      if (result && (!result.organization_id || result.organization)) return result
    }
    if (lastResult && lastResult.organization_id && !lastResult.organization) {
      console.warn('[auth] fetchProfile returning profile with null org after retries')
    } else if (!lastResult) {
      console.error('[auth] fetchProfile returned null after retries')
    }
    return lastResult
  }

  const fetchAllOrgsWithSilks = async (): Promise<Organization[]> => {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .not('silks_url', 'is', null)

    if (error) {
      console.error('Error fetching orgs with silks:', error)
      return []
    }
    return data as Organization[]
  }

  // On first mount, eagerly apply the last-known org theme from localStorage so the
  // header paints with correct colors before the profile fetch resolves. Without this,
  // a remount (back-nav, error boundary, hard refresh) shows the navy default for
  // ~hundreds of ms while the join races, which users perceive as "wrong colors".
  useEffect(() => {
    const cached = readCachedOrgTheme()
    if (cached) {
      applyOrgColorsToDom(cached.primary_color, cached.secondary_color)
      hasAppliedOrgColors.current = true
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply org theme colors as CSS variables. Defaults only kick in when we know the
  // user is signed out — never during a transient null-profile window.
  useEffect(() => {
    if (profile?.organization) {
      hasAppliedOrgColors.current = true
      applyOrgColorsToDom(profile.organization.primary_color, profile.organization.secondary_color)
      writeCachedOrgTheme({
        primary_color: profile.organization.primary_color,
        secondary_color: profile.organization.secondary_color,
      })
    } else if (!isLoading && !user && !hasAppliedOrgColors.current) {
      // Truly logged out and never applied colors — safe to use defaults.
      applyOrgColorsToDom('#0f172a', '#64748b')
    }
  }, [profile, isLoading, user])

  useEffect(() => {
    let isCancelled = false
    // Coalescing mutex: prevents concurrent loadUserData calls (which would thrash state)
    // while ensuring blocked callers still get a retry once the active load finishes.
    // If a call arrives while one is in-flight, we record the userId and run it
    // exactly once in the finally block — so no event is silently dropped.
    let isLoadingUserData = false
    let pendingUserId: string | null = null

    const checkBookings = () => {
      fetch('/api/bookings')
        .then(r => {
          // Only treat a definitive 200 as authoritative. Anything else (401/500/network)
          // we ignore so a transient error doesn't flip a previously-true hasBookings to false.
          if (!r.ok) return undefined
          return r.json()
        })
        .then(data => {
          if (isCancelled || data === undefined) return
          setHasBookings(!!data?.reports?.length)
        })
        .catch(() => {
          // Network error — keep last-known hasBookings rather than wiping it.
        })
    }

    const loadUserData = async (userId: string) => {
      if (isLoadingUserData) {
        pendingUserId = userId // queue a retry; will fire when active load finishes
        return
      }
      isLoadingUserData = true
      pendingUserId = null
      try {
        const [fetchedProfile, orgs] = await Promise.all([
          fetchProfile(userId),
          fetchAllOrgsWithSilks(),
        ])
        if (isCancelled) return
        // Only update profile if fetch succeeded — don't wipe valid state on transient errors.
        // Guard against a stale-JWT race: if the new fetch came back without org data but the
        // current profile already has org, keep the good data.
        if (fetchedProfile) {
          setProfile(prev => {
            if (prev?.organization && !fetchedProfile.organization) {
              console.warn('[auth] setProfile guard: keeping previous org data; new fetch had null org')
              return prev
            }
            return fetchedProfile
          })
          setAllOrgsWithSilks(fetchedProfile.role === 'admin' ? orgs : [])
        }
        checkBookings()
      } finally {
        isLoadingUserData = false
        // Flip isLoading to false only after the profile setState above has
        // been queued — this keeps React's batching tight so DashboardHeader
        // never renders with isLoading=false + profile=null, which produced
        // the "Stallion Tracker" + bare Logout fallback on back-navigation.
        if (!isCancelled) setIsLoading(false)
        // Run the queued retry (if any) — handles the case where a TOKEN_REFRESHED
        // event arrived while the initial load was in-flight and would otherwise be lost
        if (pendingUserId && !isCancelled) {
          const id = pendingUserId
          pendingUserId = null
          loadUserData(id)
        }
      }
    }

    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (isCancelled) return

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          await loadUserData(session.user.id)
          // loadUserData's finally flips isLoading to false after setProfile
          // — don't duplicate it here or we reintroduce the race.
        } else if (!isCancelled) {
          // No session → nothing to load, safe to mark complete.
          setIsLoading(false)
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return
        if (isCancelled) return
        console.error('Error initializing auth:', error)
        if (!isCancelled) setIsLoading(false)
      }
    }

    // Timeout safety net to prevent infinite loading
    const timeout = setTimeout(() => {
      if (!isCancelled) {
        setIsLoading(false)
      }
    }, 5000)

    initAuth()

    // Listen for auth changes (skip INITIAL_SESSION — getSession() handles it)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') return
        if (signOutRef.current) return // Don't process events during signout
        try {
          if (isCancelled) return
          setSession(session)
          setUser(session?.user ?? null)

          if (session?.user) {
            await loadUserData(session.user.id)
          } else if (event === 'SIGNED_OUT') {
            // Only clear profile on an explicit sign-out — not on token refresh
            // or other transient null-session events that would wipe the header
            setProfile(null)
            setAllOrgsWithSilks([])
            setHasBookings(false)
            hasAppliedOrgColors.current = false
            writeCachedOrgTheme(null)
          }
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') return
          if (isCancelled) return
          console.error('Error handling auth state change:', error)
        }
      }
    )

    return () => {
      isCancelled = true
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    if (signOutRef.current) return
    signOutRef.current = true
    setIsSigningOut(true)
    writeCachedOrgTheme(null)
    hasAppliedOrgColors.current = false

    // Safety net: if the navigation below is somehow blocked or interrupted,
    // release the lock so onAuthStateChange events resume processing instead of
    // leaving the AuthProvider in a permanently muted state.
    setTimeout(() => {
      signOutRef.current = false
      setIsSigningOut(false)
    }, 4000)

    const clearAuth = () => {
      document.cookie.split(';').forEach(c => {
        const name = c.split('=')[0].trim()
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
        }
      })
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-')) localStorage.removeItem(key)
      })
    }

    try {
      // Race signOut against a timeout — prevents hanging if token refresh
      // is in-flight or Supabase client is stuck
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ])
    } catch {
      // Ignore — we force-clear below
    }

    // Clear auth state twice: once now, once after a tick to catch any
    // cookies re-written by a racing token refresh
    clearAuth()
    setUser(null)
    setProfile(null)
    setSession(null)
    setHasBookings(false)
    await new Promise(resolve => setTimeout(resolve, 100))
    clearAuth()

    window.location.href = '/login'
  }

  const updateProfile = async (updates: { show_claiming_races?: boolean }) => {
    const res = await fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      throw new Error('Failed to update preferences')
    }
    const data = await res.json()
    setProfile(prev => prev ? { ...prev, show_claiming_races: data.show_claiming_races } : prev)
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      isLoading,
      isSigningOut,
      isAdmin: profile?.role === 'admin',
      hasBookings,
      allOrgsWithSilks,
      signIn,
      signOut,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
