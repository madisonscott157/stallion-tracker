'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { StallionSelector } from './StallionSelector'

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
  isExporting
}: HeaderProps) {
  const { profile, signOut, isAdmin } = useAuth()

  return (
    <header className="sticky top-0 z-10 text-white px-3 sm:px-6 py-1.5 sm:py-3" style={{ backgroundColor: 'var(--org-primary)' }}>
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
            <h1 className="hidden md:block text-lg font-semibold tracking-wide truncate" style={{ color: 'var(--org-secondary)' }}>
              {stallionName.toUpperCase()} <span className="font-normal text-white/70">| Progeny Tracker</span>
            </h1>

            {/* Mobile nav links - all use identical wrapper styling for alignment */}
            <div className="flex sm:hidden items-center gap-1 shrink-0" style={{ color: 'var(--org-secondary)' }}>
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
                className="w-7 h-7 inline-flex items-center justify-center hover:text-white transition-colors"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
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

            <div className="flex items-baseline gap-3 text-sm border-l border-white/20 pl-4" style={{ color: 'var(--org-secondary)' }}>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="hover:text-white transition-colors"
                >
                  Admin
                </Link>
              )}
              <span className="hidden lg:inline">
                {profile?.organization?.name || profile?.email}
              </span>
              <button
                onClick={() => signOut()}
                className="hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
