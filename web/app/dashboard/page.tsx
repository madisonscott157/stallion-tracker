'use client'

import { useEffect, useState } from 'react'
import { DashboardHeader } from '@/components/DashboardHeader'
import { StallionSummaryCard } from '@/components/StallionSummaryCard'
import { EntryCard } from '@/components/EntryCard'
import { ResultCard } from '@/components/ResultCard'
import { useAuth } from '@/lib/auth-context'
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
  const [data, setData] = useState<DashboardData | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [stallionFilter, setStallionFilter] = useState<string>('')
  const { isLoading: authLoading } = useAuth()

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [dashRes, entriesRes, resultsRes] = await Promise.all([
          fetch('/api/dashboard/summary'),
          fetch('/api/entries'),
          fetch('/api/results?limit=50&days=14'),
        ])

        if (dashRes.ok) setData(await dashRes.json())
        if (entriesRes.ok) setEntries(await entriesRes.json())
        if (resultsRes.ok) setResults(await resultsRes.json())
      } catch (error) {
        console.error('Error fetching dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    if (!authLoading) {
      fetchDashboard()
    }
  }, [authLoading])

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
      <DashboardHeader />

      <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        {(authLoading || loading) ? (
          <div className="text-center py-12 text-slate-500">
            Loading...
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-slate-500">
            Unable to load dashboard data.
          </div>
        ) : (
          <>
            {/* Stallion filter */}
            {stallionNames.length > 1 && (
              <div className="mb-6">
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
              </div>
            )}

            {/* Stallion Summary Cards */}
            <section className="mb-8">
              <h2 className="section-header">Your Stallions</h2>
              {data.stallions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.stallions
                    .filter(s => !stallionFilter || s.name === stallionFilter)
                    .map(stallion => (
                      <StallionSummaryCard key={stallion.id} stallion={stallion} />
                    ))}
                </div>
              ) : (
                <p className="empty-state">No stallions found</p>
              )}
            </section>

            {/* Upcoming Entries */}
            <section className="mb-8">
              <h2 className="section-header">Upcoming Entries</h2>
              {filteredEntries.length > 0 ? (
                <div className="card-stack">
                  {filteredEntries.map(entry => (
                    <EntryCard key={entry.id} entry={entry} showSireName />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No upcoming entries</p>
              )}
            </section>

            {/* Recent Results */}
            <section className="mb-8">
              <h2 className="section-header">Recent Results <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {filteredResults.length > 0 ? (
                <div className="card-stack">
                  {filteredResults.map(result => (
                    <ResultCard key={result.id} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No recent results</p>
              )}
            </section>

            {/* Recent Winners */}
            <section className="mb-8">
              <h2 className="section-header">Recent Winners <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {filteredWinners.length > 0 ? (
                <div className="card-stack">
                  {filteredWinners.map(result => (
                    <ResultCard key={`w-${result.id}`} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No recent winners</p>
              )}
            </section>

            {/* Recent Stakes Results */}
            <section className="mb-8">
              <h2 className="section-header">Recent Stakes Results <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {filteredStakes.length > 0 ? (
                <div className="card-stack">
                  {filteredStakes.map(result => (
                    <ResultCard key={`s-${result.id}`} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No recent stakes results</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
