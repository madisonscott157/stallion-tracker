'use client'

import Link from 'next/link'
import { formatStudFee } from '@/lib/currency'
import { formatMoney } from '@/lib/utils'

interface StallionSummary {
  id: string
  name: string
  stud_farm?: string | null
  stud_fee?: number | null
  upcoming_entries: number
  ytd_starters: number
  ytd_winners: number
  ytd_earnings: number
  tdn_year?: number | null
  tdn_starters?: number | null
  tdn_winners?: number | null
  tdn_earnings?: number | null
}

interface StallionSummaryCardProps {
  stallion: StallionSummary
}

export function StallionSummaryCard({ stallion }: StallionSummaryCardProps) {
  const feeDisplay = formatStudFee(stallion.stud_fee, stallion.name)
  return (
    <Link
      href={`/?stallion=${stallion.id}`}
      className="block bg-white border border-slate-200 rounded-lg px-3 py-2.5 sm:p-4 hover:border-slate-300 hover:shadow-sm transition-all card-hover"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base sm:text-lg" style={{ color: 'var(--org-primary)' }}>
          {stallion.name}
        </h3>
        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {(stallion.stud_farm || feeDisplay) && (
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-500 mb-1 sm:mb-2">
          {stallion.stud_farm && <span>{stallion.stud_farm}</span>}
          {stallion.stud_farm && feeDisplay && <span className="text-slate-300">|</span>}
          {feeDisplay && <span>{feeDisplay}</span>}
        </div>
      )}

      {stallion.upcoming_entries > 0 && (
        <div className="mb-1 sm:mb-2 text-sm">
          <span className="font-medium text-slate-900">{stallion.upcoming_entries}</span>
          <span className="text-slate-500 ml-1">upcoming {stallion.upcoming_entries === 1 ? 'entry' : 'entries'}</span>
        </div>
      )}

      {stallion.tdn_year != null && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-slate-500">
          {stallion.tdn_starters != null && (
            <div>
              <span className="font-medium text-slate-700">{stallion.tdn_starters}</span> starters
            </div>
          )}
          {stallion.tdn_winners != null && (
            <div>
              <span className="font-medium text-slate-700">{stallion.tdn_winners}</span> winners
            </div>
          )}
          {stallion.tdn_earnings != null && stallion.tdn_earnings > 0 && (
            <div>
              <span className="font-medium text-slate-700">{formatMoney(stallion.tdn_earnings)}</span>
            </div>
          )}
        </div>
      )}
    </Link>
  )
}
