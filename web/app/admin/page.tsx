'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import Link from 'next/link'

interface Stats {
  organizations: number
  users: number
  stallions: number
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats>({ organizations: 0, users: 0, stallions: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    async function fetchStats() {
      const [orgsRes, usersRes, stallionsRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('stallions').select('id', { count: 'exact', head: true }),
      ])

      setStats({
        organizations: orgsRes.count || 0,
        users: usersRes.count || 0,
        stallions: stallionsRes.count || 0,
      })
      setIsLoading(false)
    }

    fetchStats()
  }, [supabase])

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 mb-6">Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link
          href="/admin/organizations"
          className="bg-white rounded-lg border border-slate-200 p-6 hover:border-slate-300 transition-colors"
        >
          <p className="text-sm text-slate-500 mb-1">Stables</p>
          <p className="text-3xl font-semibold text-slate-900">{stats.organizations}</p>
        </Link>

        <Link
          href="/admin/users"
          className="bg-white rounded-lg border border-slate-200 p-6 hover:border-slate-300 transition-colors"
        >
          <p className="text-sm text-slate-500 mb-1">Users</p>
          <p className="text-3xl font-semibold text-slate-900">{stats.users}</p>
        </Link>

        <Link
          href="/admin/stallions"
          className="bg-white rounded-lg border border-slate-200 p-6 hover:border-slate-300 transition-colors"
        >
          <p className="text-sm text-slate-500 mb-1">Stallions</p>
          <p className="text-3xl font-semibold text-slate-900">{stats.stallions}</p>
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Quick Actions</h3>
        <div className="flex gap-4">
          <Link
            href="/admin/users?action=new"
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Add User
          </Link>
          <Link
            href="/admin/organizations?action=new"
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            Add Stable
          </Link>
          <Link
            href="/admin/stallions?action=new"
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            Add Stallion
          </Link>
        </div>
      </div>
    </div>
  )
}
