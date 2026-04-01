'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { StatsBar } from '@/components/StatsBar'
import { EntryCard } from '@/components/EntryCard'
import { ResultCard } from '@/components/ResultCard'
import { SalesTable } from '@/components/SalesCard'
import { ResultsSection } from '@/components/ResultsSection'
import { WorkoutsSection } from '@/components/WorkoutsSection'
import { SireRankingsTable } from '@/components/SireRankingsTable'
import { EquinelineSection } from '@/components/EquinelineSection'
import { ExportModal } from '@/components/ExportModal'
import { PullToRefresh } from '@/components/PullToRefresh'
import { useAuth } from '@/lib/auth-context'
import type { Entry, Result, StallionStats, SalesStats, SireRanking, EquinelineStats, Workout } from '@/lib/supabase'
import { EmptyState } from '@/components/EmptyState'
import type { ExportOptions, OrgWithSilks } from '@/lib/pdf-export'

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [stats, setStats] = useState<StallionStats | null>(null)
  const [sales, setSales] = useState<SalesStats[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [rankings, setRankings] = useState<SireRanking[]>([])
  const [equinelineStats, setEquinelineStats] = useState<EquinelineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [stallionId, setStallionId] = useState<string | null>(null)
  const [stallion, setStallion] = useState<string>('Loading...')
  const [activeTab, setActiveTab] = useState<'overview' | 'results' | 'stats' | 'sales'>('overview')
  const { profile, isLoading: authLoading, allOrgsWithSilks, isAdmin } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const stallionParam = searchParams.get('stallion')

  // Redirect to dashboard if user has show_dashboard and no stallion param
  useEffect(() => {
    if (!authLoading && profile?.show_dashboard && !stallionParam) {
      router.replace('/dashboard')
    }
  }, [authLoading, profile, stallionParam, router])

  const handleStallionChange = useCallback((id: string, name: string) => {
    setStallionId(id)
    setStallion(name)
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (!stallionId) return

      setLoading(true)
      setError(false)

      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(
          `/api/stallion-data?stallion=${encodeURIComponent(stallion)}`,
          { signal: controller.signal }
        )
        clearTimeout(timer)

        if (res.ok) {
          const data = await res.json()
          setEntries(data.entries || [])
          setResults(data.results || [])
          setStats(data.stats || null)
          setSales(data.sales || [])
          setWorkouts(data.workouts || [])
          setRankings(data.rankings || [])
          setEquinelineStats(data.equineline || null)
        } else {
          setError(true)
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error fetching data:', err)
          setError(true)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [stallion, stallionId, fetchKey])

  // Entries are already sorted by date, then time from API

  const currentYear = new Date().getFullYear()

  const handleExportPDF = () => {
    setShowExportModal(true)
  }

  const handleExportWithOptions = async (options: ExportOptions) => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const { exportDashboardToPDF } = await import('@/lib/pdf-export')
      // Build list of orgs with silks for matching owner names
      const orgsWithSilks: OrgWithSilks[] = allOrgsWithSilks.map(o => ({ name: o.name, silks_url: o.silks_url }))
      // Include user's org silks if not already included
      if (profile?.organization?.silks_url && !orgsWithSilks.find(o => o.silks_url === profile.organization?.silks_url)) {
        orgsWithSilks.push({
          name: profile.organization.name,
          silks_url: profile.organization.silks_url
        })
      }
      await exportDashboardToPDF({
        stallionName: stallion,
        results,
        entries,
        options,
        orgsWithSilks,
        isAdmin,
        userOrgName: profile?.organization?.name,
        userOrgSilksUrl: profile?.organization?.silks_url,
      })
      setShowExportModal(false)
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

      <PullToRefresh onRefresh={async () => setFetchKey(k => k + 1)}>
      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        {(authLoading || loading || !stallionId) ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-slate-100 rounded-lg" />
              ))}
            </div>
            <div className="h-5 w-36 bg-slate-200 rounded mt-6" />
            <div className="space-y-3">
              {[4, 5].map(i => (
                <div key={i} className="h-24 bg-slate-100 rounded-lg" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-slate-500 mb-3">Unable to load data.</p>
            <button
              onClick={() => setFetchKey(k => k + 1)}
              className="text-sm text-slate-600 underline hover:text-slate-800"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div key="overview" className="tab-content-enter">
                {/* Upcoming Entries */}
                <section className="mb-6 sm:mb-8">
                  <h2 className="section-header">Upcoming Entries</h2>
                  {entries.length > 0 ? (
                    <div className="card-stack">
                      {entries.map(entry => (
                        <EntryCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState variant="entries" message="No upcoming entries" />
                  )}
                </section>

                {/* Recent Results (last 10) */}
                <section className="mb-6 sm:mb-8">
                  <h2 className="section-header">Recent Results</h2>
                  {results.length > 0 ? (
                    <div className="card-stack">
                      {results.slice(0, 10).map(result => (
                        <ResultCard key={result.id} result={result} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState variant="results" message="No recent results" />
                  )}
                </section>

                {/* Workouts */}
                <WorkoutsSection workouts={workouts} />
              </div>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && (
              <div key="results" className="tab-content-enter">
                <ResultsSection results={results} stallionName={stallion} />
              </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <div key="stats" className="tab-content-enter">
                <section className="max-w-3xl mx-auto">
                  <SireRankingsTable rankings={rankings} />
                  {equinelineStats && (
                    <EquinelineSection stats={equinelineStats} currentYear={currentYear} />
                  )}
                </section>
              </div>
            )}

            {/* Sales Tab */}
            {activeTab === 'sales' && (
              <div key="sales" className="tab-content-enter">
                <section className="max-w-3xl mx-auto">
                  <h2 className="section-header">Sales Statistics</h2>
                  {sales.length > 0 ? (
                    <>
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
                      <p className="text-xs text-slate-400 mt-4">Source: TDN Insta-tistics</p>
                    </>
                  ) : (
                    <EmptyState variant="sales" message="No sales data available" />
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
      </PullToRefresh>

      {/* Spacer for fixed bottom nav */}
      <div className="h-12" />

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 sm:px-6 pt-2 pb-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        aria-label="Main navigation"
      >
        <div className="flex justify-around text-sm max-w-5xl mx-auto" role="tablist">
          {(['overview', 'results', 'stats', 'sales'] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center relative pb-2 px-3 ${activeTab === tab ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal'}`}
            >
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              <span
                className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: 'var(--org-secondary)',
                  height: '3px',
                  opacity: activeTab === tab ? 1 : 0,
                  transform: activeTab === tab ? 'scaleX(1)' : 'scaleX(0)',
                }}
              />
            </button>
          ))}
        </div>
      </nav>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportWithOptions}
        isExporting={isExporting}
      />
    </div>
  )
}
