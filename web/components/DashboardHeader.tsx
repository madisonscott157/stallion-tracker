'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

interface DashboardHeaderProps {
  onPreferenceChange?: () => void
}

export function DashboardHeader({ onPreferenceChange }: DashboardHeaderProps) {
  const { profile, signOut, isSigningOut, isAdmin, hasBookings, updateProfile } = useAuth()
  const [clmUpdating, setClmUpdating] = useState(false)
  const showClmToggle = profile?.organization?.allow_claiming_toggle !== false
  const pathname = usePathname()
  const isBookingsPage = pathname === '/dashboard/bookings'

  const handleClmToggle = async () => {
    if (clmUpdating) return
    setClmUpdating(true)
    try {
      await updateProfile({ show_claiming_races: !profile?.show_claiming_races })
      onPreferenceChange?.()
    } catch (err) {
      console.error('Failed to update CLM preference:', err)
    } finally {
      setClmUpdating(false)
    }
  }

  return (
    <header className="sticky top-0 z-10 text-white px-3 sm:px-6 py-1.5 sm:py-3" style={{ backgroundColor: 'var(--org-primary)', paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}>
      <div className="max-w-5xl mx-auto flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-wide truncate min-w-0" style={{ color: 'var(--org-secondary)' }}>
          {profile?.organization?.name || 'Stallion Tracker'}
        </h1>

        {/* Mobile nav */}
        <div className="flex sm:hidden items-baseline gap-1.5 shrink-0" style={{ color: 'var(--org-secondary)' }}>
          {hasBookings && (
            isBookingsPage ? (
              <Link
                href="/dashboard"
                className="text-xs font-medium uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity px-1"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/dashboard/bookings"
                className="text-xs font-medium uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity px-1"
              >
                Bookings
              </Link>
            )
          )}
          {isAdmin && (
            <Link
              href="/admin"
              className="w-7 h-7 inline-flex items-center justify-center hover:text-white transition-colors self-center"
              title="Admin"
              aria-label="Admin settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          )}
          <button
            onClick={() => signOut()}
            disabled={isSigningOut}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center hover:text-white transition-colors disabled:opacity-50 self-center"
            title="Logout"
            aria-label="Logout"
          >
            {isSigningOut ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
          </button>
        </div>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-3 text-sm" style={{ color: 'var(--org-secondary)' }}>
          {profile && showClmToggle && (
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity">
              <input
                type="checkbox"
                checked={profile.show_claiming_races}
                onChange={handleClmToggle}
                disabled={clmUpdating}
                className="w-4 h-4 rounded accent-white"
              />
              CLM
            </label>
          )}
          {isAdmin && (
            <Link href="/admin" className="hover:text-white transition-colors inline-flex items-center">
              Admin
            </Link>
          )}
          {hasBookings && (
            isBookingsPage ? (
              <Link href="/dashboard" className="inline-flex items-center hover:text-white transition-colors">
                Dashboard
              </Link>
            ) : (
              <Link href="/dashboard/bookings" className="inline-flex items-center hover:text-white transition-colors">
                Stallion Bookings
              </Link>
            )
          )}
          <button
            onClick={() => signOut()}
            disabled={isSigningOut}
            className="hover:text-white transition-colors inline-flex items-center disabled:opacity-50"
          >
            {isSigningOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>
    </header>
  )
}
