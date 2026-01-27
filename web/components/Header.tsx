'use client'

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
    <header className="sticky top-0 z-10 text-white px-6 py-4" style={{ backgroundColor: 'var(--org-primary)' }}>
      <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
        {/* Left: Title and Stallion Selector */}
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-xl font-semibold tracking-wide truncate" style={{ color: 'var(--org-secondary)' }}>
            {stallionName.toUpperCase()} <span className="font-normal">| Progeny Tracker</span>
          </h1>
          <StallionSelector
            value={stallionId}
            onChange={onStallionChange}
          />
        </div>

        {/* Right: Actions and User Menu */}
        <div className="flex items-center gap-4 shrink-0">
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              disabled={isExporting}
              className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
              style={{ color: 'var(--org-secondary)' }}
            >
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </button>
          )}

          <div className="flex items-baseline gap-3 text-sm border-l border-white/20 pl-4" style={{ color: 'var(--org-secondary)' }}>
            {isAdmin && (
              <a
                href="/admin"
                className="hover:text-white transition-colors"
              >
                Admin
              </a>
            )}
            <span className="hidden sm:inline">
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
    </header>
  )
}
