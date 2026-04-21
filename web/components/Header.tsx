'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { StallionSelector } from './StallionSelector'
import { Spinner } from './Spinner'

interface HeaderProps {
  stallionName: string
  stallionId: string | null
  onStallionChange: (id: string, name: string) => void
  onExportPDF?: () => void
  isExporting?: boolean
}

export function Header({
  stallionName,
  stallionId,
  onStallionChange,
  onExportPDF,
  isExporting,
}: HeaderProps) {
  const { profile, signOut, isSigningOut, isAdmin, hasBookings } = useAuth()

  return (
    <header className="sticky top-0 z-10 text-white pl-3 pr-1 sm:px-6 sm:py-3" style={{ backgroundColor: 'var(--org-primary)', paddingTop: 'max(0.125rem, env(safe-area-inset-top))' }}>
      <div className="max-w-5xl mx-auto">

        {/* ── Mobile: single compact row, three zones ── */}
        <div className="flex sm:hidden items-center gap-1 pb-0.5" style={{ color: 'var(--org-secondary)' }}>
          {/* Zone 1: back arrow — fixed left */}
          <Link
            href="/dashboard"
            className="shrink-0 flex items-center p-0.5 hover:text-white transition-colors"
            title="Back to Dashboard"
            aria-label="Back to Dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          {/* Zone 2: stallion name — takes all remaining space, centered */}
          <div className="flex-1 flex items-center justify-center min-w-0">
            <StallionSelector value={stallionId} onChange={onStallionChange} displayName={stallionName} />
          </div>

          {/* Zone 3: icons — fixed right, all icon-only */}
          <div className="flex items-center gap-0 shrink-0">
            {hasBookings && (
              <Link
                href="/dashboard/bookings"
                className="inline-flex items-center p-0.5 opacity-80 hover:opacity-100 hover:text-white transition-opacity"
                title="Stallion Bookings"
                aria-label="Stallion Bookings"
              >
                {/* Bookmark icon */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </Link>
            )}
            {onExportPDF && (
              <button
                onClick={onExportPDF}
                disabled={isExporting}
                className="inline-flex items-center p-0.5 hover:text-white transition-colors disabled:opacity-50"
                title="Export PDF"
              >
                {isExporting ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
            )}
            {isAdmin && (
              <Link href="/admin" className="inline-flex items-center p-0.5 hover:text-white transition-colors" title="Admin" aria-label="Admin settings">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            )}
            <button
              onClick={() => signOut()}
              disabled={isSigningOut}
              className="p-0.5 hover:text-white transition-colors disabled:opacity-50"
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

        {/* ── Desktop layout: single row ── */}
        <div className="hidden sm:flex sm:items-baseline sm:justify-between sm:gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center hover:text-white transition-colors shrink-0"
              style={{ color: 'var(--org-secondary)' }}
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
            >
              <svg className="w-5 h-5 translate-y-[2px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <StallionSelector value={stallionId} onChange={onStallionChange} displayName={stallionName} />
            <span className="hidden lg:inline font-normal text-white/70 text-lg">| Stallion Tracker</span>
          </div>

          {/* Desktop right side */}
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
              {isAdmin && (
                <Link
                  href="/admin"
                  className="hover:text-white transition-colors inline-flex items-center"
                >
                  Admin
                </Link>
              )}
              {hasBookings ? (
                <Link href="/dashboard/bookings" className="inline-flex items-center hover:text-white transition-colors">
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
