'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

interface Stallion {
  id: string
  name: string
}

interface Organization {
  id: string
  name: string
}

interface OrgStallion {
  organization_id: string
  stallion_id: string
}

export default function AdminStallionsPage() {
  const [stallions, setStallions] = useState<Stallion[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgStallions, setOrgStallions] = useState<OrgStallion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStallion, setNewStallion] = useState({ name: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClientComponentClient()

  async function fetchData() {
    const [stallionsRes, orgsRes, orgStallionsRes] = await Promise.all([
      supabase.from('stallions').select('id, name').order('name'),
      supabase.from('organizations').select('id, name').order('name'),
      supabase.from('organization_stallions').select('organization_id, stallion_id'),
    ])

    if (stallionsRes.data) setStallions(stallionsRes.data)
    if (orgsRes.data) setOrganizations(orgsRes.data)
    if (orgStallionsRes.data) setOrgStallions(orgStallionsRes.data)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleAddStallion(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const { error: insertError } = await supabase.from('stallions').insert({
      name: newStallion.name,
      name_normalized: newStallion.name.toLowerCase().trim(),
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setShowAddForm(false)
      setNewStallion({ name: '' })
      fetchData()
    }
    setIsSubmitting(false)
  }

  async function handleToggleOrgStallion(orgId: string, stallionId: string, isAssigned: boolean) {
    if (isAssigned) {
      // Remove assignment
      await supabase
        .from('organization_stallions')
        .delete()
        .eq('organization_id', orgId)
        .eq('stallion_id', stallionId)
    } else {
      // Add assignment
      await supabase
        .from('organization_stallions')
        .insert({ organization_id: orgId, stallion_id: stallionId })
    }
    fetchData()
  }

  function isStallionAssigned(orgId: string, stallionId: string): boolean {
    return orgStallions.some(os => os.organization_id === orgId && os.stallion_id === stallionId)
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stallion Name</label>
              <input
                type="text"
                value={newStallion.name}
                onChange={e => setNewStallion({ name: e.target.value })}
                required
                placeholder="Olympiad"
                className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmitting ? 'Adding...' : 'Add Stallion'}
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

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Stallion Assignments</h3>
        <p className="text-sm text-slate-500 mb-4">
          Check the boxes to assign stallions to organizations. Users in an organization will only see their assigned stallions.
        </p>

        {stallions.length === 0 ? (
          <p className="text-slate-500 py-8 text-center">
            No stallions yet. Add a stallion above to get started.
          </p>
        ) : organizations.length === 0 ? (
          <p className="text-slate-500 py-8 text-center">
            No organizations yet. Create an organization first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="py-3 px-4 text-left font-medium">Stallion</th>
                  {organizations.map(org => (
                    <th key={org.id} className="py-3 px-4 text-center font-medium">
                      {org.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stallions.map(stallion => (
                  <tr key={stallion.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">{stallion.name}</td>
                    {organizations.map(org => {
                      const isAssigned = isStallionAssigned(org.id, stallion.id)
                      return (
                        <td key={org.id} className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => handleToggleOrgStallion(org.id, stallion.id, isAssigned)}
                            className="h-4 w-4 text-primary rounded border-slate-300 focus:ring-primary"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> Don&apos;t forget to add new stallions to the <code className="bg-amber-100 px-1 rounded">TRACKED_STALLIONS</code> environment variable for the email parser to process their emails.
        </p>
      </div>
    </div>
  )
}
