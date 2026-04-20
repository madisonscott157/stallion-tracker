'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatStudFee } from '@/lib/currency'

interface Stallion {
  id: string
  name: string
  yob: number | null
  sire: string | null
  dam: string | null
  dam_sire: string | null
  stud_farm: string | null
  stud_fee: number | null
  equineline_url: string | null
  tdn_url: string | null
}

function formatAmount(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

export default function AdminStallionsPage() {
  const [stallions, setStallions] = useState<Stallion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingUrls, setEditingUrls] = useState<{ equineline_url: string; tdn_url: string }>({ equineline_url: '', tdn_url: '' })
  const [editStudFarm, setEditStudFarm] = useState('')
  const [editFeeAmount, setEditFeeAmount] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    try {
      const stallionsRes = await supabase.from('stallions').select('*').order('name')

      if (stallionsRes.error) console.error('Stallions fetch error:', stallionsRes.error)
      if (stallionsRes.data) setStallions(stallionsRes.data)
    } catch (err) {
      console.error('Fetch error:', err)
      setError('Failed to load data')
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleUpdateStallion(stallionId: string, updates: Partial<Stallion>) {
    const res = await fetch('/api/admin/stallions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stallionId, ...updates }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(`Update failed: ${data.error}`)
    } else {
      fetchData()
    }
  }

  function startEditing(stallion: Stallion) {
    setEditingId(stallion.id)
    setEditingUrls({
      equineline_url: stallion.equineline_url || '',
      tdn_url: stallion.tdn_url || '',
    })
    setEditFeeAmount(stallion.stud_fee ? Number(stallion.stud_fee).toLocaleString('en-US') : '')
    setEditStudFarm(stallion.stud_farm || '')
  }

  async function saveAndCloseEditing(stallionId: string) {
    if (isSaving) return
    setIsSaving(true)
    setError('')

    const updates: Record<string, string | number | null> = {
      equineline_url: editingUrls.equineline_url || null,
      tdn_url: editingUrls.tdn_url || null,
      stud_farm: editStudFarm.trim() || null,
    }
    const feeDigits = editFeeAmount.replace(/[^0-9]/g, '')
    updates.stud_fee = feeDigits ? parseInt(feeDigits) : null

    try {
      const res = await fetch('/api/admin/stallions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stallionId, ...updates }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(`Update failed: ${data.error}`)
      } else {
        setEditingId(null)
        fetchData()
      }
    } catch (err) {
      setError('Update failed unexpectedly')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteStallion(stallionId: string) {
    if (!confirm('Are you sure you want to delete this stallion? This will also remove all stable links.')) return

    try {
      const res = await fetch('/api/admin/stallions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stallionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(`Delete failed: ${data.error}`)
      } else {
        fetchData()
      }
    } catch {
      setError('Delete failed unexpectedly')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-36 bg-slate-200 rounded" />
          <div className="h-10 w-32 bg-slate-200 rounded" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="h-5 w-48 bg-slate-200 rounded mb-2" />
            <div className="h-4 w-64 bg-slate-100 rounded mb-3" />
            <div className="flex gap-2">
              {[1, 2].map(j => (
                <div key={j} className="h-7 w-20 bg-slate-100 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Stallions</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {stallions.map(stallion => {
          const isEditing = editingId === stallion.id

          return (
            <div key={stallion.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h3 className="text-lg font-semibold text-slate-900">{stallion.name}</h3>
                    {stallion.yob && (
                      <span className="text-sm text-slate-500">({stallion.yob})</span>
                    )}
                    {stallion.stud_farm && (
                      <span className="text-sm text-slate-400">@ {stallion.stud_farm}</span>
                    )}
                    {formatStudFee(stallion.stud_fee, stallion.name) && (
                      <span className="text-sm text-slate-400">{formatStudFee(stallion.stud_fee, stallion.name)}</span>
                    )}
                  </div>
                  {(stallion.sire || stallion.dam) && (
                    <div className="text-sm text-slate-600 mt-1">
                      {stallion.sire && <span>by {stallion.sire}</span>}
                      {stallion.dam && <span> out of {stallion.dam}</span>}
                      {stallion.dam_sire && <span> ({stallion.dam_sire})</span>}
                    </div>
                  )}

                  {/* URLs */}
                  {isEditing ? (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500">Stud Farm</label>
                        <input
                          type="text"
                          value={editStudFarm}
                          onChange={e => setEditStudFarm(e.target.value)}
                          placeholder="Gainesway"
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Stud Fee</label>
                        <div className="flex">
                          <span className="px-2 py-1 text-sm border border-r-0 border-slate-300 rounded-l bg-slate-50 text-slate-500">$</span>
                          <input
                            type="text"
                            value={editFeeAmount}
                            onChange={e => setEditFeeAmount(formatAmount(e.target.value))}
                            placeholder="25,000"
                            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded-r"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Equineline URL</label>
                        <input
                          type="url"
                          value={editingUrls.equineline_url}
                          onChange={e => setEditingUrls({ ...editingUrls, equineline_url: e.target.value })}
                          placeholder="https://www.equineline.com/..."
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">TDN URL</label>
                        <input
                          type="url"
                          value={editingUrls.tdn_url}
                          onChange={e => setEditingUrls({ ...editingUrls, tdn_url: e.target.value })}
                          placeholder="https://www.thoroughbreddailynews.com/..."
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-4 text-xs">
                      {stallion.equineline_url && (
                        <a
                          href={stallion.equineline_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Equineline
                        </a>
                      )}
                      {stallion.tdn_url && (
                        <a
                          href={stallion.tdn_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          TDN
                        </a>
                      )}
                      {!stallion.equineline_url && !stallion.tdn_url && (
                        <span className="text-slate-400">No scraping URLs configured</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => isEditing ? saveAndCloseEditing(stallion.id) : startEditing(stallion)}
                    disabled={isSaving}
                    className="text-sm text-primary hover:text-primary/80 disabled:opacity-50"
                  >
                    {isEditing ? (isSaving ? 'Saving...' : 'Save') : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleDeleteStallion(stallion.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {stallions.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
            No stallions yet. Add stallions from the Users &amp; Stables page.
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h4 className="text-sm font-medium text-amber-800">Environment Variable</h4>
        <p className="text-sm text-amber-700 mt-1">
          Don&apos;t forget to add stallion names to <code className="bg-amber-100 px-1 rounded">TRACKED_STALLIONS</code> in your <code className="bg-amber-100 px-1 rounded">.env</code> file for the email parser to track them.
        </p>
        <p className="text-xs text-amber-600 mt-2">
          Current format: <code className="bg-amber-100 px-1 rounded">TRACKED_STALLIONS=mckinzie,olympiad</code>
        </p>
      </div>
    </div>
  )
}
