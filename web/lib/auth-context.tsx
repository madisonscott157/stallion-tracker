'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClientComponentClient } from './supabase'

export interface Organization {
  id: string
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  silks_url: string | null
  allow_claiming_toggle: boolean
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

  const supabase = createClientComponentClient()

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    const runQuery = () => supabase
      .from('users')
      .select(`*, organization:organizations(*)`)
      .eq('auth_id', userId)
      .single()

    const { data, error } = await runQuery()

    if (error) {
      console.error('Error fetching profile:', error)
      return null
    }

    // If organization_id is set but the join returned null, the JWT was momentarily stale
    // and RLS blocked the organizations read. Retry once after a short delay.
    if (data.organization_id && !data.organization) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const { data: retryData, error: retryError } = await runQuery()
      if (retryError) {
        console.error('Error fetching profile (retry):', retryError)
        return null
      }
      // If retry still has no org, return null so caller preserves any existing good state
      if (!retryData.organization) return null
      return retryData as UserProfile
    }

    return data as UserProfile
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

  // Apply org theme colors as CSS variables
  useEffect(() => {
    if (profile?.organization) {
      document.documentElement.style.setProperty('--org-primary', profile.organization.primary_color)
      document.documentElement.style.setProperty('--org-secondary', profile.organization.secondary_color)
      const sec = profile.organization.secondary_color?.toLowerCase().replace(/\s/g, '')
      if (sec === '#ffffff' || sec === '#fff' || sec === 'white') {
        document.documentElement.setAttribute('data-white-secondary', '')
      } else {
        document.documentElement.removeAttribute('data-white-secondary')
      }
    } else if (!isLoading) {
      // Default colors — only set after auth finishes loading to avoid flash
      document.documentElement.style.setProperty('--org-primary', '#0f172a')
      document.documentElement.style.setProperty('--org-secondary', '#64748b')
      document.documentElement.removeAttribute('data-white-secondary')
    }
  }, [profile, isLoading])

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
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!isCancelled) setHasBookings(!!data?.reports?.length)
        })
        .catch(() => {})
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
        // Also guard against a stale-JWT race on TOKEN_REFRESHED: if the org join returned null
        // but the current profile already has org data, keep the good data.
        if (fetchedProfile) {
          setProfile(prev => (prev?.organization && !fetchedProfile.organization) ? prev : fetchedProfile)
          setAllOrgsWithSilks(fetchedProfile.role === 'admin' ? orgs : [])
        }
        checkBookings()
      } finally {
        isLoadingUserData = false
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
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return
        if (isCancelled) return
        console.error('Error initializing auth:', error)
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
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
