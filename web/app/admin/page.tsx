'use client'

import { useEffect, useState, useRef } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

interface Organization {
  id: string
  name: string
  slug: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  silks_url: string | null
}

interface User {
  id: string
  auth_id: string | null
  email: string
  name: string | null
  role: string
  organization_id: string | null
  show_claiming_races: boolean
}

interface Stallion {
  id: string
  name: string
}

interface StallionOrg {
  organization_id: string
  stallion_id: string
}

export default function AdminUsersAndStablesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stallions, setStallions] = useState<Stallion[]>([])
  const [stallionOrgs, setStallionOrgs] = useState<StallionOrg[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Stable form state
  const [showAddStableForm, setShowAddStableForm] = useState(false)
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', primary_color: '#1e293b', secondary_color: '#64748b' })
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false)
  const [orgError, setOrgError] = useState('')

  // Stallion form state
  const [showAddStallionForm, setShowAddStallionForm] = useState(false)
  const [newStallion, setNewStallion] = useState({ name: '', yob: '', sire: '', dam: '', dam_sire: '', stud_farm: '' })
  const [isSubmittingStallion, setIsSubmittingStallion] = useState(false)
  const [stallionError, setStallionError] = useState('')

  // User form state — tracks which org card has the form open (null = closed)
  const [addingUserToOrg, setAddingUserToOrg] = useState<string | null>(null)
  const [addingUnassignedUser, setAddingUnassignedUser] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', organization_id: '', role: 'user', show_claiming_races: true })
  const [isSubmittingUser, setIsSubmittingUser] = useState(false)
  const [userError, setUserError] = useState('')

  // Silks upload
  const [uploadingOrgId, setUploadingOrgId] = useState<string | null>(null)
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})

  const supabase = createClientComponentClient()
  const { toast } = useToast()

  async function fetchData() {
    try {
      setLoadError(null)
      const [orgsRes, usersRes, stallionsRes, stallionOrgsRes] = await Promise.all([
        supabase.from('organizations').select('*').order('name'),
        supabase.from('users').select('*').order('email'),
        supabase.from('stallions').select('id, name').order('name'),
        supabase.from('organization_stallions').select('*'),
      ])

      if (orgsRes.error) throw new Error(orgsRes.error.message)
      if (usersRes.error) throw new Error(usersRes.error.message)

      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (usersRes.data) setUsers(usersRes.data)
      if (stallionsRes.data) setStallions(stallionsRes.data)
      if (stallionOrgsRes.data) setStallionOrgs(stallionOrgsRes.data)
    } catch (err) {
      console.error('Failed to load admin data:', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // --- Stable handlers ---

  async function handleAddOrg(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmittingOrg(true)
    setOrgError('')

    const slug = newOrg.slug || newOrg.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

    const { error: insertError } = await supabase.from('organizations').insert({
      name: newOrg.name,
      slug,
      primary_color: newOrg.primary_color,
      secondary_color: newOrg.secondary_color,
    })

    if (insertError) {
      setOrgError(insertError.message)
    } else {
      setShowAddStableForm(false)
      setNewOrg({ name: '', slug: '', primary_color: '#1e293b', secondary_color: '#64748b' })
      fetchData()
    }
    setIsSubmittingOrg(false)
  }

  async function handleUpdateOrg(orgId: string, updates: Partial<Organization>) {
    const { error } = await supabase.from('organizations').update(updates).eq('id', orgId)
    if (!error) fetchData()
  }

  async function handleDeleteOrg(orgId: string) {
    if (!confirm('Are you sure you want to delete this stable? All associated users will lose access.')) return
    const { error } = await supabase.from('organizations').delete().eq('id', orgId)
    if (!error) fetchData()
  }

  async function handleAddStallion(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmittingStallion(true)
    setStallionError('')

    const stallionData: Record<string, string | number> = { name: newStallion.name }
    if (newStallion.yob) stallionData.yob = parseInt(newStallion.yob)
    if (newStallion.sire) stallionData.sire = newStallion.sire
    if (newStallion.dam) stallionData.dam = newStallion.dam
    if (newStallion.dam_sire) stallionData.dam_sire = newStallion.dam_sire
    if (newStallion.stud_farm) stallionData.stud_farm = newStallion.stud_farm

    try {
      const res = await fetch('/api/admin/stallions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stallionData),
      })
      const data = await res.json()

      if (!res.ok) {
        setStallionError(data.error)
      } else {
        setShowAddStallionForm(false)
        setNewStallion({ name: '', yob: '', sire: '', dam: '', dam_sire: '', stud_farm: '' })
        toast('Stallion created', 'success')
        fetchData()
      }
    } catch {
      setStallionError('Failed to create stallion')
    } finally {
      setIsSubmittingStallion(false)
    }
  }

  async function handleToggleStallion(orgId: string, stallionId: string) {
    try {
      const res = await fetch('/api/admin/stallions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stallion_id: stallionId, organization_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(`Failed to update stallion link: ${data.error}`, 'error')
        return
      }
      fetchData()
    } catch {
      toast('Failed to update stallion link', 'error')
    }
  }

  async function handleSilksUpload(orgId: string, file: File) {
    setUploadingOrgId(orgId)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${orgId}-silks.${fileExt}`
      const filePath = `silks/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        toast('Failed to upload silks: ' + uploadError.message, 'error')
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('assets')
        .getPublicUrl(filePath)

      await handleUpdateOrg(orgId, { silks_url: publicUrl })
    } finally {
      setUploadingOrgId(null)
    }
  }

  // --- User handlers ---

  function openAddUserForm(orgId: string | null) {
    setAddingUserToOrg(orgId)
    setAddingUnassignedUser(orgId === null)
    setNewUser({ email: '', name: '', password: '', organization_id: orgId || '', role: 'user', show_claiming_races: true })
    setUserError('')
  }

  function closeAddUserForm() {
    setAddingUserToOrg(null)
    setAddingUnassignedUser(false)
    setUserError('')
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmittingUser(true)
    setUserError('')

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create user')

      closeAddUserForm()
      fetchData()
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setIsSubmittingUser(false)
    }
  }

  async function handleUpdateUser(userId: string, updates: Partial<User>) {
    const { error } = await supabase.from('users').update(updates).eq('id', userId)
    if (!error) fetchData()
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (!error) fetchData()
  }

  // --- Derived data ---

  function usersForOrg(orgId: string): User[] {
    return users.filter(u => u.organization_id === orgId)
  }

  const unassignedUsers = users.filter(u => !u.organization_id)

  // --- Inline add user form ---

  function renderAddUserForm(orgId: string | null) {
    return (
      <div className="mt-3 p-4 bg-slate-50 rounded-md border border-slate-200">
        <h4 className="text-sm font-medium text-slate-700 mb-3">Add New User</h4>
        {userError && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{userError}</div>
        )}
        <form onSubmit={handleAddUser} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                required
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <input
                type="text"
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input
                type="text"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                required
                minLength={6}
                placeholder="Min 6 characters"
                autoComplete="off"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 sm:gap-4">
              <div className="w-full sm:flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer sm:pb-1.5">
                <input
                  type="checkbox"
                  checked={newUser.show_claiming_races}
                  onChange={e => setNewUser({ ...newUser, show_claiming_races: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300"
                />
                Claiming
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmittingUser}
              className="px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-xs font-medium"
            >
              {isSubmittingUser ? 'Creating...' : 'Create User'}
            </button>
            <button
              type="button"
              onClick={closeAddUserForm}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    )
  }

  // --- User row within a stable card ---

  function renderUserRow(user: User) {
    return (
      <div key={user.id} className="py-2 px-3 text-sm border-t border-slate-100 first:border-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-900 min-w-0 truncate flex-1 basis-full sm:basis-auto">{user.email}</span>
          <span className="text-slate-500 min-w-0 truncate hidden sm:inline w-32">{user.name || '-'}</span>
          <select
            value={user.role}
            onChange={e => handleUpdateUser(user.id, { role: e.target.value })}
            className="text-xs border border-slate-200 rounded px-2 py-1.5 min-h-[36px]"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer min-h-[36px]" title="Show claiming races">
            <input
              type="checkbox"
              checked={user.show_claiming_races}
              onChange={e => handleUpdateUser(user.id, { show_claiming_races: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300"
            />
            CLM
          </label>
          <button
            onClick={() => handleDeleteUser(user.id)}
            className="text-xs text-red-600 hover:text-red-800 shrink-0 min-h-[36px] px-2"
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-10 w-28 bg-slate-200 rounded" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="h-5 w-40 bg-slate-200 rounded mb-3" />
            <div className="h-4 w-64 bg-slate-100 rounded mb-2" />
            <div className="h-4 w-48 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{loadError}</p>
        <button
          onClick={() => { setIsLoading(true); fetchData() }}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Users & Stables</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddStallionForm(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            Add Stallion
          </button>
          <button
            onClick={() => setShowAddStableForm(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Add Stable
          </button>
        </div>
      </div>

      {/* Add Stallion form */}
      {showAddStallionForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Add New Stallion</h3>
          {stallionError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{stallionError}</div>
          )}
          <form onSubmit={handleAddStallion} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmittingStallion}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmittingStallion ? 'Creating...' : 'Create Stallion'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddStallionForm(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Stable form */}
      {showAddStableForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Add New Stable</h3>
          {orgError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{orgError}</div>
          )}
          <form onSubmit={handleAddOrg} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={newOrg.primary_color}
                    onChange={e => setNewOrg({ ...newOrg, primary_color: e.target.value })}
                    className="h-10 w-16 border border-slate-300 rounded cursor-pointer"
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
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={newOrg.secondary_color}
                    onChange={e => setNewOrg({ ...newOrg, secondary_color: e.target.value })}
                    className="h-10 w-16 border border-slate-300 rounded cursor-pointer"
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
                disabled={isSubmittingOrg}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmittingOrg ? 'Creating...' : 'Create Stable'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddStableForm(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stable cards with inline users */}
      <div className="space-y-4">
        {organizations.map(org => {
          const orgUsers = usersForOrg(org.id)
          return (
            <div key={org.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Stable header */}
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-slate-900 truncate">{org.name}</h3>
                      <span className="text-xs text-slate-400 hidden sm:inline">{org.slug}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteOrg(org.id)}
                    className="text-xs text-red-600 hover:text-red-800 shrink-0"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {/* Colors */}
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="color"
                      value={org.primary_color}
                      onChange={e => handleUpdateOrg(org.id, { primary_color: e.target.value })}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                      title={`Primary: ${org.primary_color}`}
                    />
                    <input
                      type="color"
                      value={org.secondary_color}
                      onChange={e => handleUpdateOrg(org.id, { secondary_color: e.target.value })}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                      title={`Secondary: ${org.secondary_color}`}
                    />
                  </div>
                  {/* Silks */}
                  <div className="flex items-center gap-2">
                    {org.silks_url ? (
                      <img
                        src={org.silks_url}
                        alt={`${org.name} silks`}
                        className="w-8 h-8 object-contain rounded border border-slate-200"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded border border-dashed border-slate-300 bg-slate-50" />
                    )}
                    <input
                      type="file"
                      ref={el => { fileInputRefs.current[org.id] = el }}
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleSilksUpload(org.id, file)
                      }}
                    />
                    <button
                      onClick={() => fileInputRefs.current[org.id]?.click()}
                      disabled={uploadingOrgId === org.id}
                      className="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      {uploadingOrgId === org.id ? 'Uploading...' : org.silks_url ? 'Change' : 'Upload'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Stallions linked to this stable */}
              {(() => {
                const linkedStallions = stallions.filter(s =>
                  stallionOrgs.some(so => so.stallion_id === s.id && so.organization_id === org.id)
                )
                const unlinkedStallions = stallions.filter(s =>
                  !stallionOrgs.some(so => so.stallion_id === s.id && so.organization_id === org.id)
                )
                return (
                  <div className="px-4 sm:px-5 py-2 border-b border-slate-100">
                    <span className="text-xs font-medium text-slate-500 uppercase">Stallions</span>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {linkedStallions.map(stallion => (
                        <span
                          key={stallion.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-primary text-white"
                        >
                          {stallion.name}
                          <button
                            onClick={() => handleToggleStallion(org.id, stallion.id)}
                            className="hover:text-white/70 ml-0.5 w-5 h-5 inline-flex items-center justify-center"
                            title={`Remove ${stallion.name}`}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      {unlinkedStallions.length > 0 && (
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) handleToggleStallion(org.id, e.target.value)
                          }}
                          className="text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-500"
                        >
                          <option value="">+ Add stallion</option>
                          {unlinkedStallions.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                      {linkedStallions.length === 0 && unlinkedStallions.length === 0 && (
                        <span className="text-xs text-slate-400">No stallions created yet</span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Users within this stable */}
              <div className="px-2 py-1">
                {orgUsers.length === 0 && addingUserToOrg !== org.id && (
                  <p className="text-xs text-slate-400 py-2 px-3">No users in this stable</p>
                )}
                {orgUsers.map(renderUserRow)}

                {addingUserToOrg === org.id ? (
                  <div className="px-1 pb-2">
                    {renderAddUserForm(org.id)}
                  </div>
                ) : (
                  <button
                    onClick={() => openAddUserForm(org.id)}
                    className="text-xs text-primary hover:text-primary/80 py-2 px-3"
                  >
                    + Add User
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {organizations.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
            No stables yet. Add your first stable above.
          </div>
        )}
      </div>

      {/* Unassigned users */}
      {(unassignedUsers.length > 0 || addingUnassignedUser) && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-slate-900 mb-3">Unassigned Users</h3>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-2 py-1">
              {unassignedUsers.map(user => (
                <div key={user.id} className="py-2 px-3 text-sm border-t border-slate-100 first:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 min-w-0 truncate flex-1">{user.email}</span>
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value) handleUpdateUser(user.id, { organization_id: e.target.value })
                      }}
                      className="text-xs border border-slate-200 rounded px-1.5 py-1"
                    >
                      <option value="">Assign...</option>
                      {organizations.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                    <select
                      value={user.role}
                      onChange={e => handleUpdateUser(user.id, { role: e.target.value })}
                      className="text-xs border border-slate-200 rounded px-1.5 py-1"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-xs text-red-600 hover:text-red-800 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {addingUnassignedUser && (
                <div className="px-1 pb-2">
                  {renderAddUserForm(null)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
