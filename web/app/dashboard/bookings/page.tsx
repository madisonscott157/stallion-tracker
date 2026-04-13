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

type SortCol = 'stallion' | 'farm' | 'stud_fee' | 'repole_interest' | 'mares_booked' | 'sold_since'
type SortDir = 'asc' | 'desc'

function isBlank(val: string | number | null | undefined): boolean {
  return val === null || val === undefined || String(val).trim() === ''
}

function parseStudFee(val: string | number): number {
  const s = String(val).replace(/[$,]/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? -1 : n
}

function sortRows(rows: BookingRow[], col: SortCol, dir: SortDir): BookingRow[] {
  const sorted = [...rows].sort((a, b) => {
    let av: string | number
    let bv: string | number

    if (col === 'stud_fee') {
      av = parseStudFee(a.stud_fee)
      bv = parseStudFee(b.stud_fee)
    } else if (col === 'mares_booked' || col === 'sold_since') {
      av = typeof a[col] === 'number' ? a[col] as number : parseFloat(String(a[col])) || 0
      bv = typeof b[col] === 'number' ? b[col] as number : parseFloat(String(b[col])) || 0
    } else {
      av = String(a[col] ?? '').toLowerCase()
      bv = String(b[col] ?? '').toLowerCase()
    }

    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export default function BookingsPage() {
  const [reports, setReports] = useState<StallionBookingReport[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [trackedStallions, setTrackedStallions] = useState<Map<string, string>>(new Map())
  const [orgThemes, setOrgThemes] = useState<OrgTheme[]>([])
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
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

  // Reset sort when switching reports
  useEffect(() => { setSortCol(null) }, [selectedIdx])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const report = reports[selectedIdx] ?? null
  const rawRows: BookingRow[] = report?.data ?? []
  const rows = sortCol ? sortRows(rawRows, sortCol, sortDir) : rawRows

  // Compute which columns have at least one non-blank value — omit empty columns entirely
  const hasCol = {
    stallion:        true, // always show
    farm:            rawRows.some(r => !isBlank(r.farm)),
    stud_fee:        rawRows.some(r => !isBlank(r.stud_fee)),
    repole_interest: rawRows.some(r => !isBlank(r.repole_interest)),
    mares_booked:    rawRows.some(r => !isBlank(r.mares_booked)),
    sold_since:      rawRows.some(r => !isBlank(r.sold_since)),
    notes:           rawRows.some(r => !isBlank(r.notes)),
  }

  // Sortable column definitions — filtered to only active columns
  const sortableCols = ([
    { col: 'stallion' as SortCol,        label: 'Stallion',     align: 'left'   as const },
    { col: 'farm' as SortCol,            label: 'Farm',         align: 'left'   as const },
    { col: 'stud_fee' as SortCol,        label: 'Stud Fee',     align: 'right'  as const },
    { col: 'repole_interest' as SortCol, label: 'Equity',       align: 'center' as const },
    { col: 'mares_booked' as SortCol,    label: 'Mares Booked', align: 'center' as const },
    { col: 'sold_since' as SortCol,      label: 'Sold Since',   align: 'center' as const },
  ] as const).filter(({ col }) => hasCol[col])

  async function handleExportPDF(): Promise<void> {
    if (!report || exporting) return
    setExporting(true)

    const hexToRgb = (hex: string): [number, number, number] => {
      const c = hex.replace('#', '')
      const r = parseInt(c.substring(0, 2), 16)
      const g = parseInt(c.substring(2, 4), 16)
      const b = parseInt(c.substring(4, 6), 16)
      return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
    }

    try {
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

      const [pr, pg, pb] = hexToRgb(primaryColor)
      const [sr, sg, sb] = hexToRgb(secondaryColor)

      // Load silks image via canvas so we get a dataURL without CORS issues
      let silksDataUrl: string | null = null
      if (silksUrl) {
        silksDataUrl = await new Promise<string | null>(resolve => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) { resolve(null); return }
            ctx.drawImage(img, 0, 0)
            resolve(canvas.toDataURL('image/png'))
          }
          img.onerror = () => resolve(null)
          img.src = silksUrl
        })
      }

      const pdf = new jsPDF('l', 'mm', 'a4')
      const pageW = 297
      const pageH = 210
      const margin = 8
      const usableW = pageW - margin * 2

      // ── Header section ──
      let y = margin

      const silksDisplayH = 16
      const silksDisplayW = silksDisplayH * 0.75

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(22)
      pdf.setTextColor(pr, pg, pb)
      pdf.text('STALLION BOOKINGS', margin, y + 8)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      pdf.setTextColor(sr, sg, sb)
      pdf.text(label, margin, y + 16)

      if (silksDataUrl) {
        pdf.addImage(silksDataUrl, 'PNG', pageW - margin - silksDisplayW, y, silksDisplayW, silksDisplayH)
      }

      y += 20

      // Divider
      pdf.setDrawColor(pr, pg, pb)
      pdf.setLineWidth(0.6)
      pdf.line(margin, y, pageW - margin, y)
      y += 5

      // ── Column definitions ──
      type ColKey = 'stallion' | 'farm' | 'stud_fee' | 'repole_interest' | 'mares_booked' | 'sold_since' | 'notes'
      type ColDef = { key: ColKey; label: string; align: 'left' | 'right' | 'center'; relWidth: number; w: number }

      const allColDefs: Omit<ColDef, 'w'>[] = [
        { key: 'stallion',        label: 'Stallion',     align: 'left',   relWidth: 28 },
        { key: 'farm',            label: 'Farm',         align: 'left',   relWidth: 20 },
        { key: 'stud_fee',        label: 'Stud Fee',     align: 'right',  relWidth: 20 },
        { key: 'repole_interest', label: 'Equity',       align: 'center', relWidth: 20 },
        { key: 'mares_booked',    label: 'Mares Booked', align: 'center', relWidth: 20 },
        { key: 'sold_since',      label: 'Sold Since',   align: 'center', relWidth: 20 },
        { key: 'notes',           label: 'Notes',        align: 'left',   relWidth: 38 },
      ]

      const activeColDefs = allColDefs.filter(c => hasCol[c.key])
      const totalRelW = activeColDefs.reduce((s, c) => s + c.relWidth, 0)
      const colScale = usableW / totalRelW
      const cols: ColDef[] = activeColDefs.map(c => ({ ...c, w: c.relWidth * colScale }))

      // ── Row height: fit everything on one page ──
      const headerH = 10
      const remainingH = pageH - margin - y - headerH - 2
      const rowH = Math.max(6.5, Math.min(10, remainingH / Math.max(rows.length, 1)))

      // ── Table header row ──
      pdf.setFillColor(pr, pg, pb)
      pdf.rect(margin, y, usableW, headerH, 'F')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)

      let x = margin
      for (const col of cols) {
        const textY = y + headerH / 2
        const lbl = col.label.toUpperCase()
        if (col.align === 'left') {
          pdf.text(lbl, x + 2.5, textY, { baseline: 'middle' })
        } else if (col.align === 'right') {
          pdf.text(lbl, x + col.w - 2.5, textY, { baseline: 'middle', align: 'right' })
        } else {
          pdf.text(lbl, x + col.w / 2, textY, { baseline: 'middle', align: 'center' })
        }
        x += col.w
      }

      y += headerH

      // ── Data rows ──
      rows.forEach((row, i) => {
        if (i % 2 === 1) {
          pdf.setFillColor(248, 250, 252)
          pdf.rect(margin, y, usableW, rowH, 'F')
        }

        // Row divider
        pdf.setDrawColor(226, 232, 240)
        pdf.setLineWidth(0.15)
        pdf.line(margin, y + rowH, margin + usableW, y + rowH)

        let x = margin
        for (const col of cols) {
          let text = ''
          switch (col.key) {
            case 'stallion':        text = row.stallion; break
            case 'farm':            text = row.farm || ''; break
            case 'stud_fee':        text = String(row.stud_fee || ''); break
            case 'repole_interest': text = String(row.repole_interest || ''); break
            case 'mares_booked':    text = String(row.mares_booked ?? ''); break
            case 'sold_since':      text = String(row.sold_since ?? ''); break
            case 'notes':           text = row.notes || ''; break
          }

          const textY = y + rowH / 2
          const maxW = col.w - 5

          if (col.key === 'stallion') {
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(11)
            pdf.setTextColor(pr, pg, pb)
          } else {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10.5)
            pdf.setTextColor(71, 85, 105)
          }

          // Truncate to one line to preserve row height
          const truncated = pdf.splitTextToSize(text, maxW)[0] ?? ''

          if (col.align === 'left') {
            pdf.text(truncated, x + 2.5, textY, { baseline: 'middle' })
          } else if (col.align === 'right') {
            pdf.text(truncated, x + col.w - 2.5, textY, { baseline: 'middle', align: 'right' })
          } else {
            pdf.text(truncated, x + col.w / 2, textY, { baseline: 'middle', align: 'center' })
          }

          x += col.w
        }

        y += rowH
      })

      pdf.save(`stallion-bookings-${report.report_date}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const maresTotal = hasCol.mares_booked
    ? rows.reduce((sum, r) => { const n = parseInt(String(r.mares_booked), 10); return sum + (isNaN(n) ? 0 : n) }, 0)
    : null

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <DashboardHeader />

      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-baseline gap-3 mb-3 sm:mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-2 sm:mt-3">Stallion Bookings</h1>
          {report && (
            <span className="text-xs text-slate-400">
              {rows.length} stallions
              {maresTotal !== null && <> &middot; {maresTotal} mares booked</>}
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
                  disabled={exporting}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1 rounded border border-slate-200 hover:border-slate-300 disabled:opacity-50"
                  title="Export PDF"
                >
                  {exporting ? 'Exporting...' : 'PDF'}
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
                  <tr className="bg-slate-50 text-left select-none">
                    {sortableCols.map(({ col, label, align }) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className={`px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 transition-colors ${
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {align === 'right' && sortCol === col && (
                            <span className="text-slate-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                          {label}
                          {align !== 'right' && sortCol === col && (
                            <span className="text-slate-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                          {sortCol !== col && (
                            <span className="text-slate-300">↕</span>
                          )}
                        </span>
                      </th>
                    ))}
                    {hasCol.notes && (
                      <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 card-hover">
                      {/* Stallion — always shown */}
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
                      {hasCol.farm            && <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.farm}</td>}
                      {hasCol.stud_fee        && <td className="px-4 py-2 text-slate-600 text-right whitespace-nowrap">{row.stud_fee}</td>}
                      {hasCol.repole_interest && <td className="px-4 py-2 text-slate-600 text-center">{row.repole_interest}</td>}
                      {hasCol.mares_booked    && <td className="px-4 py-2 text-slate-600 text-center">{row.mares_booked}</td>}
                      {hasCol.sold_since      && <td className="px-4 py-2 text-slate-600 text-center">{row.sold_since}</td>}
                      {hasCol.notes           && <td className="px-4 py-2 text-slate-500 text-xs max-w-[200px] truncate">{row.notes}</td>}
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
                    {hasCol.stud_fee && <span className="text-xs text-slate-500">{row.stud_fee}</span>}
                  </div>
                  {(hasCol.farm || hasCol.repole_interest) && (
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      {hasCol.farm && <span>{row.farm}</span>}
                      {hasCol.repole_interest && row.repole_interest && (
                        <span className="text-slate-600">Equity: {row.repole_interest}</span>
                      )}
                    </div>
                  )}
                  {(hasCol.mares_booked || hasCol.sold_since) && (
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      {hasCol.mares_booked && <span>Mares: {row.mares_booked}</span>}
                      {hasCol.sold_since   && <span>Sold: {row.sold_since}</span>}
                    </div>
                  )}
                  {hasCol.notes && row.notes && (
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
