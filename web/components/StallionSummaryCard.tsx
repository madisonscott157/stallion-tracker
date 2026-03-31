'use client'

import Link from 'next/link'

interface StallionSummary {
  id: string
  name: string
  stud_farm?: string | null
  stud_fee?: string | null
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
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-lg" style={{ color: 'var(--org-primary)' }}>
          {stallion.name}
        </h3>
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {(stallion.stud_farm || stallion.stud_fee) && (
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-500 mb-3">
          {stallion.stud_farm && <span>{stallion.stud_farm}</span>}
          {stallion.stud_farm && stallion.stud_fee && <span className="text-slate-300">|</span>}
          {stallion.stud_fee && <span>{stallion.stud_fee}</span>}
        </div>
      )}

      {stallion.upcoming_entries > 0 && (
        <div className="mb-3 text-sm">
          <span className="font-medium text-slate-900">{stallion.upcoming_entries}</span>
          <span className="text-slate-500 ml-1">upcoming {stallion.upcoming_entries === 1 ? 'entry' : 'entries'}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
        <div>
          <span className="font-medium text-slate-700">{stallion.ytd_starters}</span> starters
        </div>
        <div>
          <span className="font-medium text-slate-700">{stallion.ytd_winners}</span> winners
        </div>
        <span className="text-slate-400">YTD</span>
      </div>
    </Link>
  )
}
