'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { StatsBar } from '@/components/StatsBar'
import { EntryCard } from '@/components/EntryCard'
import { ResultCard } from '@/components/ResultCard'
import { WorkoutCard } from '@/components/WorkoutCard'
import type { Entry, Result, Workout, StallionStats } from '@/lib/supabase'

const DEFAULT_STALLION = process.env.NEXT_PUBLIC_DEFAULT_STALLION || 'McKinzie'

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [stats, setStats] = useState<StallionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [stallion] = useState(DEFAULT_STALLION)
  const [activeTab, setActiveTab] = useState<'overview' | 'results' | 'stats'>('overview')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      try {
        const [entriesRes, resultsRes, workoutsRes, statsRes] = await Promise.all([
          fetch(`/api/entries?stallion=${stallion}`),
          fetch(`/api/results?stallion=${stallion}&limit=10`),
          fetch(`/api/workouts?stallion=${stallion}&limit=5`),
          fetch(`/api/stats?stallion=${stallion}`),
        ])

        if (entriesRes.ok) {
          const data = await entriesRes.json()
          setEntries(data)
        }

        if (resultsRes.ok) {
          const data = await resultsRes.json()
          setResults(data)
        }

        if (workoutsRes.ok) {
          const data = await workoutsRes.json()
          setWorkouts(data)
        }

        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats(data)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [stallion])

  // Entries are already sorted by date, then time from API

  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen flex flex-col">
      <Header stallionName={stallion} />

      {stats && (
        <StatsBar
          year={currentYear}
          starters={stats.starters}
          winners={stats.winners}
          winPct={stats.win_pct || 0}
          earnings={stats.total_earnings}
        />
      )}

      <main className="flex-1 px-5 py-6">
        {loading ? (
          <div className="text-center py-12 text-slate-500">
            Loading...
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                {/* Upcoming Entries */}
                <section className="mb-8">
                  <h2 className="section-header">Upcoming Entries</h2>
                  {entries.length > 0 ? (
                    <div className="card-stack">
                      {entries.map(entry => (
                        <EntryCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No upcoming entries</p>
                  )}
                </section>

                {/* Recent Results (limited) */}
                <section className="mb-8">
                  <h2 className="section-header">Recent Results</h2>
                  {results.length > 0 ? (
                    <div className="card-stack">
                      {results.slice(0, 5).map(result => (
                        <ResultCard key={result.id} result={result} />
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No recent results</p>
                  )}
                </section>

                {/* Workouts */}
                <section className="mb-8 border-t border-slate-200 pt-8">
                  <h2 className="section-header">Recent Workouts</h2>
                  {workouts.length > 0 ? (
                    <div className="card-stack">
                      {workouts.map(workout => (
                        <WorkoutCard key={workout.id} workout={workout} />
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No recent workouts</p>
                  )}
                </section>
              </>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && (
              <section>
                <h2 className="section-header">All Results</h2>
                {results.length > 0 ? (
                  <div className="card-stack">
                    {results.map(result => (
                      <ResultCard key={result.id} result={result} />
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No results yet</p>
                )}
              </section>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <section>
                <h2 className="section-header">Statistics</h2>
                {stats ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm text-slate-500">Starters</p>
                        <p className="text-2xl font-semibold text-slate-900">{stats.starters}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Winners</p>
                        <p className="text-2xl font-semibold text-slate-900">{stats.winners}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Win %</p>
                        <p className="text-2xl font-semibold text-slate-900">{stats.win_pct?.toFixed(1) || 0}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Earnings</p>
                        <p className="text-2xl font-semibold text-slate-900">
                          ${stats.total_earnings?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="empty-state">No statistics available</p>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3">
        <div className="flex justify-around text-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex flex-col items-center ${activeTab === 'overview' ? 'text-primary font-medium' : 'text-slate-400'}`}
          >
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`flex flex-col items-center ${activeTab === 'results' ? 'text-primary font-medium' : 'text-slate-400'}`}
          >
            <span>Results</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center ${activeTab === 'stats' ? 'text-primary font-medium' : 'text-slate-400'}`}
          >
            <span>Stats</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
