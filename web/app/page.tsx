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
import { useAuth } from '@/lib/auth-context'
import type { Entry, Result, StallionStats, SalesStats, SireRanking, EquinelineStats } from '@/lib/supabase'
import type { ExportOptions, OrgWithSilks } from '@/lib/pdf-export'

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [stats, setStats] = useState<StallionStats | null>(null)
  const [sales, setSales] = useState<SalesStats[]>([])
  const [rankings, setRankings] = useState<SireRanking[]>([])
  const [equinelineStats, setEquinelineStats] = useState<EquinelineStats | null>(null)
  const [loading, setLoading] = useState(true)
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

      // Fetch with per-request timeout so one slow endpoint doesn't block the page
      const fetchWithTimeout = (url: string, ms = 8000) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), ms)
        return fetch(url, { signal: controller.signal })
          .finally(() => clearTimeout(timer))
      }

      try {
        const [entriesRes, resultsRes, statsRes, salesRes, rankingsRes, equinelineRes] = await Promise.allSettled([
          fetchWithTimeout(`/api/entries?stallion=${stallion}`),
          fetchWithTimeout(`/api/results?stallion=${stallion}&limit=1000`),
          fetchWithTimeout(`/api/stats?stallion=${stallion}`),
          fetchWithTimeout(`/api/sales?stallion=${stallion}`),
          fetchWithTimeout(`/api/rankings?stallion=${stallion}`),
          fetchWithTimeout(`/api/equineline-stats?stallion=${stallion}`),
        ])

        if (entriesRes.status === 'fulfilled' && entriesRes.value.ok)
          setEntries(await entriesRes.value.json())
        if (resultsRes.status === 'fulfilled' && resultsRes.value.ok)
          setResults(await resultsRes.value.json())
        if (statsRes.status === 'fulfilled' && statsRes.value.ok)
          setStats(await statsRes.value.json())
        if (salesRes.status === 'fulfilled' && salesRes.value.ok)
          setSales(await salesRes.value.json())
        if (rankingsRes.status === 'fulfilled' && rankingsRes.value.ok)
          setRankings(await rankingsRes.value.json())
        if (equinelineRes.status === 'fulfilled' && equinelineRes.value.ok)
          setEquinelineStats(await equinelineRes.value.json())
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
                <WorkoutsSection stallion={stallion} />
              </>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && (
              <ResultsSection results={results} stallionName={stallion} />
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
