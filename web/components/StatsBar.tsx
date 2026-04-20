'use client'

import { formatMoney } from '@/lib/utils'

interface StatsBarProps {
  year: number
  starters: number
  winners: number
  earnings: number
}

export function StatsBar({ year, starters, winners, earnings }: StatsBarProps) {
  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm max-w-5xl mx-auto">
        <span className="text-slate-500 font-medium">{year}</span>
        <span className="text-slate-300 hidden sm:inline">|</span>
        <span className="text-slate-700">{starters} starters</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-700">{winners} winners</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-700 font-medium">{formatMoney(earnings)}</span>
        <span className="text-slate-400 text-xs ml-1">{year} TDN</span>
      </div>
    </div>
  )
}
