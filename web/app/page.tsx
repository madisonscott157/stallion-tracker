'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/Header'
import { StatsBar } from '@/components/StatsBar'
import { EntryCard } from '@/components/EntryCard'
import { ResultCard } from '@/components/ResultCard'
import { WorkoutCard } from '@/components/WorkoutCard'
import { SalesTable } from '@/components/SalesCard'
import { SireRankingsTable } from '@/components/SireRankingsTable'
import { EquinelineSection } from '@/components/EquinelineSection'
import { useAuth } from '@/lib/auth-context'
import type { Entry, Result, Workout, StallionStats, SalesStats, SireRanking, EquinelineStats } from '@/lib/supabase'

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [stats, setStats] = useState<StallionStats | null>(null)
  const [sales, setSales] = useState<SalesStats[]>([])
  const [rankings, setRankings] = useState<SireRanking[]>([])
  const [equinelineStats, setEquinelineStats] = useState<EquinelineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [stallionId, setStallionId] = useState<string | null>(null)
  const [stallion, setStallion] = useState<string>('Loading...')
  const [activeTab, setActiveTab] = useState<'overview' | 'results' | 'stats' | 'sales'>('overview')
  const { profile, isLoading: authLoading } = useAuth()

  const handleStallionChange = useCallback((id: string, name: string) => {
    setStallionId(id)
    setStallion(name)
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (!stallionId) return

      setLoading(true)

      try {
        const [entriesRes, resultsRes, workoutsRes, statsRes, salesRes, rankingsRes, equinelineRes] = await Promise.all([
          fetch(`/api/entries?stallion=${stallion}`),
          fetch(`/api/results?stallion=${stallion}&limit=1000`),
          fetch(`/api/workouts?stallion=${stallion}&limit=25`),
          fetch(`/api/stats?stallion=${stallion}`),
          fetch(`/api/sales?stallion=${stallion}`),
          fetch(`/api/rankings?stallion=${stallion}`),
          fetch(`/api/equineline-stats?stallion=${stallion}`),
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

        if (salesRes.ok) {
          const data = await salesRes.json()
          setSales(data)
        }

        if (rankingsRes.ok) {
          const data = await rankingsRes.json()
          setRankings(data)
        }

        if (equinelineRes.ok) {
          const data = await equinelineRes.json()
          setEquinelineStats(data)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [stallion, stallionId])

  // Entries are already sorted by date, then time from API

  const currentYear = new Date().getFullYear()

  const handleExportPDF = async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const { exportDashboardToPDF } = await import('@/lib/pdf-export')
      await exportDashboardToPDF({
        stallionName: stallion,
        results,
        entries,
      })
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        stallionName={stallion}
        stallionId={stallionId}
        onStallionChange={handleStallionChange}
        onExportPDF={handleExportPDF}
        isExporting={isExporting}
      />

      {rankings.length > 0 && (() => {
        const currentYearRanking = rankings.find(r => r.year === currentYear)
        if (!currentYearRanking) return null
        return (
          <StatsBar
            year={currentYear}
            starters={currentYearRanking.starters || 0}
            winners={currentYearRanking.winners || 0}
            earnings={currentYearRanking.total_earnings || 0}
          />
        )
      })()}

      <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        {(authLoading || loading || !stallionId) ? (
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

                {/* Recent Results (last 10) */}
                <section className="mb-8">
                  <h2 className="section-header">Recent Results</h2>
                  {results.length > 0 ? (
                    <div className="card-stack">
                      {results.slice(0, 10).map(result => (
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
              <section className="max-w-3xl mx-auto">
                <SireRankingsTable rankings={rankings} />
                {equinelineStats && (
                  <EquinelineSection stats={equinelineStats} currentYear={currentYear} />
                )}
              </section>
            )}

            {/* Sales Tab */}
            {activeTab === 'sales' && (
              <section className="max-w-3xl mx-auto">
                <h2 className="section-header">Sales Statistics</h2>
                {sales.length > 0 ? (
                  <div className="space-y-4">
                    {Array.from(new Set(sales.map(s => s.sale_year)))
                      .sort((a, b) => b - a)
                      .map(year => (
                        <SalesTable
                          key={year}
                          salesByYear={sales.filter(s => s.sale_year === year)}
                          year={year}
                        />
                      ))}
                  </div>
                ) : (
                  <p className="empty-state">No sales data available</p>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-3">
        <div className="flex justify-around text-sm max-w-5xl mx-auto">
          {(['overview', 'results', 'stats', 'sales'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center relative pb-2 ${activeTab === tab ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal'}`}
            >
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              {activeTab === tab && (
                <span
                  className="absolute bottom-0 left-0 right-0 rounded-full"
                  style={{ backgroundColor: 'var(--org-secondary)', height: '3px' }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
