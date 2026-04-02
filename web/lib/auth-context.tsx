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
    } else {
      // Default colors
      document.documentElement.style.setProperty('--org-primary', '#0f172a')
      document.documentElement.style.setProperty('--org-secondary', '#64748b')
    }
  }, [profile])

  useEffect(() => {
    let isCancelled = false

    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (isCancelled) return

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          const [profile, orgs] = await Promise.all([
            fetchProfile(session.user.id),
            fetchAllOrgsWithSilks(),
          ])
          if (isCancelled) return
          setProfile(profile)
          if (profile?.role === 'admin') {
            setAllOrgsWithSilks(orgs)
          }
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
        try {
          if (isCancelled) return
          setSession(session)
          setUser(session?.user ?? null)

          if (session?.user) {
            const [profile, orgs] = await Promise.all([
              fetchProfile(session.user.id),
              fetchAllOrgsWithSilks(),
            ])
            if (isCancelled) return
            setProfile(profile)
            if (profile?.role === 'admin') {
              setAllOrgsWithSilks(orgs)
            } else {
              setAllOrgsWithSilks([])
            }
          } else {
            setProfile(null)
            setAllOrgsWithSilks([])
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
    try {
      // Race the server signout against a 3-second timeout
      const result = await Promise.race([
        supabase.auth.signOut(),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: 'Sign out timed out' } }), 3000)
        ),
      ])
      if (result.error) {
        console.error('Server sign out failed, clearing locally:', result.error)
        await supabase.auth.signOut({ scope: 'local' })
      }
    } catch (err) {
      console.error('Error signing out, clearing locally:', err)
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // Local clear failed too — cookies will expire on their own
      }
    }
    setUser(null)
    setProfile(null)
    setSession(null)
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
