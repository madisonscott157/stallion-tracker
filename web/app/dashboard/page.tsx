'use client'

import { useEffect, useState } from 'react'
import { DashboardHeader } from '@/components/DashboardHeader'
import { StallionSummaryCard } from '@/components/StallionSummaryCard'
import { ResultCard } from '@/components/ResultCard'
import { useAuth } from '@/lib/auth-context'
import type { Result } from '@/lib/supabase'

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
  const [loading, setLoading] = useState(true)
  const { isLoading: authLoading } = useAuth()

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch('/api/dashboard/summary')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
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
            {/* Stallion Summary Cards */}
            <section className="mb-8">
              <h2 className="section-header">Your Stallions</h2>
              {data.stallions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.stallions.map(stallion => (
                    <StallionSummaryCard key={stallion.id} stallion={stallion} />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No stallions found</p>
              )}
            </section>

            {/* Recent Winners */}
            <section className="mb-8">
              <h2 className="section-header">Recent Winners <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {data.recent_winners.length > 0 ? (
                <div className="card-stack">
                  {data.recent_winners.map(result => (
                    <ResultCard key={result.id} result={result} showSireName />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No recent winners</p>
              )}
            </section>

            {/* Recent Stakes Results */}
            <section className="mb-8">
              <h2 className="section-header">Recent Stakes Results <span className="text-xs font-normal text-slate-400 ml-1">Last 14 days</span></h2>
              {data.recent_stakes.length > 0 ? (
                <div className="card-stack">
                  {data.recent_stakes.map(result => (
                    <ResultCard key={result.id} result={result} showSireName />
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
