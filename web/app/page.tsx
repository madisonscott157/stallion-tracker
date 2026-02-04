'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/Header'
import { StatsBar } from '@/components/StatsBar'
import { EntryCard } from '@/components/EntryCard'
import { ResultCard } from '@/components/ResultCard'
import { WorkoutCard } from '@/components/WorkoutCard'
import { SalesTable } from '@/components/SalesCard'
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
        stats,
        rankings,
        equinelineStats,
        sales,
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
                {/* Sire Rankings */}
                {rankings.length > 0 && (
                  <>
                    <h2 className="section-header">Sire List Rankings</h2>
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                            <th className="py-2 px-3 text-center font-medium">Year</th>
                            <th className="py-2 px-2 text-center font-medium">List</th>
                            <th className="py-2 px-2 text-center font-medium">Rank</th>
                            <th className="py-2 px-2 text-center font-medium">Starters</th>
                            <th className="py-2 px-2 text-center font-medium">Winners</th>
                            <th className="py-2 px-1 text-center font-medium">BTW</th>
                            <th className="py-2 px-1 text-center font-medium">BTH</th>
                            <th className="py-2 px-1 text-center font-medium">GSW</th>
                            <th className="py-2 px-1 text-center font-medium">GSH</th>
                            <th className="py-2 px-3 text-center font-medium">Earnings</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...rankings]
                            .sort((a, b) => b.year - a.year)
                            .map(ranking => {
                              const listLabel = ranking.list_type === 'ytd' ? 'YTD' :
                                ranking.list_type === 'freshman' ? '1st Crop' :
                                ranking.list_type === 'second_crop' ? '2nd Crop' :
                                ranking.list_type === 'third_crop' ? '3rd Crop' :
                                ranking.list_type
                              return (
                                <tr key={ranking.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.year}
                                  </td>
                                  <td className="py-2 px-2 text-sm font-medium text-center">
                                    {ranking.source_url ? (
                                      <a
                                        href={ranking.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline"
                                        style={{ color: 'var(--org-primary)' }}
                                      >
                                        {listLabel}
                                      </a>
                                    ) : (
                                      <span className="text-slate-700">{listLabel}</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-sm text-slate-900 text-center font-semibold">
                                    #{ranking.rank}
                                  </td>
                                  <td className="py-2 px-2 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.starters ?? '-'}
                                  </td>
                                  <td className="py-2 px-2 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.winners ?? '-'}
                                  </td>
                                  <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.black_type_winners ?? '-'}
                                  </td>
                                  <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.black_type_horses ?? '-'}
                                  </td>
                                  <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.graded_stakes_winners ?? '-'}
                                  </td>
                                  <td className="py-2 px-1 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.graded_stakes_horses ?? '-'}
                                  </td>
                                  <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                                    {ranking.total_earnings ? `$${ranking.total_earnings.toLocaleString()}` : '-'}
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Equineline Racing Stats */}
                {equinelineStats && (
                  <>
                    {/* Career Summary */}
                    <h2 className="section-header mt-8">Career Summary</h2>
                    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
                      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.crops ?? 0}</span> crops</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.foals ?? 0}</span> foals</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.foals_racing_age ?? 0}</span> racing age</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm mt-3">
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.champions ?? 0}</span> champions</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.graded_stakes_winners ?? 0}</span> GSW</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.blacktype_winners ?? 0}</span> BTW</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600"><span className="font-semibold text-slate-900">{equinelineStats.blacktype_placers ?? 0}</span> BTP</span>
                      </div>
                    </div>

                    {/* Performance Table */}
                    <h2 className="section-header">Performance</h2>
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-1">
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                            <th className="py-2 px-3 text-left font-medium"></th>
                            <th className="py-2 px-3 text-center font-medium">Lifetime</th>
                            <th className="py-2 px-3 text-center font-medium">{currentYear}</th>
                            <th className="py-2 px-3 text-center font-medium">2YOs</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 px-3 text-sm font-medium text-slate-700">Starters</td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.lifetime_starters ?? 0} <span className="text-slate-400">({equinelineStats.lifetime_starters_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_starters ?? 0} <span className="text-slate-400">({equinelineStats.current_starters_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_2yo_starters ?? 0} <span className="text-slate-400">({equinelineStats.current_2yo_starters_pct ?? 0}%)</span>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 px-3 text-sm font-medium text-slate-700">Winners</td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.lifetime_winners ?? 0} <span className="text-slate-400">({equinelineStats.lifetime_winners_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_winners ?? 0} <span className="text-slate-400">({equinelineStats.current_winners_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_2yo_winners ?? 0} <span className="text-slate-400">({equinelineStats.current_2yo_winners_pct ?? 0}%)</span>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 px-3 text-sm font-medium text-slate-700">BTW</td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.lifetime_btw ?? 0} <span className="text-slate-400">({equinelineStats.lifetime_btw_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_btw ?? 0} <span className="text-slate-400">({equinelineStats.current_btw_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_2yo_btw ?? 0} <span className="text-slate-400">({equinelineStats.current_2yo_btw_pct ?? 0}%)</span>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 px-3 text-sm font-medium text-slate-700">Wins</td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.lifetime_wins ?? 0} <span className="text-slate-400">({equinelineStats.lifetime_wins_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_wins ?? 0} <span className="text-slate-400">({equinelineStats.current_wins_pct ?? 0}%)</span>
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              {equinelineStats.current_2yo_wins ?? 0} <span className="text-slate-400">({equinelineStats.current_2yo_wins_pct ?? 0}%)</span>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 px-3 text-sm font-medium text-slate-700">Earnings</td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              ${(equinelineStats.lifetime_earnings ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              ${(equinelineStats.current_earnings ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              ${(equinelineStats.current_2yo_earnings ?? 0).toLocaleString()}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-sm font-medium text-slate-700">Avg/Starter</td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              ${(equinelineStats.lifetime_avg_earnings ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              ${(equinelineStats.current_avg_earnings ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-sm text-slate-600 text-center tabular-nums">
                              ${(equinelineStats.current_2yo_avg_earnings ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-400 text-center mb-6">Percentages are from foals of racing age</p>

                    {/* Top Earners */}
                    {(equinelineStats.chief_earner_name || equinelineStats.current_top_earner_name) && (
                      <>
                        <h2 className="section-header">Top Earners</h2>
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <div className="space-y-2">
                            {equinelineStats.chief_earner_name && (
                              <div className="flex justify-between text-sm">
                                <span className="font-medium text-slate-700">{equinelineStats.chief_earner_name}</span>
                                <span className="text-slate-600">${(equinelineStats.chief_earner_amount ?? 0).toLocaleString()} <span className="text-slate-400">(Lifetime)</span></span>
                              </div>
                            )}
                            {equinelineStats.current_top_earner_name && (
                              <div className="flex justify-between text-sm">
                                <span className="font-medium text-slate-700">{equinelineStats.current_top_earner_name}</span>
                                <span className="text-slate-600">${(equinelineStats.current_top_earner_amount ?? 0).toLocaleString()} <span className="text-slate-400">({currentYear})</span></span>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </>
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
