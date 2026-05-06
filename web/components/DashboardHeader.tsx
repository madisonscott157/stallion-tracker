'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ClmToggle } from './ClmToggle'
import { Spinner } from './Spinner'

interface DashboardHeaderProps {
  onPreferenceChange?: () => void
}

export function DashboardHeader({ onPreferenceChange }: DashboardHeaderProps) {
  const { user, profile, signOut, isSigningOut, isAdmin, hasBookings, isLoading } = useAuth()
  const pathname = usePathname()
  const isBookingsPage = pathname === '/dashboard/bookings'

  // Org is still resolving in any of these cases, all of which should render the
  // blank placeholder rather than the generic "Stallion Tracker" fallback:
  //   1. Auth is still initializing (isLoading)
  //   2. We have a user but the profile fetch hasn't returned yet
  //   3. Profile arrived but the org join hasn't (transient RLS/JWT race)
  // The "Stallion Tracker" fallback should only render when the user is truly
  // signed out — never during a transient null-profile window.
  const orgLoading =
    isLoading ||
    (user != null && profile == null) ||
    (profile?.organization_id != null && !profile?.organization)
  const orgName = profile?.organization?.name || (orgLoading ? '\u00A0' : 'Stallion Tracker')

  return (
    <header className="sticky top-0 z-10 text-white px-4 sm:px-6 sm:py-3" style={{ backgroundColor: 'var(--org-primary)', paddingTop: 'max(0.125rem, env(safe-area-inset-top))' }}>
      <div className="max-w-5xl mx-auto">

        {/* ── Mobile: single compact row ── */}
        <div className="flex sm:hidden items-center justify-between gap-2 pb-0.5" style={{ color: 'var(--org-secondary)' }}>
          {/* Org name */}
          <h1 className="text-base font-semibold tracking-wide truncate min-w-0">
            {orgName}
          </h1>

          {/* Nav icons / links */}
          <div className="flex items-center gap-0.5 shrink-0">
            {hasBookings && (
              isBookingsPage ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center text-xs font-medium uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity px-1"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/dashboard/bookings"
                  className="inline-flex items-center text-xs font-medium uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity px-1"
                >
                  Bookings
                </Link>
              )
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center p-0.5 hover:text-white transition-colors"
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
              className="inline-flex items-center p-0.5 hover:text-white transition-colors disabled:opacity-50"
              title="Logout"
              aria-label="Logout"
            >
              {isSigningOut ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Desktop: single row ── */}
        <div className="hidden sm:flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-wide truncate min-w-0" style={{ color: 'var(--org-secondary)' }}>
            {orgName}
          </h1>
          <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--org-secondary)' }}>
            {onPreferenceChange && (
              <ClmToggle context="_dashboard" onPreferenceChange={onPreferenceChange} className="opacity-80 hover:opacity-100 transition-opacity" />
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

      </div>
    </header>
  )
}
