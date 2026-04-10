'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { formatShortDate } from '@/lib/utils'
import { DashboardHeader } from '@/components/DashboardHeader'
import { Spinner } from '@/components/Spinner'
import type { StallionBookingReport, BookingRow } from '@/lib/supabase'


interface OrgTheme {
  id: string
  name: string
  primary_color: string
  secondary_color: string
  silks_url: string | null
}

export default function BookingsPage() {
  const [reports, setReports] = useState<StallionBookingReport[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [trackedStallions, setTrackedStallions] = useState<Map<string, string>>(new Map())
  const [orgThemes, setOrgThemes] = useState<OrgTheme[]>([])
  const { isAdmin, profile } = useAuth()

  useEffect(() => {
    Promise.all([
      fetch('/api/bookings').then(r => r.ok ? r.json() : null),
      fetch('/api/stallions').then(r => r.ok ? r.json() : []),
    ])
      .then(([bookingsData, stallionsData]) => {
        if (bookingsData?.reports?.length) setReports(bookingsData.reports)
        if (bookingsData?.org_themes) setOrgThemes(bookingsData.org_themes)
        if (Array.isArray(stallionsData)) {
          setTrackedStallions(new Map(stallionsData.map((s: { id: string; name: string }) => [s.name, s.id])))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const report = reports[selectedIdx] ?? null
  const rows: BookingRow[] = report?.data ?? []
  const hasNotes = rows.some(r => r.notes && r.notes.trim() !== '')

  async function handleExportPDF(): Promise<void> {
    if (!report) return

    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    const dateStr = formatShortDate(report.report_date)
    const label = report.label ? `${report.label} - ${dateStr}` : dateStr

    // Match org by the report's organization_id, fall back to user's own org
    const idMatch = orgThemes.find(o => o.id === report.organization_id)
    const fallbackOrg = profile?.organization
    const matchedOrg = idMatch || fallbackOrg

    const primaryColor = matchedOrg?.primary_color || '#0f172a'
    const secondaryColor = matchedOrg?.secondary_color || '#64748b'
    const silksUrl = matchedOrg?.silks_url || null

    // Use absolute positioning + transform to vertically center text,
    // because html2canvas has a known bug with vertical-align on table cells
    const rh = 32
    const cellBase = `position:relative;height:${rh}px;padding:0;border-bottom:1px solid #e2e8f0;`
    const centered = `position:absolute;top:50%;transform:translateY(-50%);`

    const cell = (text: string, align: string, extra: string, bg: string) => {
      const left = align === 'right' ? '' : `left:12px;`
      const right = align === 'right' ? `right:12px;` : ''
      const textAlign = align === 'center' ? `left:0;right:0;text-align:center;` : `${left}${right}`
      return `<td style="${cellBase}background:${bg};"><span style="${centered}${textAlign}white-space:nowrap;${extra}">${text}</span></td>`
    }

    let tableRows = ''
    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
      const notesCell = hasNotes
        ? cell(row.notes || '', 'left', `font-size:13px;color:#475569;white-space:normal;`, bg)
        : ''
      tableRows += `
        <tr>
          ${cell(row.stallion, 'left', `font-size:14px;font-weight:600;color:${primaryColor};`, bg)}
          ${cell(row.farm, 'left', `font-size:13px;color:#475569;`, bg)}
          ${cell(row.stud_fee, 'right', `font-size:13px;color:#475569;`, bg)}
          ${cell(row.repole_interest, 'center', `font-size:13px;color:#475569;`, bg)}
          ${cell(String(row.mares_booked), 'center', `font-size:13px;color:#475569;`, bg)}
          ${cell(String(row.sold_since), 'center', `font-size:13px;color:#475569;`, bg)}
          ${notesCell}
        </tr>`
    })

    const notesHeader = hasNotes
      ? `<th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">Notes</th>`
      : ''

    const silksHtml = silksUrl
      ? `<td style="vertical-align:middle;text-align:right;width:60px;"><img src="${silksUrl}" style="height:45px;width:auto;object-fit:contain;" crossorigin="anonymous" /></td>`
      : ''

    const renderWidth = hasNotes ? 1100 : 900

    const html = `
      <div style="padding:24px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;width:${renderWidth}px;background:#fff;">
        <div style="border-bottom:3px solid ${primaryColor};padding-bottom:10px;margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td style="vertical-align:top;">
              <div style="font-size:22px;font-weight:700;letter-spacing:0.01em;color:${primaryColor};">STALLION BOOKINGS</div>
              <div style="font-size:13px;color:${secondaryColor};margin-top:3px;">${label}</div>
            </td>
            ${silksHtml}
          </tr></table>
        </div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:22%;" />
            <col style="width:18%;" />
            <col style="width:13%;" />
            <col style="width:14%;" />
            <col style="width:14%;" />
            <col style="width:12%;" />
            ${hasNotes ? '<col style="width:auto;" />' : ''}
          </colgroup>
          <thead>
            <tr style="background:${primaryColor};">
              <th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">Stallion</th>
              <th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">Farm</th>
              <th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:right;">Stud Fee</th>
              <th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Equity</th>
              <th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Mares Booked</th>
              <th style="padding:8px 12px;border-bottom:2px solid ${secondaryColor};font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Sold Since</th>
              ${notesHeader}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;'
    wrapper.innerHTML = html
    document.body.appendChild(wrapper)

    const canvas = await html2canvas(wrapper.firstElementChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: renderWidth,
      windowWidth: renderWidth,
    })

    document.body.removeChild(wrapper)

    // Scale to fit on one landscape A4 page
    const pdf = new jsPDF('l', 'mm', 'a4')
    const pageWidth = 297
    const pageHeight = 210
    const margin = 6
    const usableWidth = pageWidth - margin * 2
    const usableHeight = pageHeight - margin * 2

    // Calculate scale to fit both width and height
    const scaleW = usableWidth / (canvas.width / 2) // /2 because scale:2
    const scaleH = usableHeight / (canvas.height / 2)
    const scale = Math.min(scaleW, scaleH)

    const imgW = (canvas.width / 2) * scale
    const imgH = (canvas.height / 2) * scale

    // Center horizontally
    const xOffset = margin + (usableWidth - imgW) / 2

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, margin, imgW, imgH)

    pdf.save(`stallion-bookings-${report.report_date}.pdf`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <DashboardHeader />

      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-baseline gap-3 mb-3 sm:mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-2 sm:mt-3">Stallion Bookings</h1>
          {report && (
            <span className="text-xs text-slate-400">
              {rows.length} stallions &middot; {rows.reduce((sum, r) => { const n = parseInt(String(r.mares_booked), 10); return sum + (isNaN(n) ? 0 : n) }, 0)} mares booked
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-6 w-6 text-slate-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
            No booking reports available
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* Controls bar */}
            <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <select
                  value={selectedIdx}
                  onChange={e => setSelectedIdx(Number(e.target.value))}
                  className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {reports.map((r, i) => (
                    <option key={r.id} value={i}>
                      {formatShortDate(r.report_date)}{r.label ? ` — ${r.label}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1 rounded border border-slate-200 hover:border-slate-300"
                  title="Export PDF"
                >
                  PDF
                </button>
                {isAdmin && (
                  <a
                    href="/admin/bookings"
                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Manage
                  </a>
                )}
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stallion</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Farm</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Stud Fee</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Equity</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Mares Booked</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Sold Since</th>
                    {hasNotes && (
                      <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 card-hover">
                      <td className="px-4 py-2 font-semibold whitespace-nowrap" style={{ color: 'var(--org-primary)' }}>
                        {trackedStallions.has(row.stallion) ? (
                          <Link
                            href={`/?stallion=${encodeURIComponent(trackedStallions.get(row.stallion)!)}`}
                            className="no-underline hover:underline"
                            style={{ color: 'inherit' }}
                          >
                            {row.stallion}
                          </Link>
                        ) : row.stallion}
                      </td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.farm}</td>
                      <td className="px-4 py-2 text-slate-600 text-right whitespace-nowrap">{row.stud_fee}</td>
                      <td className="px-4 py-2 text-slate-600 text-center">{row.repole_interest}</td>
                      <td className="px-4 py-2 text-slate-600 text-center">{row.mares_booked}</td>
                      <td className="px-4 py-2 text-slate-600 text-center">{row.sold_since}</td>
                      {hasNotes && (
                        <td className="px-4 py-2 text-slate-500 text-xs max-w-[200px] truncate">{row.notes}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card layout */}
            <div className="sm:hidden divide-y divide-slate-100">
              {rows.map((row, i) => (
                <div key={i} className="px-4 py-3 card-hover">
                  <div className="flex items-baseline justify-between gap-2">
                    {trackedStallions.has(row.stallion) ? (
                      <Link
                        href={`/?stallion=${encodeURIComponent(trackedStallions.get(row.stallion)!)}`}
                        className="font-semibold text-sm no-underline hover:underline"
                        style={{ color: 'var(--org-primary)' }}
                      >
                        {row.stallion}
                      </Link>
                    ) : (
                      <span className="font-semibold text-sm" style={{ color: 'var(--org-primary)' }}>
                        {row.stallion}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{row.stud_fee}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{row.farm}</span>
                    <span className="text-slate-600">{row.repole_interest}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-slate-400">
                    <span>Mares: {row.mares_booked}</span>
                    <span>Sold: {row.sold_since}</span>
                  </div>
                  {hasNotes && row.notes && (
                    <div className="mt-1 text-xs text-slate-400 truncate">{row.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
