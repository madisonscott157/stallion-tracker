'use client'

import type { EquinelineStats } from '@/lib/supabase'

interface EquinelineSectionProps {
  stats: EquinelineStats
  currentYear: number
}

function formatCompactMoney(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`
  }
  return `$${amount.toLocaleString('en-US')}`
}

export function EquinelineSection({ stats, currentYear }: EquinelineSectionProps) {
  return (
    <>
      {/* Career Summary */}
      <h2 className="section-header mt-8">Career Summary</h2>
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-sm">
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.crops ?? 0}</span> crops</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.foals ?? 0}</span> foals</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.foals_racing_age ?? 0}</span> racing age</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 sm:gap-x-4 gap-y-2 text-sm mt-3">
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.champions ?? 0}</span> champ</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.graded_stakes_winners ?? 0}</span> GSW</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.blacktype_winners ?? 0}</span> BTW</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.blacktype_placers ?? 0}</span> BTP</span>
        </div>
      </div>

      {/* Performance - Mobile: Vertical cards */}
      <h2 className="section-header">Performance</h2>

      {/* Mobile layout */}
      <div className="sm:hidden space-y-3 mb-1">
        {/* Lifetime */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500 uppercase font-medium mb-2">Lifetime</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <div className="text-slate-400 text-xs">Starters</div>
              <div className="font-medium">{stats.lifetime_starters ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.lifetime_starters_pct ?? 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">Winners</div>
              <div className="font-medium">{stats.lifetime_winners ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.lifetime_winners_pct ?? 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">BTW</div>
              <div className="font-medium">{stats.lifetime_btw ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.lifetime_btw_pct ?? 0}%</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm mt-2 pt-2 border-t border-slate-100">
            <div className="text-center">
              <div className="text-slate-400 text-xs">Earnings</div>
              <div className="font-medium">{formatCompactMoney(stats.lifetime_earnings ?? 0)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">Avg/Starter</div>
              <div className="font-medium">{formatCompactMoney(stats.lifetime_avg_earnings ?? 0)}</div>
            </div>
          </div>
        </div>

        {/* Current Year */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500 uppercase font-medium mb-2">{currentYear}</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <div className="text-slate-400 text-xs">Starters</div>
              <div className="font-medium">{stats.current_starters ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.current_starters_pct ?? 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">Winners</div>
              <div className="font-medium">{stats.current_winners ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.current_winners_pct ?? 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">BTW</div>
              <div className="font-medium">{stats.current_btw ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.current_btw_pct ?? 0}%</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm mt-2 pt-2 border-t border-slate-100">
            <div className="text-center">
              <div className="text-slate-400 text-xs">Earnings</div>
              <div className="font-medium">{formatCompactMoney(stats.current_earnings ?? 0)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">Avg/Starter</div>
              <div className="font-medium">{formatCompactMoney(stats.current_avg_earnings ?? 0)}</div>
            </div>
          </div>
        </div>

        {/* 2YOs */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500 uppercase font-medium mb-2">2YOs</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <div className="text-slate-400 text-xs">Starters</div>
              <div className="font-medium">{stats.current_2yo_starters ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.current_2yo_starters_pct ?? 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">Winners</div>
              <div className="font-medium">{stats.current_2yo_winners ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.current_2yo_winners_pct ?? 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">BTW</div>
              <div className="font-medium">{stats.current_2yo_btw ?? 0}</div>
              <div className="text-xs text-slate-400">{stats.current_2yo_btw_pct ?? 0}%</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm mt-2 pt-2 border-t border-slate-100">
            <div className="text-center">
              <div className="text-slate-400 text-xs">Earnings</div>
              <div className="font-medium">{formatCompactMoney(stats.current_2yo_earnings ?? 0)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs">Avg/Starter</div>
              <div className="font-medium">{formatCompactMoney(stats.current_2yo_avg_earnings ?? 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-hidden mb-1">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="py-2 px-3 text-left font-medium"></th>
              <th className="py-2 px-3 text-center font-medium">Lifetime</th>
              <th className="py-2 px-3 text-center font-medium">{currentYear}</th>
              <th className="py-2 px-3 text-center font-medium">2YOs</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-2 px-3 text-sm font-medium text-slate-700">Starters</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.lifetime_starters ?? 0} <span className="text-slate-400">({stats.lifetime_starters_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_starters ?? 0} <span className="text-slate-400">({stats.current_starters_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_2yo_starters ?? 0} <span className="text-slate-400">({stats.current_2yo_starters_pct ?? 0}%)</span>
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 px-3 text-sm font-medium text-slate-700">Winners</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.lifetime_winners ?? 0} <span className="text-slate-400">({stats.lifetime_winners_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_winners ?? 0} <span className="text-slate-400">({stats.current_winners_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_2yo_winners ?? 0} <span className="text-slate-400">({stats.current_2yo_winners_pct ?? 0}%)</span>
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 px-3 text-sm font-medium text-slate-700">BTW</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.lifetime_btw ?? 0} <span className="text-slate-400">({stats.lifetime_btw_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_btw ?? 0} <span className="text-slate-400">({stats.current_btw_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_2yo_btw ?? 0} <span className="text-slate-400">({stats.current_2yo_btw_pct ?? 0}%)</span>
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 px-3 text-sm font-medium text-slate-700">Wins</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.lifetime_wins ?? 0} <span className="text-slate-400">({stats.lifetime_wins_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_wins ?? 0} <span className="text-slate-400">({stats.current_wins_pct ?? 0}%)</span>
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                {stats.current_2yo_wins ?? 0} <span className="text-slate-400">({stats.current_2yo_wins_pct ?? 0}%)</span>
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 px-3 text-sm font-medium text-slate-700">Earnings</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.lifetime_earnings ?? 0).toLocaleString('en-US')}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_earnings ?? 0).toLocaleString('en-US')}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_2yo_earnings ?? 0).toLocaleString('en-US')}
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-sm font-medium text-slate-700">Avg/Starter</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.lifetime_avg_earnings ?? 0).toLocaleString('en-US')}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_avg_earnings ?? 0).toLocaleString('en-US')}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_2yo_avg_earnings ?? 0).toLocaleString('en-US')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 text-center mb-6">Percentages are from foals of racing age</p>

      {/* Top Earners */}
      {(stats.chief_earner_name || stats.current_top_earner_name) && (
        <>
          <h2 className="section-header">Top Earners</h2>
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="space-y-2">
              {stats.chief_earner_name && (
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-1">
                  <span className="font-medium text-slate-700">{stats.chief_earner_name}</span>
                  <span className="text-slate-600">${(stats.chief_earner_amount ?? 0).toLocaleString('en-US')} <span className="text-slate-400">(Lifetime)</span></span>
                </div>
              )}
              {stats.current_top_earner_name && (
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-1">
                  <span className="font-medium text-slate-700">{stats.current_top_earner_name}</span>
                  <span className="text-slate-600">${(stats.current_top_earner_amount ?? 0).toLocaleString('en-US')} <span className="text-slate-400">({currentYear})</span></span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <p className="text-xs text-slate-400 mt-4">Source: Equineline</p>
    </>
  )
}
