'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Stallion {
  id: string
  name: string
  yob: number | null
  sire: string | null
  dam: string | null
  dam_sire: string | null
  stud_farm: string | null
  stud_fee: string | null
  equineline_url: string | null
  tdn_url: string | null
}

interface Organization {
  id: string
  name: string
}

interface StallionOrg {
  organization_id: string
  stallion_id: string
}

const CURRENCIES = [
  { symbol: '$', label: 'USD' },
  { symbol: '£', label: 'GBP' },
  { symbol: '€', label: 'EUR' },
  { symbol: 'A$', label: 'AUD' },
  { symbol: '¥', label: 'JPY' },
] as const

function parseFee(value: string): { currency: string; amount: string } {
  for (const c of CURRENCIES) {
    if (value.startsWith(c.symbol)) {
      return { currency: c.symbol, amount: value.slice(c.symbol.length) }
    }
  }
  return { currency: '$', amount: value }
}

function formatAmount(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

function buildFee(currency: string, amount: string): string {
  const formatted = formatAmount(amount)
  if (!formatted) return ''
  return `${currency}${formatted}`
}

export default function AdminStallionsPage() {
  const [stallions, setStallions] = useState<Stallion[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [stallionOrgs, setStallionOrgs] = useState<StallionOrg[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingUrls, setEditingUrls] = useState<{ equineline_url: string; tdn_url: string }>({ equineline_url: '', tdn_url: '' })
  const [editFeeCurrency, setEditFeeCurrency] = useState('$')
  const [editFeeAmount, setEditFeeAmount] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [newStallion, setNewStallion] = useState({
    name: '',
    yob: '',
    sire: '',
    dam: '',
    dam_sire: '',
    stud_farm: '',
    stud_fee: '',
    equineline_url: '',
    tdn_url: '',
  })
  const [newFeeCurrency, setNewFeeCurrency] = useState('$')
  const [newFeeAmount, setNewFeeAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    try {
      const [stallionsRes, orgsRes, stallionOrgsRes] = await Promise.all([
        supabase.from('stallions').select('*').order('name'),
        supabase.from('organizations').select('id, name').order('name'),
        supabase.from('organization_stallions').select('*'),
      ])

      if (stallionsRes.error) console.error('Stallions fetch error:', stallionsRes.error)
      if (orgsRes.error) console.error('Orgs fetch error:', orgsRes.error)
      if (stallionOrgsRes.error) console.error('StallionOrgs fetch error:', stallionOrgsRes.error)

      if (stallionsRes.data) setStallions(stallionsRes.data)
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (stallionOrgsRes.data) setStallionOrgs(stallionOrgsRes.data)
    } catch (err) {
      console.error('Fetch error:', err)
      setError('Failed to load data')
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleAddStallion(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    // Only send fields that have values (avoid sending nulls - causes Supabase client to hang)
    const stallionData: Record<string, string | number> = {
      name: newStallion.name,
    }
    if (newStallion.yob) stallionData.yob = parseInt(newStallion.yob)
    if (newStallion.sire) stallionData.sire = newStallion.sire
    if (newStallion.dam) stallionData.dam = newStallion.dam
    if (newStallion.dam_sire) stallionData.dam_sire = newStallion.dam_sire
    if (newStallion.stud_farm) stallionData.stud_farm = newStallion.stud_farm
    const builtFee = buildFee(newFeeCurrency, newFeeAmount)
    if (builtFee) stallionData.stud_fee = builtFee
    if (newStallion.equineline_url) stallionData.equineline_url = newStallion.equineline_url
    if (newStallion.tdn_url) stallionData.tdn_url = newStallion.tdn_url

    const { error: insertError } = await supabase.from('stallions').insert(stallionData)

    setIsSubmitting(false)
    if (insertError) {
      setError(insertError.message)
    } else {
      // Reload the page to show the new stallion
      window.location.reload()
    }
  }

  async function handleUpdateStallion(stallionId: string, updates: Partial<Stallion>) {
    const { error } = await supabase.from('stallions').update(updates).eq('id', stallionId)
    if (error) {
      setError(`Update failed: ${error.message}`)
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
    if (stallion.stud_fee) {
      const parsed = parseFee(stallion.stud_fee)
      setEditFeeCurrency(parsed.currency)
      setEditFeeAmount(parsed.amount)
    } else {
      setEditFeeCurrency('$')
      setEditFeeAmount('')
    }
  }

  async function saveAndCloseEditing(stallionId: string) {
    if (isSaving) return
    setIsSaving(true)
    setError('')

    // Only include fields that have values
    const updates: Record<string, string | number> = {}
    if (editingUrls.equineline_url) updates.equineline_url = editingUrls.equineline_url
    if (editingUrls.tdn_url) updates.tdn_url = editingUrls.tdn_url
    const editBuiltFee = buildFee(editFeeCurrency, editFeeAmount)
    if (editBuiltFee) updates.stud_fee = editBuiltFee

    // If no fields provided, just close without updating
    if (Object.keys(updates).length === 0) {
      setIsSaving(false)
      setEditingId(null)
      return
    }

    const { error } = await supabase.from('stallions').update(updates).eq('id', stallionId)

    setIsSaving(false)
    if (error) {
      setError(`Update failed: ${error.message}`)
    } else {
      setEditingId(null)
      fetchData()
    }
  }

  async function handleDeleteStallion(stallionId: string) {
    if (!confirm('Are you sure you want to delete this stallion? This will also remove all stable links.')) return

    const { error: linkError } = await supabase.from('organization_stallions').delete().eq('stallion_id', stallionId)
    if (linkError) {
      setError(`Delete failed: ${linkError.message}`)
      return
    }
    const { error } = await supabase.from('stallions').delete().eq('id', stallionId)
    if (error) {
      setError(`Delete failed: ${error.message}`)
    } else {
      fetchData()
    }
  }

  async function handleToggleOrg(stallionId: string, orgId: string) {
    const exists = stallionOrgs.some(
      so => so.stallion_id === stallionId && so.organization_id === orgId
    )

    if (exists) {
      const { error } = await supabase
        .from('organization_stallions')
        .delete()
        .eq('stallion_id', stallionId)
        .eq('organization_id', orgId)
      if (error) {
        setError(`Failed to unlink stable: ${error.message}`)
        return
      }
    } else {
      const { error } = await supabase
        .from('organization_stallions')
        .insert({ stallion_id: stallionId, organization_id: orgId })
      if (error) {
        setError(`Failed to link stable: ${error.message}`)
        return
      }
    }
    fetchData()
  }

  function getStallionOrgs(stallionId: string) {
    return stallionOrgs
      .filter(so => so.stallion_id === stallionId)
      .map(so => organizations.find(o => o.id === so.organization_id))
      .filter(Boolean) as Organization[]
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Stallions</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Add Stallion
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Add New Stallion</h3>
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleAddStallion} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={newStallion.name}
                  onChange={e => setNewStallion({ ...newStallion, name: e.target.value })}
                  required
                  placeholder="McKinzie"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Year of Birth</label>
                <input
                  type="number"
                  value={newStallion.yob}
                  onChange={e => setNewStallion({ ...newStallion, yob: e.target.value })}
                  placeholder="2015"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stud Farm</label>
                <input
                  type="text"
                  value={newStallion.stud_farm}
                  onChange={e => setNewStallion({ ...newStallion, stud_farm: e.target.value })}
                  placeholder="Gainesway"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stud Fee</label>
                <div className="flex">
                  <select
                    value={newFeeCurrency}
                    onChange={e => setNewFeeCurrency(e.target.value)}
                    className="px-2 py-2 border border-r-0 border-slate-300 rounded-l-md bg-slate-50 text-sm"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.label} value={c.symbol}>{c.symbol} {c.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newFeeAmount}
                    onChange={e => setNewFeeAmount(formatAmount(e.target.value))}
                    placeholder="25,000"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-r-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sire</label>
                <input
                  type="text"
                  value={newStallion.sire}
                  onChange={e => setNewStallion({ ...newStallion, sire: e.target.value })}
                  placeholder="Street Sense"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dam</label>
                <input
                  type="text"
                  value={newStallion.dam}
                  onChange={e => setNewStallion({ ...newStallion, dam: e.target.value })}
                  placeholder="Runway Model"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dam Sire</label>
                <input
                  type="text"
                  value={newStallion.dam_sire}
                  onChange={e => setNewStallion({ ...newStallion, dam_sire: e.target.value })}
                  placeholder="Petionville"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Equineline URL</label>
                <input
                  type="url"
                  value={newStallion.equineline_url}
                  onChange={e => setNewStallion({ ...newStallion, equineline_url: e.target.value })}
                  placeholder="https://www.equineline.com/..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">TDN Sire List URL</label>
                <input
                  type="url"
                  value={newStallion.tdn_url}
                  onChange={e => setNewStallion({ ...newStallion, tdn_url: e.target.value })}
                  placeholder="https://www.thoroughbreddailynews.com/..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmitting ? 'Creating...' : 'Create Stallion'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {stallions.map(stallion => {
          const linkedOrgs = getStallionOrgs(stallion.id)
          const isEditing = editingId === stallion.id

          return (
            <div key={stallion.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">{stallion.name}</h3>
                    {stallion.yob && (
                      <span className="text-sm text-slate-500">({stallion.yob})</span>
                    )}
                    {stallion.stud_farm && (
                      <span className="text-sm text-slate-400">@ {stallion.stud_farm}</span>
                    )}
                    {stallion.stud_fee && (
                      <span className="text-sm text-slate-400">{stallion.stud_fee}</span>
                    )}
                  </div>
                  {(stallion.sire || stallion.dam) && (
                    <div className="text-sm text-slate-600 mt-1">
                      {stallion.sire && <span>by {stallion.sire}</span>}
                      {stallion.dam && <span> out of {stallion.dam}</span>}
                      {stallion.dam_sire && <span> ({stallion.dam_sire})</span>}
                    </div>
                  )}

                  {/* Stables */}
                  <div className="mt-3">
                    <span className="text-xs font-medium text-slate-500 uppercase">Stables:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {organizations.map(org => {
                        const isLinked = linkedOrgs.some(lo => lo.id === org.id)
                        return (
                          <button
                            key={org.id}
                            onClick={() => handleToggleOrg(stallion.id, org.id)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              isLinked
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {org.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* URLs */}
                  {isEditing ? (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500">Stud Fee</label>
                        <div className="flex">
                          <select
                            value={editFeeCurrency}
                            onChange={e => setEditFeeCurrency(e.target.value)}
                            className="px-2 py-1 text-sm border border-r-0 border-slate-300 rounded-l bg-slate-50"
                          >
                            {CURRENCIES.map(c => (
                              <option key={c.label} value={c.symbol}>{c.symbol} {c.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editFeeAmount}
                            onChange={e => setEditFeeAmount(formatAmount(e.target.value))}
                            placeholder="25,000"
                            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded-r"
                          />
                        </div>
                      </div>
                      <div />
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
            No stallions yet. Add your first stallion above.
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
