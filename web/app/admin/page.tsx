'use client'

import { useEffect, useState, useRef } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

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

export default function AdminUsersAndStablesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Stable form state
  const [showAddStableForm, setShowAddStableForm] = useState(false)
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', primary_color: '#1e293b', secondary_color: '#64748b' })
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false)
  const [orgError, setOrgError] = useState('')

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

  async function fetchData() {
    const [orgsRes, usersRes] = await Promise.all([
      supabase.from('organizations').select('*').order('name'),
      supabase.from('users').select('*').order('email'),
    ])

    if (orgsRes.data) setOrganizations(orgsRes.data)
    if (usersRes.data) setUsers(usersRes.data)
    setIsLoading(false)
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
        alert('Failed to upload silks: ' + uploadError.message)
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                type="password"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                required
                minLength={6}
                placeholder="Min 6 characters"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer pb-1.5">
                <input
                  type="checkbox"
                  checked={newUser.show_claiming_races}
                  onChange={e => setNewUser({ ...newUser, show_claiming_races: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-slate-300"
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
        <div className="flex items-center gap-2">
          <span className="text-slate-900 min-w-0 truncate flex-1">{user.email}</span>
          <span className="text-slate-500 min-w-0 truncate hidden sm:inline w-32">{user.name || '-'}</span>
          <select
            value={user.role}
            onChange={e => handleUpdateUser(user.id, { role: e.target.value })}
            className="text-xs border border-slate-200 rounded px-1.5 py-1"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <label className="hidden sm:flex items-center gap-1 text-xs text-slate-500 cursor-pointer" title="Show claiming races">
            <input
              type="checkbox"
              checked={user.show_claiming_races}
              onChange={e => handleUpdateUser(user.id, { show_claiming_races: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-slate-300"
            />
            CLM
          </label>
          <button
            onClick={() => handleDeleteUser(user.id)}
            className="text-xs text-red-600 hover:text-red-800 shrink-0"
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Users & Stables</h2>
        <button
          onClick={() => setShowAddStableForm(true)}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Add Stable
        </button>
      </div>

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
