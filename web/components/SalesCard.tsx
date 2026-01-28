'use client'

import { formatMoney } from '@/lib/utils'
import type { SalesStats } from '@/lib/supabase'

interface SalesCardProps {
  sales: SalesStats
}

interface SalesTableProps {
  salesByYear: SalesStats[]
  year: number
}

const SALE_TYPE_LABELS: Record<string, string> = {
  'yearlings': 'Yearlings',
  'weanlings': 'Weanlings',
  '2yo_training': '2YOs',
  'covering_sires': 'Cov. Sires',
}

const SALE_TYPE_ORDER = ['weanlings', 'yearlings', '2yo_training', 'covering_sires']

export function SalesCard({ sales }: SalesCardProps) {
  const saleTypeLabel = SALE_TYPE_LABELS[sales.sale_type] || sales.sale_type

  const sellThrough = sales.through_ring && sales.number_sold
    ? Math.round((sales.number_sold / sales.through_ring) * 100)
    : null

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2 px-4 text-sm font-medium text-slate-700 text-center">{saleTypeLabel}</td>
      <td className="py-2 px-2 text-sm text-slate-600 text-center tabular-nums">
        {sales.number_sold ?? '-'}/{sales.through_ring ?? '-'}
        {sellThrough && <span className="text-slate-400 text-xs ml-1">({sellThrough}%)</span>}
      </td>
      <td className="py-2 px-2 text-sm font-medium text-slate-900 text-center tabular-nums">
        {sales.average_price ? formatMoney(sales.average_price) : '-'}
        {sales.average_rank && <span className="text-slate-400 text-xs ml-1">#{sales.average_rank}</span>}
      </td>
      <td className="py-2 px-2 text-sm text-slate-600 text-center tabular-nums">
        {sales.median_price ? formatMoney(sales.median_price) : '-'}
      </td>
      <td className="py-2 px-4 text-sm text-slate-600 text-center tabular-nums">
        {sales.top_colt_price ? formatMoney(sales.top_colt_price) :
         sales.top_filly_price ? formatMoney(sales.top_filly_price) : '-'}
      </td>
    </tr>
  )
}

export function SalesTable({ salesByYear, year }: SalesTableProps) {
  // Sort by sale type order
  const sorted = [...salesByYear].sort((a, b) => {
    return SALE_TYPE_ORDER.indexOf(a.sale_type) - SALE_TYPE_ORDER.indexOf(b.sale_type)
  })

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
        <span className="font-semibold text-slate-900">{year}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
            <th className="py-2 px-4 text-center font-medium">Type</th>
            <th className="py-2 px-2 text-center font-medium">Sold</th>
            <th className="py-2 px-2 text-center font-medium">Avg</th>
            <th className="py-2 px-2 text-center font-medium">Median</th>
            <th className="py-2 px-4 text-center font-medium">Top</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(stat => (
            <SalesCard key={stat.id} sales={stat} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
