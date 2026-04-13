'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatShortDate } from '@/lib/utils'
import type { StallionBookingReport, BookingRow } from '@/lib/supabase'

interface Organization {
  id: string
  name: string
}

// Maps flexible column header names to BookingRow field names
const COLUMN_ALIASES: Record<string, keyof BookingRow> = {
  'stallion':           'stallion',
  'farm':               'farm',
  'fee':                'stud_fee',
  'stud fee':           'stud_fee',
  'stud_fee':           'stud_fee',
  'equity':             'repole_interest',
  'repole interest':    'repole_interest',
  'repole_interest':    'repole_interest',
  'interest':           'repole_interest',
  'mares':              'mares_booked',
  'mares booked':       'mares_booked',
  'mares_booked':       'mares_booked',
  'sold':               'sold_since',
  'sold since':         'sold_since',
  'sold_since':         'sold_since',
  'notes':              'notes',
}

function parseBookingPaste(text: string): BookingRow[] {
  // Strip BOM if present
  let cleaned = text.startsWith('\uFEFF') ? text.slice(1) : text

  // Split on \r\n or \n to handle Windows and Unix line endings
  const lines = cleaned.split(/\r?\n/)

  const rows: BookingRow[] = []
  // colIndexMap: built from the header row when detected; maps field → column index
  let colIndexMap: Partial<Record<keyof BookingRow, number>> | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue

    const cols = parseTabFields(line)
    const firstCol = cols[0]?.trim().toLowerCase() || ''

    // Detect header row by first column being "stallion"
    if (firstCol === 'stallion') {
      colIndexMap = {}
      cols.forEach((col, idx) => {
        const key = COLUMN_ALIASES[col.trim().toLowerCase()]
        if (key) colIndexMap![key] = idx
      })
      continue
    }

    if (!cols[0]?.trim()) continue

    if (colIndexMap) {
      // Header-aware: columns can be in any order; omitted columns stay blank
      const get = (field: keyof BookingRow): string => {
        const idx = colIndexMap![field]
        return idx !== undefined ? (cols[idx]?.trim() || '') : ''
      }
      rows.push({
        stallion:        get('stallion'),
        farm:            get('farm'),
        stud_fee:        get('stud_fee'),
        repole_interest: get('repole_interest'),
        mares_booked:    parseNumericField(get('mares_booked')),
        sold_since:      parseNumericField(get('sold_since')),
        notes:           get('notes'),
      } satisfies BookingRow)
    } else {
      // Fallback: no header row detected — use legacy fixed-position mapping
      // Expected order: Stallion, Stud Fee, Repole Interest, Mares Booked, Sold Since, Farm, Notes
      rows.push({
        stallion:        cols[0]?.trim() || '',
        stud_fee:        cols[1]?.trim() || '',
        repole_interest: cols[2]?.trim() || '',
        mares_booked:    parseNumericField(cols[3]?.trim() || ''),
        sold_since:      parseNumericField(cols[4]?.trim() || ''),
        farm:            cols[5]?.trim() || '',
        notes:           cols[6]?.trim() || '',
      } satisfies BookingRow)
    }
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

function isBlank(val: string | number | null | undefined): boolean {
  return val === null || val === undefined || String(val).trim() === ''
}

// Read-only table — used for paste previews; hides columns with no data
function BookingDataTable({ data }: { data: BookingRow[] }) {
  const hasCol = {
    farm:            data.some(r => !isBlank(r.farm)),
    stud_fee:        data.some(r => !isBlank(r.stud_fee)),
    repole_interest: data.some(r => !isBlank(r.repole_interest)),
    mares_booked:    data.some(r => !isBlank(r.mares_booked)),
    sold_since:      data.some(r => !isBlank(r.sold_since)),
    notes:           data.some(r => !isBlank(r.notes)),
  }
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-md">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-3 py-1.5 font-semibold text-slate-500">Stallion</th>
            {hasCol.farm            && <th className="px-3 py-1.5 font-semibold text-slate-500">Farm</th>}
            {hasCol.stud_fee        && <th className="px-3 py-1.5 font-semibold text-slate-500 text-right">Fee</th>}
            {hasCol.repole_interest && <th className="px-3 py-1.5 font-semibold text-slate-500 text-center">Equity</th>}
            {hasCol.mares_booked    && <th className="px-3 py-1.5 font-semibold text-slate-500 text-center">Mares</th>}
            {hasCol.sold_since      && <th className="px-3 py-1.5 font-semibold text-slate-500 text-center">Sold</th>}
            {hasCol.notes           && <th className="px-3 py-1.5 font-semibold text-slate-500">Notes</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-medium text-slate-900">{row.stallion}</td>
              {hasCol.farm            && <td className="px-3 py-1.5 text-slate-600">{row.farm}</td>}
              {hasCol.stud_fee        && <td className="px-3 py-1.5 text-slate-600 text-right">{row.stud_fee}</td>}
              {hasCol.repole_interest && <td className="px-3 py-1.5 text-slate-600 text-center">{row.repole_interest}</td>}
              {hasCol.mares_booked    && <td className="px-3 py-1.5 text-slate-600 text-center">{row.mares_booked}</td>}
              {hasCol.sold_since      && <td className="px-3 py-1.5 text-slate-600 text-center">{row.sold_since}</td>}
              {hasCol.notes           && <td className="px-3 py-1.5 text-slate-500">{row.notes}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Editable row type — numeric fields stored as strings for clean input handling
interface EditableRow {
  stallion: string
  farm: string
  stud_fee: string
  repole_interest: string
  mares_booked: string
  sold_since: string
  notes: string
}

function toEditableRows(rows: BookingRow[]): EditableRow[] {
  return rows.map(r => ({
    stallion: String(r.stallion ?? ''),
    farm: String(r.farm ?? ''),
    stud_fee: String(r.stud_fee ?? ''),
    repole_interest: String(r.repole_interest ?? ''),
    mares_booked: String(r.mares_booked ?? ''),
    sold_since: String(r.sold_since ?? ''),
    notes: String(r.notes ?? ''),
  }))
}

function fromEditableRows(rows: EditableRow[]): BookingRow[] {
  return rows.map(r => ({
    stallion: r.stallion,
    farm: r.farm,
    stud_fee: r.stud_fee,
    repole_interest: r.repole_interest,
    mares_booked: parseNumericField(r.mares_booked),
    sold_since: parseNumericField(r.sold_since),
    notes: r.notes,
  }))
}

const EDITABLE_COLS: { key: keyof EditableRow; label: string; align: 'left' | 'right' | 'center'; width: string }[] = [
  { key: 'stallion',         label: 'Stallion', align: 'left',   width: '20%' },
  { key: 'farm',             label: 'Farm',     align: 'left',   width: '17%' },
  { key: 'stud_fee',        label: 'Fee',       align: 'right',  width: '11%' },
  { key: 'repole_interest', label: 'Equity',    align: 'center', width: '10%' },
  { key: 'mares_booked',   label: 'Mares',      align: 'center', width: '9%'  },
  { key: 'sold_since',     label: 'Sold',       align: 'center', width: '9%'  },
  { key: 'notes',           label: 'Notes',     align: 'left',   width: 'auto'},
]

function EditableBookingTable({
  rows,
  onChange,
}: {
  rows: EditableRow[]
  onChange: (rows: EditableRow[]) => void
}) {
  function updateCell(rowIndex: number, field: keyof EditableRow, value: string) {
    const updated = rows.map((row, i) =>
      i === rowIndex ? { ...row, [field]: value } : row
    )
    onChange(updated)
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-md">
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {EDITABLE_COLS.map(c => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-slate-50 text-left border-b border-slate-200">
            {EDITABLE_COLS.map(c => (
              <th
                key={c.key}
                className={`px-2 py-1.5 font-semibold text-slate-500 ${
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
              {EDITABLE_COLS.map(c => (
                <td key={c.key} className="p-0">
                  <input
                    type="text"
                    value={row[c.key]}
                    onChange={e => updateCell(i, c.key, e.target.value)}
                    className={`w-full px-2 py-1.5 bg-transparent focus:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 text-xs ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                    } ${c.key === 'stallion' ? 'font-medium text-slate-900' : 'text-slate-600'}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExpandedReport({
  report,
  organizations,
  onUpdate,
  onDelete,
  onCollapse,
}: {
  report: StallionBookingReport
  organizations: Organization[]
  onUpdate: (id: string, fields: { report_date?: string; label?: string; data?: BookingRow[]; organization_id?: string }) => Promise<boolean>
  onDelete: (id: string) => void
  onCollapse: () => void
}) {
  const [editDate, setEditDate] = useState(report.report_date)
  const [editLabel, setEditLabel] = useState(report.label || '')
  const [editOrgId, setEditOrgId] = useState(report.organization_id)
  const [editableRows, setEditableRows] = useState<EditableRow[]>(() => toEditableRows(report.data))
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

  const rowsModified = JSON.stringify(editableRows) !== JSON.stringify(toEditableRows(report.data))

  const hasChanges =
    editDate !== report.report_date ||
    editLabel !== (report.label || '') ||
    editOrgId !== report.organization_id ||
    replacePreview.length > 0 ||
    rowsModified

  async function handleUpdate() {
    setUpdating(true)
    setLocalError('')

    const fields: { report_date?: string; label?: string; data?: BookingRow[]; organization_id?: string } = {}
    if (editDate !== report.report_date) fields.report_date = editDate
    if (editLabel !== (report.label || '')) fields.label = editLabel.trim()
    if (editOrgId !== report.organization_id) fields.organization_id = editOrgId
    // Paste data takes priority; inline edits used only when no paste override
    if (replacePreview.length > 0) {
      fields.data = replacePreview
    } else if (rowsModified) {
      fields.data = fromEditableRows(editableRows)
    }

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

      {/* Editable org, date, and label */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Organization</label>
          <select
            value={editOrgId}
            onChange={e => setEditOrgId(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
          >
            {organizations.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>
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

      {/* Current data table — inline editable */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-slate-500">
            Current Data ({editableRows.length} stallion{editableRows.length !== 1 ? 's' : ''})
            {rowsModified && !replacePreview.length && (
              <span className="ml-2 text-blue-600">· unsaved changes</span>
            )}
          </div>
          {rowsModified && !replacePreview.length && (
            <button
              onClick={() => setEditableRows(toEditableRows(report.data))}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
        <EditableBookingTable rows={editableRows} onChange={setEditableRows} />
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
          Include a header row — columns can be in any order, and you can omit columns you don&apos;t have. Recognized: Stallion, Farm, Fee, Equity, Mares, Sold, Notes
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
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New report form state
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0])
  const [label, setLabel] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<BookingRow[]>([])

  useEffect(() => {
    fetchReports().finally(() => setIsLoading(false))
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
      const res = await fetch('/api/bookings', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
        // org_themes comes from the server via service-role key — always complete
        if (Array.isArray(data.org_themes) && data.org_themes.length > 0) {
          const orgs: Organization[] = data.org_themes
            .map((o: { id: string; name: string }) => ({ id: o.id, name: o.name }))
            .sort((a: Organization, b: Organization) => a.name.localeCompare(b.name))
          setOrganizations(orgs)
          if (orgs.length === 1) setSelectedOrgId(orgs[0].id)
        }
      } else {
        setError('Failed to load reports')
      }
    } catch {
      setError('Failed to load reports')
    }
  }, [])

  async function handleSave() {
    if (!selectedOrgId) {
      setError('Please select an organization for this report.')
      return
    }
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
          organization_id: selectedOrgId,
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
        await fetchReports()
      }
    } catch {
      setError('Save failed unexpectedly')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(
    id: string,
    fields: { report_date?: string; label?: string; data?: BookingRow[]; organization_id?: string }
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
        await fetchReports()
      }
    } catch {
      setError('Delete failed unexpectedly')
    }
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Organization</label>
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              >
                <option value="">Select organization...</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
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
              Include a header row — columns can be in any order, and you can omit columns you don&apos;t have. Recognized: Stallion, Farm, Fee, Equity, Mares, Sold, Notes
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
            disabled={saving || preview.length === 0 || !selectedOrgId}
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
                organizations={organizations}
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
                      {formatShortDate(report.report_date, true)}
                    </span>
                    {report.label && (
                      <span className="text-sm text-slate-500">{report.label}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {organizations.find(o => o.id === report.organization_id)?.name || 'Unknown org'}
                    {' \u00b7 '}
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
