'use client'

import Link from 'next/link'

interface StallionSummary {
  id: string
  name: string
  upcoming_entries: number
  ytd_starters: number
  ytd_winners: number
  ytd_earnings: number
}

interface StallionSummaryCardProps {
  stallion: StallionSummary
}

export function StallionSummaryCard({ stallion }: StallionSummaryCardProps) {
  return (
    <Link
      href={`/?stallion=${stallion.id}`}
      className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg" style={{ color: 'var(--org-primary)' }}>
          {stallion.name}
        </h3>
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {stallion.upcoming_entries > 0 && (
        <div className="mb-3 text-sm">
          <span className="font-medium text-slate-900">{stallion.upcoming_entries}</span>
          <span className="text-slate-500 ml-1">upcoming {stallion.upcoming_entries === 1 ? 'entry' : 'entries'}</span>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <div>
          <span className="font-medium text-slate-700">{stallion.ytd_starters}</span> starters
        </div>
        <div>
          <span className="font-medium text-slate-700">{stallion.ytd_winners}</span> winners
        </div>
        <div>
          <span className="font-medium text-slate-700">${stallion.ytd_earnings.toLocaleString()}</span>
        </div>
      </div>
    </Link>
  )
}
