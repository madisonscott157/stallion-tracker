'use client'

import { useEffect, useState, useCallback } from 'react'
import type { StallionBookingReport, BookingRow } from '@/lib/supabase'

function parseBookingPaste(text: string): BookingRow[] {
  // Strip BOM if present
  let cleaned = text.startsWith('\uFEFF') ? text.slice(1) : text

  // Split on \r\n or \n to handle Windows and Unix line endings
  const lines = cleaned.split(/\r?\n/)

  const rows: BookingRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue

    // Skip header row if first column matches "stallion" case-insensitive
    const firstTab = line.indexOf('\t')
    const firstCol = firstTab >= 0 ? line.slice(0, firstTab).trim() : line.trim()
    if (firstCol.toLowerCase() === 'stallion') continue

    // Parse tab-separated fields, handling quoted fields
    const cols = parseTabFields(line)

    if (!cols[0]?.trim()) continue

    const stallion = cols[0]?.trim() || ''
    const stud_fee = cols[1]?.trim() || ''
    const repole_interest = cols[2]?.trim() || ''
    const mares_booked_raw = cols[3]?.trim() || ''
    const sold_since_raw = cols[4]?.trim() || ''
    const farm = cols[5]?.trim() || ''
    // Handle 6-column paste (no notes) — fill notes as empty string
    const notes = cols[6]?.trim() || ''

    rows.push({
      stallion,
      stud_fee,
      repole_interest,
      mares_booked: parseNumericField(mares_booked_raw),
      sold_since: parseNumericField(sold_since_raw),
      farm,
      notes,
    } satisfies BookingRow)
  }

  return rows
}

