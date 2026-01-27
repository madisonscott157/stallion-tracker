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
    <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between text-sm max-w-5xl mx-auto">
        <span className="text-slate-500 font-medium">{year}</span>
        <div className="flex items-center gap-4 text-slate-700">
          <span>{starters} starters</span>
          <span className="text-slate-300">|</span>
          <span>{winners} winners</span>
          <span className="text-slate-300">|</span>
          <span className="font-medium">{formatMoney(earnings)}</span>
        </div>
      </div>
    </div>
  )
}
