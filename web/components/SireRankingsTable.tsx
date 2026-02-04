'use client'

import type { SireRanking } from '@/lib/supabase'

interface SireRankingsTableProps {
  rankings: SireRanking[]
}

export function SireRankingsTable({ rankings }: SireRankingsTableProps) {
  if (rankings.length === 0) return null

  return (
    <>
      <h2 className="section-header">Sire List Rankings</h2>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="py-2 px-3 text-center font-medium">Year</th>
              <th className="py-2 px-2 text-center font-medium">List</th>
              <th className="py-2 px-2 text-center font-medium">Rank</th>
              <th className="py-2 px-2 text-center font-medium">Starters</th>
              <th className="py-2 px-2 text-center font-medium">Winners</th>
              <th className="py-2 px-1 text-center font-medium">BTW</th>
              <th className="py-2 px-1 text-center font-medium">BTH</th>
              <th className="py-2 px-1 text-center font-medium">GSW</th>
              <th className="py-2 px-1 text-center font-medium">GSH</th>
              <th className="py-2 px-3 text-center font-medium">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {[...rankings]
              .sort((a, b) => b.year - a.year)
              .map(ranking => {
                const listLabel = ranking.list_type === 'ytd' ? 'YTD' :
                  ranking.list_type === 'freshman' ? '1st Crop' :
                  ranking.list_type === 'second_crop' ? '2nd Crop' :
                  ranking.list_type === 'third_crop' ? '3rd Crop' :
                  ranking.list_type
                return (
                  <tr key={ranking.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.year}
                    </td>
                    <td className="py-2 px-2 text-sm font-medium text-center">
                      {ranking.source_url ? (
                        <a
                          href={ranking.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{ color: 'var(--org-primary)' }}
                        >
                          {listLabel}
                        </a>
                      ) : (
                        <span className="text-slate-700">{listLabel}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-sm text-slate-900 text-center font-semibold">
                      #{ranking.rank}
                    </td>
                    <td className="py-2 px-2 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.starters ?? '-'}
                    </td>
                    <td className="py-2 px-2 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.winners ?? '-'}
                    </td>
                    <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.black_type_winners ?? '-'}
                    </td>
                    <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.black_type_horses ?? '-'}
                    </td>
                    <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.graded_stakes_winners ?? '-'}
                    </td>
                    <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.graded_stakes_horses ?? '-'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                      {ranking.total_earnings ? `$${ranking.total_earnings.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </>
  )
}
