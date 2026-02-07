'use client'

import type { EquinelineStats } from '@/lib/supabase'

interface EquinelineSectionProps {
  stats: EquinelineStats
  currentYear: number
}

export function EquinelineSection({ stats, currentYear }: EquinelineSectionProps) {
  return (
    <>
      {/* Career Summary */}
      <h2 className="section-header mt-8">Career Summary</h2>
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.crops ?? 0}</span> crops</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.foals ?? 0}</span> foals</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.foals_racing_age ?? 0}</span> racing age</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm mt-3">
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.champions ?? 0}</span> champions</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.graded_stakes_winners ?? 0}</span> GSW</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.blacktype_winners ?? 0}</span> BTW</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600"><span className="font-semibold text-slate-900">{stats.blacktype_placers ?? 0}</span> BTP</span>
        </div>
      </div>

      {/* Performance Table */}
      <h2 className="section-header">Performance</h2>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-1">
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
                ${(stats.lifetime_earnings ?? 0).toLocaleString()}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_earnings ?? 0).toLocaleString()}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_2yo_earnings ?? 0).toLocaleString()}
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-sm font-medium text-slate-700">Avg/Starter</td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.lifetime_avg_earnings ?? 0).toLocaleString()}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_avg_earnings ?? 0).toLocaleString()}
              </td>
              <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                ${(stats.current_2yo_avg_earnings ?? 0).toLocaleString()}
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
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="space-y-2">
              {stats.chief_earner_name && (
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{stats.chief_earner_name}</span>
                  <span className="text-slate-600">${(stats.chief_earner_amount ?? 0).toLocaleString()} <span className="text-slate-400">(Lifetime)</span></span>
                </div>
              )}
              {stats.current_top_earner_name && (
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{stats.current_top_earner_name}</span>
                  <span className="text-slate-600">${(stats.current_top_earner_amount ?? 0).toLocaleString()} <span className="text-slate-400">({currentYear})</span></span>
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
