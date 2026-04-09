'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { StallionSelector } from './StallionSelector'

interface HeaderProps {
  stallionName: string
  stallionId: string | null
  onStallionChange: (id: string, name: string) => void
  onExportPDF?: () => void
  isExporting?: boolean
  onPreferenceChange?: () => void
}

export function Header({
  stallionName,
  stallionId,
  onStallionChange,
  onExportPDF,
  isExporting,
  onPreferenceChange
}: HeaderProps) {
  const { profile, signOut, isSigningOut, isAdmin, updateProfile } = useAuth()
  const [clmUpdating, setClmUpdating] = useState(false)
  const [hasBookings, setHasBookings] = useState(false)
  const showClmToggle = profile?.organization?.allow_claiming_toggle !== false

  useEffect(() => {
    fetch('/api/bookings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.reports?.length) setHasBookings(true)
      })
      .catch(() => {})
  }, [])

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
      <div className="max-w-5xl mx-auto">
        {/* Mobile: Two rows */}
        {/* Desktop: Single row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
          {/* Row 1 on mobile / Left side on desktop */}
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
            {/* Back to dashboard link */}
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center hover:text-white transition-colors"
              style={{ color: 'var(--org-secondary)' }}
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            {/* Stallion selector (always visible) */}
            <StallionSelector
              value={stallionId}
              onChange={onStallionChange}
            />

            {/* Title - hidden on mobile */}
            <h1 className="hidden lg:block text-lg font-semibold tracking-wide truncate min-w-0" style={{ color: 'var(--org-secondary)' }}>
              {stallionName.toUpperCase()} <span className="font-normal text-white/70">| Progeny Tracker</span>
            </h1>

            {/* Mobile nav links - all use identical wrapper styling for alignment */}
            <div className="flex sm:hidden items-center gap-1 shrink-0" style={{ color: 'var(--org-secondary)' }}>
              {profile && showClmToggle && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium uppercase tracking-wide opacity-80">
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
              {onExportPDF && (
                <button
                  onClick={onExportPDF}
                  disabled={isExporting}
                  className="w-7 h-7 inline-flex items-center justify-center hover:text-white transition-colors disabled:opacity-50"
                  title="Export PDF"
                >
                  {isExporting ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </button>
              )}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="w-7 h-7 inline-flex items-center justify-center hover:text-white transition-colors"
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
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center hover:text-white transition-colors disabled:opacity-50"
                title="Logout"
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
          </div>

          {/* Row 2 on mobile (export only) / Right side on desktop */}
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            {onExportPDF && (
              <button
                onClick={onExportPDF}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm font-medium bg-white/10 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                style={{ color: 'var(--org-secondary)' }}
              >
                {isExporting ? 'Exporting...' : 'Export PDF'}
              </button>
            )}

            <div className="flex items-center gap-3 text-sm border-l border-white/20 pl-4" style={{ color: 'var(--org-secondary)' }}>
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
                <Link
                  href="/admin"
                  className="hover:text-white transition-colors inline-flex items-center"
                >
                  Admin
                </Link>
              )}
              {hasBookings ? (
                <Link href="/dashboard/bookings" className="hidden lg:inline-flex items-center hover:text-white transition-colors">
                  Stallion Bookings
                </Link>
              ) : (
                <span className="hidden lg:inline-flex items-center">
                  {profile?.organization?.name || profile?.email}
                </span>
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
      </div>
    </header>
  )
}
