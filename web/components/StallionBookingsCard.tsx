'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import type { StallionBookingReport, BookingRow } from '@/lib/supabase'

const REPOLE_ORG_NAME = 'Repole Stable'

export function StallionBookingsCard() {
  const { profile, isAdmin } = useAuth()
  const [report, setReport] = useState<StallionBookingReport | null>(null)
  const [loading, setLoading] = useState(true)

  const isRepoleOrg = profile?.organization?.name === REPOLE_ORG_NAME
  const hasAccess = isRepoleOrg || isAdmin

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false)
      return
    }
    fetch('/api/bookings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.reports?.length) setReport(data.reports[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [hasAccess])

  if (!hasAccess || loading || !report) return null

  const rows: BookingRow[] = report.data

  const formatDate = (d: string): string => {
    const [y, m, day] = d.split('-')
    return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`
  }

  const stallionCount = rows.length
  const totalMaresBooked = rows.reduce((sum, row) => {
    const val = typeof row.mares_booked === 'number' ? row.mares_booked : parseInt(String(row.mares_booked), 10)
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  const subtitle = report.label
    ? `${formatDate(report.report_date)} \u2014 ${report.label}`
    : formatDate(report.report_date)

  return (
    <Link
      href="/dashboard/bookings"
      className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition-all card-hover"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-lg" style={{ color: 'var(--org-primary)' }}>Stallion Bookings</h3>
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <div className="text-sm text-slate-500 mb-3">{subtitle}</div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
        <div>
          <span className="font-medium text-slate-700">{stallionCount}</span> stallions
        </div>
        <div>
          <span className="font-medium text-slate-700">{totalMaresBooked}</span> mares booked
        </div>
      </div>
    </Link>
  )
}
