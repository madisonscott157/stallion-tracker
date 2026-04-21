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

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="py-2 px-2 sm:px-3 text-left font-medium">Year</th>
              <th className="py-2 px-2 sm:px-3 text-right font-medium">Stud Fee</th>
              <th className="py-2 px-2 sm:px-3 text-center font-medium">
                <span className="sm:hidden">Mares</span>
                <span className="hidden sm:inline">Mares Bred</span>
              </th>
              <th className="py-2 px-2 sm:px-3 text-left font-medium">
                <span className="sm:hidden">Farm</span>
                <span className="hidden sm:inline">Standing At</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-2 sm:px-3 text-slate-600 tabular-nums">{row.year}</td>
                <td className="py-2 px-2 sm:px-3 text-slate-900 font-medium text-right tabular-nums whitespace-nowrap">
                  {formatStudFee(row.stud_fee, stallionName) ?? '-'}
                </td>
                <td className="py-2 px-2 sm:px-3 text-slate-600 text-center tabular-nums">{row.mares_bred ?? '-'}</td>
                <td className="py-2 px-2 sm:px-3 text-slate-600 truncate max-w-[110px] sm:max-w-none" title={row.standing_at ?? ''}>{row.standing_at ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
