'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

interface User {
  id: string
  auth_id: string | null
  email: string
  name: string | null
  role: string
  organization_id: string | null
  organization?: { id: string; name: string } | null
}

interface Organization {
  id: string
  name: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', organization_id: '', role: 'user' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClientComponentClient()

  async function fetchData() {
    const [usersRes, orgsRes] = await Promise.all([
      supabase.from('users').select('*, organization:organizations(id, name)').order('email'),
      supabase.from('organizations').select('id, name').order('name'),
    ])

    if (usersRes.data) setUsers(usersRes.data)
    if (orgsRes.data) setOrganizations(orgsRes.data)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setShowAddForm(false)
      setNewUser({ email: '', name: '', password: '', organization_id: '', role: 'user' })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdateUser(userId: string, updates: Partial<User>) {
    const { error } = await supabase.from('users').update(updates).eq('id', userId)
    if (!error) {
      fetchData()
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return

    const { error } = await supabase.from('users').delete().eq('id', userId)
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
        <h2 className="text-2xl font-semibold text-slate-900">Users</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Add User
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Add New User</h3>
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Organization</label>
                <select
                  value={newUser.organization_id}
                  onChange={e => setNewUser({ ...newUser, organization_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value="">Select organization...</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {isSubmitting ? 'Creating...' : 'Create User'}
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
              <th className="py-3 px-4 text-left font-medium">Email</th>
              <th className="py-3 px-4 text-left font-medium">Name</th>
              <th className="py-3 px-4 text-left font-medium">Organization</th>
              <th className="py-3 px-4 text-left font-medium">Role</th>
              <th className="py-3 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 px-4 text-sm text-slate-900">{user.email}</td>
                <td className="py-3 px-4 text-sm text-slate-600">{user.name || '-'}</td>
                <td className="py-3 px-4">
                  <select
                    value={user.organization_id || ''}
                    onChange={e => handleUpdateUser(user.id, { organization_id: e.target.value || null })}
                    className="text-sm border border-slate-200 rounded px-2 py-1"
                  >
                    <option value="">No organization</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-3 px-4">
                  <select
                    value={user.role}
                    onChange={e => handleUpdateUser(user.id, { role: e.target.value })}
                    className="text-sm border border-slate-200 rounded px-2 py-1"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No users yet. Add your first user above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