/** Parse a tab-separated line, respecting quoted fields (e.g. "field\twith\ttabs") */
function parseTabFields(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === '\t' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/** Parse as number if numeric, keep as string otherwise (handles "n/a", "#VALUE!", etc.) */
function parseNumericField(value: string): number | string {
  if (value === '') return ''
  const num = Number(value)
  if (!isNaN(num) && value !== '') return num
  return value
}

function BookingDataTable({ data }: { data: BookingRow[] }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-md">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-3 py-1.5 font-semibold text-slate-500">Stallion</th>
            <th className="px-3 py-1.5 font-semibold text-slate-500">Farm</th>
            <th className="px-3 py-1.5 font-semibold text-slate-500 text-right">Fee</th>
            <th className="px-3 py-1.5 font-semibold text-slate-500 text-center">Repole</th>
            <th className="px-3 py-1.5 font-semibold text-slate-500 text-center">Mares</th>
            <th className="px-3 py-1.5 font-semibold text-slate-500 text-center">Sold</th>
            <th className="px-3 py-1.5 font-semibold text-slate-500">Notes</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-medium text-slate-900">{row.stallion}</td>
              <td className="px-3 py-1.5 text-slate-600">{row.farm}</td>
              <td className="px-3 py-1.5 text-slate-600 text-right">{row.stud_fee}</td>
              <td className="px-3 py-1.5 text-slate-600 text-center">{row.repole_interest}</td>
              <td className="px-3 py-1.5 text-slate-600 text-center">{row.mares_booked}</td>
              <td className="px-3 py-1.5 text-slate-600 text-center">{row.sold_since}</td>
              <td className="px-3 py-1.5 text-slate-500">{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExpandedReport({
  report,
  onUpdate,
  onDelete,
  onCollapse,
}: {
  report: StallionBookingReport
  onUpdate: (id: string, fields: { report_date?: string; label?: string; data?: BookingRow[] }) => Promise<boolean>
  onDelete: (id: string) => void
  onCollapse: () => void
}) {
  const [editDate, setEditDate] = useState(report.report_date)
  const [editLabel, setEditLabel] = useState(report.label || '')
  const [replacePaste, setReplacePaste] = useState('')
  const [replacePreview, setReplacePreview] = useState<BookingRow[]>([])
  const [updating, setUpdating] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (replacePaste.trim()) {
      setReplacePreview(parseBookingPaste(replacePaste))
    } else {
      setReplacePreview([])
    }
  }, [replacePaste])

  const hasChanges =
    editDate !== report.report_date ||
    editLabel !== (report.label || '') ||
    replacePreview.length > 0

  async function handleUpdate() {
    setUpdating(true)
    setLocalError('')

    const fields: { report_date?: string; label?: string; data?: BookingRow[] } = {}
    if (editDate !== report.report_date) fields.report_date = editDate
    if (editLabel !== (report.label || '')) fields.label = editLabel.trim()
    if (replacePreview.length > 0) fields.data = replacePreview

    const success = await onUpdate(report.id, fields)
    if (success) {
      setReplacePaste('')
      setReplacePreview([])
      onCollapse()
    } else {
      setLocalError('Update failed. Check the error above or try again.')
    }
    setUpdating(false)
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5">
      {/* Header row with collapse button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Edit Report</h3>
        <button
          onClick={onCollapse}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Collapse
        </button>
      </div>

      {localError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {localError}
        </div>
      )}

      {/* Editable date and label */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Report Date</label>
          <input
            type="date"
            value={editDate}
            onChange={e => setEditDate(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Label</label>
          <input
            type="text"
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            placeholder="e.g. Week 12 Update"
            className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
      </div>

      {/* Current data table */}
      <div className="mb-4">
        <div className="text-xs font-medium text-slate-500 mb-2">
          Current Data ({report.data.length} stallion{report.data.length !== 1 ? 's' : ''})
        </div>
        <BookingDataTable data={report.data} />
      </div>

      {/* Replacement paste area */}
      <div className="mb-4">
        <label className="text-xs font-medium text-slate-500">
          Paste Replacement Data (optional -- only if replacing current data)
        </label>
        <textarea
          value={replacePaste}
          onChange={e => setReplacePaste(e.target.value)}
          placeholder="Paste new tab-separated data here to replace existing data..."
          rows={4}
          className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <p className="text-xs text-slate-400 mt-1">
          Columns: Stallion, Stud Fee, Repole Interest, Mares Booked, Sold Since, Farm, Notes (optional)
        </p>
      </div>

      {/* Preview of replacement data */}
      {replacePreview.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-slate-500 mb-2">
            Replacement Preview ({replacePreview.length} stallion{replacePreview.length !== 1 ? 's' : ''})
          </div>
          <BookingDataTable data={replacePreview} />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleUpdate}
          disabled={updating || !hasChanges}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {updating ? 'Updating...' : 'Update Report'}
        </button>
        <button
          onClick={() => onDelete(report.id)}
          className="text-sm text-red-600 hover:text-red-800 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function AdminBookingsPage() {
  const [reports, setReports] = useState<StallionBookingReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New report form state
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0])
  const [label, setLabel] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<BookingRow[]>([])

  useEffect(() => {
    fetchReports()
  }, [])

  useEffect(() => {
    if (pasteText.trim()) {
      setPreview(parseBookingPaste(pasteText))
    } else {
      setPreview([])
    }
  }, [pasteText])

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings')
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      } else {
        setError('Failed to load reports')
      }
    } catch {
      setError('Failed to load reports')
    }
    setIsLoading(false)
  }, [])

  async function handleSave() {
    if (preview.length === 0) {
      setError('No valid data to save. Paste tab-separated data first.')
      return
    }
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_date: reportDate,
          label: label.trim() || undefined,
          data: preview,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(`Save failed: ${result.error}`)
      } else {
        setPasteText('')
        setPreview([])
        setLabel('')
        setShowForm(false)
        fetchReports()
      }
    } catch {
      setError('Save failed unexpectedly')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(
    id: string,
    fields: { report_date?: string; label?: string; data?: BookingRow[] }
  ): Promise<boolean> {
    setError('')

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(`Update failed: ${result.error}`)
        return false
      }
      await fetchReports()
      return true
    } catch {
      setError('Update failed unexpectedly')
      return false
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this booking report?')) return
    setError('')

    try {
      const res = await fetch(`/api/admin/bookings/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(`Delete failed: ${data.error}`)
      } else {
        if (expandedId === id) setExpandedId(null)
        fetchReports()
      }
    } catch {
      setError('Delete failed unexpectedly')
    }
  }

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${parseInt(m)}/${parseInt(day)}/${y}`
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="h-10 w-32 bg-slate-200 rounded" />
        {[1, 2].map(i => (
          <div key={i} className="h-16 bg-slate-200 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Stallion Booking Reports</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Report'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* New Report Form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg border border-slate-200 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Create New Report</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Report Date</label>
              <input
                type="date"
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Week 12 Update"
                className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-slate-500">Paste Data (tab-separated)</label>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"Stallion Name\tStud Fee\tRepole Interest\tMares Booked\tSold Since\tFarm\tNotes\nMcKinzie\t$25,000\t2 shares\t85\t12\tGainesway\tFirst crop 2yo"}
              rows={6}
              className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1">
              Columns: Stallion, Stud Fee, Repole Interest, Mares Booked, Sold Since, Farm, Notes (optional)
            </p>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-2">
                Preview ({preview.length} stallion{preview.length !== 1 ? 's' : ''})
              </div>
              <BookingDataTable data={preview} />
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || preview.length === 0}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Report'}
          </button>
        </div>
      )}

      {/* Existing Reports */}
      <div className="space-y-3">
        {reports.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
            No booking reports yet. Create one above.
          </div>
        ) : (
          reports.map(report =>
            expandedId === report.id ? (
              <ExpandedReport
                key={report.id}
                report={report}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onCollapse={() => setExpandedId(null)}
              />
            ) : (
              <div
                key={report.id}
                onClick={() => setExpandedId(report.id)}
                className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-slate-900">
                      {formatDate(report.report_date)}
                    </span>
                    {report.label && (
                      <span className="text-sm text-slate-500">{report.label}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {report.data.length} stallion{report.data.length !== 1 ? 's' : ''} -- click to expand
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-slate-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            )
          )
        )}
      </div>
    </div>
  )
}
