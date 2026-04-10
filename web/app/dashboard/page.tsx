'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardHeader } from '@/components/DashboardHeader'
import { StallionSummaryCard } from '@/components/StallionSummaryCard'
import { EntryCard } from '@/components/EntryCard'
import { ResultCard } from '@/components/ResultCard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { ClmToggle } from '@/components/ClmToggle'
import { useAuth } from '@/lib/auth-context'
import { EmptyState } from '@/components/EmptyState'
import type { Entry, Result } from '@/lib/supabase'

interface StallionSummary {
  id: string
  name: string
  stud_farm: string | null
  stud_fee: number | null
  upcoming_entries: number
  ytd_starters: number
  ytd_winners: number
  ytd_earnings: number
}

interface DashboardData {
  stallions: StallionSummary[]
  recent_winners: Result[]
  recent_stakes: Result[]
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)
  const { isLoading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const stallionFilter = searchParams.get('stallion') || ''

  const setStallionFilter = (name: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (name) {
      params.set('stallion', name)
    } else {
      params.delete('stallion')
    }
    router.replace(`/dashboard?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const controller = new AbortController()

    async function fetchDashboard() {
      const fetchWithTimeout = (url: string, ms = 8000) => {
        const timer = setTimeout(() => controller.abort(), ms)
        return fetch(url, { signal: controller.signal })
          .finally(() => clearTimeout(timer))
      }

      try {
        const [dashRes, entriesRes, resultsRes] = await Promise.allSettled([
          fetchWithTimeout('/api/dashboard/summary'),
          fetchWithTimeout('/api/entries'),
          fetchWithTimeout('/api/results?limit=50&days=14'),
        ])

        if (controller.signal.aborted) return

        if (dashRes.status === 'fulfilled' && dashRes.value.ok)
          setData(await dashRes.value.json())
        if (entriesRes.status === 'fulfilled' && entriesRes.value.ok)
          setEntries(await entriesRes.value.json())
        if (resultsRes.status === 'fulfilled' && resultsRes.value.ok)
          setResults(await resultsRes.value.json())
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error fetching dashboard:', error)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchDashboard()
    return () => controller.abort()
  }, [fetchKey])

  // Client-side stallion filter
  const filterBySire = <T extends { sire_name?: string }>(items: T[]): T[] => {
    if (!stallionFilter) return items
    return items.filter(item => item.sire_name === stallionFilter)
  }

  const filteredEntries = filterBySire(entries)
  const filteredResults = filterBySire(results)
  const filteredWinners = filterBySire(data?.recent_winners ?? [])
  const filteredStakes = filterBySire(data?.recent_stakes ?? [])

  const stallionNames = data?.stallions
    .map(s => s.name)
    .sort((a, b) => a.localeCompare(b)) ?? []

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <DashboardHeader onPreferenceChange={() => setFetchKey(k => k + 1)} />

      <PullToRefresh onRefresh={async () => setFetchKey(k => k + 1)}>
      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        {(authLoading || loading) ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-5 w-32 bg-slate-200 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-slate-200 rounded-lg" />
              ))}
            </div>
            <div className="h-5 w-40 bg-slate-200 rounded mt-4" />
            <div className="space-y-3">
              {[4, 5, 6].map(i => (
                <div key={i} className="h-24 bg-slate-100 rounded-lg" />
              ))}
            </div>
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-slate-500">
            Unable to load dashboard data.
          </div>
        ) : (
          <>
            {/* Stallion filter + mobile CLM toggle */}
            <div className="mb-6 flex items-center gap-3">
              {stallionNames.length > 1 && (
                <select
                  value={stallionFilter}
                  onChange={e => setStallionFilter(e.target.value)}
                  className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">All Stallions</option>
                  {stallionNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              <ClmToggle onPreferenceChange={() => setFetchKey(k => k + 1)} className="sm:hidden text-slate-500" checkboxClassName="accent-slate-600" />
            </div>

            {/* Stallion Summary Cards */}
            <section className="mb-6 sm:mb-8">
              <h2 className="section-header">Your Stallions</h2>
              {data.stallions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                  {data.stallions
                    .filter(s => !stallionFilter || s.name === stallionFilter)
                    .map(stallion => (
                      <StallionSummaryCard key={stallion.id} stallion={stallion} />
                    ))}
                </div>
              ) : (
                <EmptyState variant="generic" message="No stallions found" />
              )}
            </section>

            {/* Upcoming Entries */}
            <section className="mb-6 sm:mb-8">
              <h2 className="section-header">Upcoming Entries</h2>
              {filteredEntries.length > 0 ? (
                <div className="card-stack">
                  {filteredEntries.map(entry => (
                    <EntryCard key={entry.id} entry={entry} showSireName />
                  ))}
                </div>
              ) : (
                <EmptyState variant="entries" message="No upcoming entries" />
              )}
            </section>

            {/* Recent Results */}
            <section className="mb-6 sm:mb-8">
              <h2 className="section-header">Recent Results <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {filteredResults.length > 0 ? (
                <div className="card-stack">
                  {filteredResults.map(result => (
                    <ResultCard key={result.id} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <EmptyState variant="results" message="No recent results" />
              )}
            </section>

            {/* Recent Winners */}
            <section className="mb-6 sm:mb-8">
              <h2 className="section-header">Recent Winners <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {filteredWinners.length > 0 ? (
                <div className="card-stack">
                  {filteredWinners.map(result => (
                    <ResultCard key={`w-${result.id}`} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <EmptyState variant="winners" message="No recent winners" />
              )}
            </section>

            {/* Recent Stakes Results */}
            <section className="mb-6 sm:mb-8">
              <h2 className="section-header">Recent Stakes Results <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {filteredStakes.length > 0 ? (
                <div className="card-stack">
                  {filteredStakes.map(result => (
                    <ResultCard key={`s-${result.id}`} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <EmptyState variant="stakes" message="No recent stakes results" />
              )}
            </section>
          </>
        )}
      </main>
      </PullToRefresh>
    </div>
  )
}
