'use client'

import type { SireRanking } from '@/lib/supabase'
import { getStallionRegion, type StallionRegion } from '@/lib/regions'

interface SireRankingsTableProps {
  rankings: SireRanking[]
  stallionName?: string
}

function getListLabel(listType: string, region: StallionRegion = 'na'): string {
  const base =
    listType === 'ytd' ? 'YTD' :
    listType === 'freshman' ? '1st Crop' :
    listType === 'second_crop' ? '2nd Crop' :
    listType === 'third_crop' ? '3rd Crop' :
    listType === 'fourth_crop' ? '4th Crop' :
    listType === 'general' ? 'Leading Sires' :
    listType
  const suffix = region === 'eu' ? ' - EU' : region === 'fr' ? ' - FR' : ''
  return `${base}${suffix}`
}

export function SireRankingsTable({ rankings, stallionName }: SireRankingsTableProps) {
  const region = getStallionRegion(stallionName)
  if (rankings.length === 0) return null

  const sortedRankings = [...rankings].sort((a, b) => b.year - a.year)

  return (
    <>
      <h2 className="section-header">Sire List Rankings</h2>

      {/* Mobile: Card layout */}
      <div className="sm:hidden space-y-3">
        {sortedRankings.map(ranking => {
          const listLabel = getListLabel(ranking.list_type, region)
          return (
            <div key={ranking.id} className="bg-white rounded-lg border border-slate-200 p-3 card-hover">
              <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-600">{ranking.year}</span>
                  {ranking.source_url ? (
                    <a
                      href={ranking.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline"
                      style={{ color: 'var(--org-primary)' }}
                    >
                      {listLabel}
                    </a>
                  ) : (
                    <span className="text-sm text-slate-700">{listLabel}</span>
                  )}
                </div>
                <span className="text-lg font-bold text-slate-900">{ranking.rank != null ? `#${ranking.rank}` : '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-center">
                  <div className="text-slate-400 text-xs">Starters</div>
                  <div className="font-medium text-slate-700">{ranking.starters ?? '-'}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-xs">Winners</div>
                  <div className="font-medium text-slate-700">{ranking.winners ?? '-'}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400 text-xs">Earnings</div>
                  <div className="font-medium text-slate-700">{ranking.total_earnings ? `$${(ranking.total_earnings / 1000).toFixed(0)}K` : '-'}</div>
                </div>
              </div>
              {(ranking.black_type_winners || ranking.graded_stakes_winners) && (
                <div className="grid grid-cols-4 gap-2 text-sm mt-2 pt-2 border-t border-slate-100">
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">BTW</div>
                    <div className="text-slate-600">{ranking.black_type_winners ?? '-'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">BTH</div>
                    <div className="text-slate-600">{ranking.black_type_horses ?? '-'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">GSW</div>
                    <div className="text-slate-600">{ranking.graded_stakes_winners ?? '-'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">GSH</div>
                    <div className="text-slate-600">{ranking.graded_stakes_horses ?? '-'}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-x-auto">
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
            {sortedRankings.map(ranking => {
              const listLabel = getListLabel(ranking.list_type, region)
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
                    {ranking.rank != null ? `#${ranking.rank}` : '-'}
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
                    {ranking.total_earnings ? `$${ranking.total_earnings.toLocaleString('en-US')}` : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-1 mb-6">Source: TDN Sire Lists</p>
    </>
  )
}
