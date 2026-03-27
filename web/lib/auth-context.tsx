'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
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
  isAdmin: boolean
  allOrgsWithSilks: Organization[]
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [allOrgsWithSilks, setAllOrgsWithSilks] = useState<Organization[]>([])

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

  useEffect(() => {
    setIsMounted(true)
  }, [])

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

    // Get initial session with timeout to prevent infinite loading
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (isCancelled) return

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          if (isCancelled) return
          setProfile(profile)
          // Fetch all orgs with silks for admins
          if (profile?.role === 'admin') {
            const orgs = await fetchAllOrgsWithSilks()
            if (isCancelled) return
            setAllOrgsWithSilks(orgs)
          }
        }
      } catch (error: unknown) {
        // Ignore AbortError - happens during component unmount/remount
        if (error instanceof Error && error.name === 'AbortError') return
        if (isCancelled) return
        console.error('Error initializing auth:', error)
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    // Add timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (!isCancelled) {
        setIsLoading(false)
      }
    }, 10000) // 10 second timeout

    initAuth()

    return () => {
      isCancelled = true
      clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          if (isCancelled) return
          setSession(session)
          setUser(session?.user ?? null)

          if (session?.user) {
            const profile = await fetchProfile(session.user.id)
            if (isCancelled) return
            setProfile(profile)
            // Fetch all orgs with silks for admins
            if (profile?.role === 'admin') {
              const orgs = await fetchAllOrgsWithSilks()
              if (isCancelled) return
              setAllOrgsWithSilks(orgs)
            } else {
              setAllOrgsWithSilks([])
            }
          } else {
            setProfile(null)
            setAllOrgsWithSilks([])
          }
        } catch (error: unknown) {
          // Ignore AbortError - happens during component unmount/remount
          if (error instanceof Error && error.name === 'AbortError') return
          if (isCancelled) return
          console.error('Error handling auth state change:', error)
        } finally {
          if (!isCancelled) {
            setIsLoading(false)
          }
        }
      }
    )

    return () => {
      isCancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
    window.location.href = '/login'
  }

  const refreshProfile = async () => {
    if (user) {
      const profile = await fetchProfile(user.id)
      setProfile(profile)
    }
  }

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return null
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      isLoading,
      isAdmin: profile?.role === 'admin',
      allOrgsWithSilks,
      signIn,
      signOut,
      refreshProfile,
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
