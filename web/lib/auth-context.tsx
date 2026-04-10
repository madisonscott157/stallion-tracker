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
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        organization:organizations(*)
      `)
      .eq('auth_id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return null
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

    const checkBookings = () => {
      fetch('/api/bookings')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!isCancelled) setHasBookings(!!data?.reports?.length)
        })
        .catch(() => {})
    }

    const loadUserData = async (userId: string) => {
      const [fetchedProfile, orgs] = await Promise.all([
        fetchProfile(userId),
        fetchAllOrgsWithSilks(),
      ])
      if (isCancelled) return
      // Only update profile if fetch succeeded — don't wipe valid state on transient errors
      if (fetchedProfile) {
        setProfile(fetchedProfile)
        setAllOrgsWithSilks(fetchedProfile.role === 'admin' ? orgs : [])
      }
      checkBookings()
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
