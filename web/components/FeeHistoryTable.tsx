'use client'

import type { StallionFeeHistory } from '@/lib/supabase'
import { formatStudFee } from '@/lib/currency'

interface FeeHistoryTableProps {
  history: StallionFeeHistory[]
  stallionName: string
}

export function FeeHistoryTable({ history, stallionName }: FeeHistoryTableProps) {
  if (history.length === 0) return null

  const sorted = [...history].sort((a, b) => b.year - a.year)

  return (
    <>
      <h2 className="section-header">History</h2>

      {/* Mobile: Card layout */}
      <div className="sm:hidden space-y-3">
        {sorted.map(row => (
          <div key={row.id} className="bg-white rounded-lg border border-slate-200 p-3 card-hover">
            <div className="flex items-baseline justify-between mb-2 gap-2">
              <span className="text-sm font-medium text-slate-600">{row.year}</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {formatStudFee(row.stud_fee, stallionName) ?? '-'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-slate-400 text-xs">Mares Bred</div>
                <div className="font-medium text-slate-700 tabular-nums">{row.mares_bred ?? '-'}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Standing At</div>
                <div className="font-medium text-slate-700 truncate">{row.standing_at ?? '-'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="py-2 px-3 text-left font-medium">Year</th>
              <th className="py-2 px-3 text-right font-medium">Stud Fee</th>
              <th className="py-2 px-3 text-center font-medium">Mares Bred</th>
              <th className="py-2 px-3 text-left font-medium">Standing At</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-3 text-sm text-slate-600 tabular-nums">{row.year}</td>
                <td className="py-2 px-3 text-sm text-slate-900 font-medium text-right tabular-nums">
                  {formatStudFee(row.stud_fee, stallionName) ?? '-'}
                </td>
                <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">{row.mares_bred ?? '-'}</td>
                <td className="py-2 px-3 text-sm text-slate-600">{row.standing_at ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
