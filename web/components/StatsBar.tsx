'use client'

import { formatMoney } from '@/lib/utils'

interface StatsBarProps {
  year: number
  starters: number
  winners: number
  winPct: number
  earnings: number
}

export function StatsBar({ year, starters, winners, winPct, earnings }: StatsBarProps) {
  return (
    <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500 font-medium">{year}</span>
        <div className="flex items-center gap-4 text-slate-700">
          <span>{starters} starts</span>
          <span className="text-slate-300">|</span>
          <span>{winners} wins</span>
          <span className="text-slate-300">|</span>
          <span>{winPct.toFixed(1)}%</span>
          <span className="text-slate-300">|</span>
          <span className="font-medium">{formatMoney(earnings)}</span>
        </div>
      </div>
    </div>
  )
}
