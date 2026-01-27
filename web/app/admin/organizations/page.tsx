'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

interface Organization {
  id: string
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
}

export default function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', primary_color: '#1e293b', secondary_color: '#64748b' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClientComponentClient()

  async function fetchData() {
    const { data } = await supabase.from('organizations').select('*').order('name')
    if (data) setOrganizations(data)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleAddOrg(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const slug = newOrg.slug || newOrg.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

    const { error: insertError } = await supabase.from('organizations').insert({
      name: newOrg.name,
      slug,
      primary_color: newOrg.primary_color,
      secondary_color: newOrg.secondary_color,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setShowAddForm(false)
      setNewOrg({ name: '', slug: '', primary_color: '#1e293b', secondary_color: '#64748b' })
      fetchData()
    }
    setIsSubmitting(false)
  }

  async function handleUpdateOrg(orgId: string, updates: Partial<Organization>) {
    const { error } = await supabase.from('organizations').update(updates).eq('id', orgId)
    if (!error) {
      fetchData()
    }
  }

  async function handleDeleteOrg(orgId: string) {
    if (!confirm('Are you sure you want to delete this organization? All associated users will lose access.')) return

    const { error } = await supabase.from('organizations').delete().eq('id', orgId)
    if (!error) {
      fetchData()
    }
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Organizations</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Add Organization
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Add New Organization</h3>
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleAddOrg} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newOrg.name}
                  onChange={e => setNewOrg({ ...newOrg, name: e.target.value })}
                  required
                  placeholder="LNJ Foxwoods"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Slug (URL-friendly)</label>
                <input
                  type="text"
                  value={newOrg.slug}
                  onChange={e => setNewOrg({ ...newOrg, slug: e.target.value })}
                  placeholder="lnj-foxwoods"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={newOrg.primary_color}
                    onChange={e => setNewOrg({ ...newOrg, primary_color: e.target.value })}
                    className="h-10 w-14 border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    value={newOrg.primary_color}
                    onChange={e => setNewOrg({ ...newOrg, primary_color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Secondary Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={newOrg.secondary_color}
                    onChange={e => setNewOrg({ ...newOrg, secondary_color: e.target.value })}
                    className="h-10 w-14 border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    value={newOrg.secondary_color}
                    onChange={e => setNewOrg({ ...newOrg, secondary_color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmitting ? 'Creating...' : 'Create Organization'}
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

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="py-3 px-4 text-left font-medium">Name</th>
              <th className="py-3 px-4 text-left font-medium">Slug</th>
              <th className="py-3 px-4 text-left font-medium">Colors</th>
              <th className="py-3 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map(org => (
              <tr key={org.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 px-4 text-sm text-slate-900 font-medium">{org.name}</td>
                <td className="py-3 px-4 text-sm text-slate-600">{org.slug}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={org.primary_color}
                      onChange={e => handleUpdateOrg(org.id, { primary_color: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                      title={`Primary: ${org.primary_color}`}
                    />
                    <input
                      type="color"
                      value={org.secondary_color}
                      onChange={e => handleUpdateOrg(org.id, { secondary_color: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                      title={`Secondary: ${org.secondary_color}`}
                    />
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleDeleteOrg(org.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  No organizations yet. Add your first organization above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
