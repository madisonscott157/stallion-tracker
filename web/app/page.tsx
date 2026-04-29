'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
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
import { FeeHistoryTable } from '@/components/FeeHistoryTable'
import dynamic from 'next/dynamic'

const ExportModal = dynamic(() => import('@/components/ExportModal').then(mod => ({ default: mod.ExportModal })), { ssr: false })
import { PullToRefresh } from '@/components/PullToRefresh'
import { useAuth } from '@/lib/auth-context'
import type { Entry, Result, StallionStats, SalesStats, SireRanking, EquinelineStats, Workout, StallionFeeHistory } from '@/lib/supabase'
import { EmptyState } from '@/components/EmptyState'
import { ClmToggle } from '@/components/ClmToggle'
import type { ExportOptions, OrgWithSilks } from '@/lib/pdf-export'

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [stats, setStats] = useState<StallionStats | null>(null)
  const [sales, setSales] = useState<SalesStats[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [rankings, setRankings] = useState<SireRanking[]>([])
  const [tdnRegion, setTdnRegion] = useState<'na' | 'eu' | 'fr'>('na')
  const [equinelineStats, setEquinelineStats] = useState<EquinelineStats | null>(null)
  const [feeHistory, setFeeHistory] = useState<StallionFeeHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [stallionId, setStallionId] = useState<string | null>(null)
  const [stallion, setStallion] = useState<string>('Loading...')
  const { profile, isLoading: authLoading, allOrgsWithSilks, isAdmin } = useAuth()
  const showRaceActivity = profile?.organization?.show_race_activity !== false
  const [activeTab, setActiveTab] = useState<'overview' | 'results' | 'stats' | 'sales' | 'history'>(
    showRaceActivity ? 'overview' : 'stats'
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const stallionParam = searchParams.get('stallion')
  const tabParam = searchParams.get('tab')

  // Always redirect to dashboard unless viewing a specific stallion
  useEffect(() => {
    if (!authLoading && profile && !stallionParam) {
      router.replace('/dashboard')
    }
  }, [authLoading, profile, stallionParam, router])

  // Set stallionId from URL param immediately — don't wait for StallionSelector
  useEffect(() => {
    if (stallionParam && stallionParam !== stallionId) {
      setStallionId(stallionParam)
    }
  }, [stallionParam])

  // Apply ?tab= deep link, honoring the org's show_race_activity flag
  useEffect(() => {
    const valid = ['overview', 'results', 'stats', 'sales'] as const
    type Tab = typeof valid[number]
    if (tabParam && (valid as readonly string[]).includes(tabParam)) {
      const target = tabParam as Tab
      if (!showRaceActivity && (target === 'overview' || target === 'results')) {
        setActiveTab('stats')
      } else {
        setActiveTab(target)
      }
      return
    }
    // No tab param: make sure hidden tabs aren't the active one after the
    // flag flips (e.g. the initial render picked 'overview' before profile loaded)
    if (!showRaceActivity && (activeTab === 'overview' || activeTab === 'results')) {
      setActiveTab('stats')
    }
  }, [tabParam, showRaceActivity])

  const handleStallionChange = useCallback((id: string, name: string) => {
    setStallionId(id)
    setStallion(name)
  }, [])

  useEffect(() => {
    if (!stallionId) return

    const controller = new AbortController()

    async function fetchData() {
      setLoading(true)
      setError(false)

      try {
        const timer = setTimeout(() => controller.abort(), 10000)
        // Fetch by ID when name hasn't resolved yet, otherwise by name
        const param = stallion && stallion !== 'Loading...'
          ? `stallion=${encodeURIComponent(stallion)}`
          : `id=${encodeURIComponent(stallionId!)}`
        const res = await fetch(
          `/api/stallion-data?${param}`,
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
          setTdnRegion(data.tdn_region || 'na')
          setEquinelineStats(data.equineline || null)
          setFeeHistory(data.history || [])
        } else {
          setError(true)
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error fetching data:', err)
          setError(true)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => controller.abort()
  }, [stallionId, fetchKey])

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
    <div className="min-h-screen flex flex-col bg-slate-50">
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
            region={tdnRegion}
          />
        )
      })()}

      {/* Coverage note for international stallions — explains the
          country/stakes filter applied at ingest time. */}
      {tdnRegion !== 'na' && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
          <div className="max-w-5xl mx-auto text-xs text-slate-500 text-center">
            Showing all races from <span className="font-medium text-slate-600">USA, Canada, France, Great Britain, Ireland</span>;
            and stakes only (Listed / Group) elsewhere. Jumps and Southern Hemisphere races excluded.
          </div>
        </div>
      )}

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
            {showRaceActivity && activeTab === 'overview' && (
              <div key="overview" className="tab-content-enter">
                {/* Upcoming Entries */}
                <section className="mb-6 sm:mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upcoming Entries</h2>
                    <ClmToggle
                      onPreferenceChange={() => setFetchKey(k => k + 1)}
                      className="text-slate-500 hover:text-slate-700 transition-colors"
                      checkboxClassName="accent-slate-600"
                    />
                  </div>
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
            {showRaceActivity && activeTab === 'results' && (
              <div key="results" className="tab-content-enter">
                <ResultsSection results={results} stallionName={stallion} />
              </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <div key="stats" className="tab-content-enter">
                <section className="max-w-3xl mx-auto">
                  <SireRankingsTable rankings={rankings} region={tdnRegion} />
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

            {/* History Tab */}
            {activeTab === 'history' && (
              <div key="history" className="tab-content-enter">
                <section className="max-w-3xl mx-auto">
                  {feeHistory.length > 0 ? (
                    <FeeHistoryTable history={feeHistory} stallionName={stallion} />
                  ) : (
                    <EmptyState message="No history available" />
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
      </PullToRefresh>

      {/* Spacer for fixed bottom nav */}
      <div className="h-12" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }} />

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 sm:px-6 pt-2 pb-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        aria-label="Main navigation"
      >
        <div className="flex justify-around text-xs sm:text-sm max-w-5xl mx-auto" role="tablist">
          {(['overview', 'results', 'stats', 'sales', 'history'] as const)
            .filter(tab => showRaceActivity || (tab !== 'overview' && tab !== 'results'))
            .map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center relative pb-2 px-2 sm:px-3 ${activeTab === tab ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal'}`}
            >
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              <span
                className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: 'var(--org-secondary, #64748b)',
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
