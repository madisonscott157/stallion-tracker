'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import type { ExportType, ExportOptions } from '@/lib/pdf-export'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (options: ExportOptions) => void
  isExporting: boolean
}

export function ExportModal({ isOpen, onClose, onExport, isExporting }: ExportModalProps) {
  const { isAdmin, allOrgsWithSilks, profile } = useAuth()
  const [exportType, setExportType] = useState<ExportType>('all')
  const [useDateRange, setUseDateRange] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedSilks, setSelectedSilks] = useState<string>('')

  // User's own organization silks
  const userSilksUrl = profile?.organization?.silks_url || null

  if (!isOpen) return null

  const handleExport = () => {
    // Determine which silks to use
    // Admins can select any org's silks; regular users automatically get their org's silks
    const silksUrl = isAdmin ? (selectedSilks || null) : userSilksUrl

    const options: ExportOptions = {
      type: exportType,
      dateRange: useDateRange ? {
        start: startDate || null,
        end: endDate || null,
      } : undefined,
      silksUrl,
    }
    onExport(options)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const exportOptions: { value: ExportType; label: string; description: string }[] = [
    { value: 'all', label: 'Export All', description: 'Entries and results' },
    { value: 'entries', label: 'Entries Only', description: 'Upcoming races' },
    { value: 'results', label: 'Results Only', description: 'Past race results' },
    { value: 'stakes', label: 'Stakes Only', description: 'Stakes entries and results' },
  ]

  // Get the selected org for preview
  const selectedOrg = allOrgsWithSilks.find(org => org.silks_url === selectedSilks)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Export PDF</h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Export type selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Export Type</label>
            <div className="space-y-2">
              {exportOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                    exportType === option.value
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportType"
                    value={option.value}
                    checked={exportType === option.value}
                    onChange={(e) => setExportType(e.target.value as ExportType)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                    exportType === option.value ? 'border-slate-900' : 'border-slate-300'
                  }`}>
                    {exportType === option.value && (
                      <div className="w-2 h-2 rounded-full bg-slate-900" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{option.label}</div>
                    <div className="text-xs text-slate-500">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Date range toggle */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useDateRange}
                onChange={(e) => setUseDateRange(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              <span className="ml-2 text-sm font-medium text-slate-700">Filter by date range</span>
            </label>
          </div>

          {/* Date range inputs */}
          {useDateRange && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
            </div>
          )}

          {/* Silks selector (admin only) */}
          {isAdmin && allOrgsWithSilks.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-2">Include Silks</label>
              <div className="flex items-center gap-3">
                <select
                  value={selectedSilks}
                  onChange={(e) => setSelectedSilks(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">None</option>
                  {allOrgsWithSilks.map((org) => (
                    <option key={org.id} value={org.silks_url || ''}>
                      {org.name}
                    </option>
                  ))}
                </select>
                {selectedSilks && selectedOrg && (
                  <div className="flex-shrink-0">
                    <img
                      src={selectedSilks}
                      alt={`${selectedOrg.name} silks`}
                      className="h-10 w-auto object-contain border border-slate-200 rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

                  </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 min-w-[100px]"
          >
            {isExporting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              </span>
            ) : (
              'Export'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
