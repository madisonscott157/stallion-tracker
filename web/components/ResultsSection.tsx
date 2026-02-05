'use client'

import { useState, useMemo } from 'react'
import { ResultCard } from '@/components/ResultCard'
import { formatDate, formatDistance, formatTrack } from '@/lib/utils'
import type { Result } from '@/lib/supabase'

interface ResultsSectionProps {
  results: Result[]
  stallionName: string
}

type RaceTypeFilter = 'all' | 'msw_aoc_alw' | 'stakes'
type PositionFilter = 'all' | 'win' | 'top3'

const MSW_AOC_ALW_TYPES = ['MSW', 'AOC', 'ALW']

function matchesRaceType(result: Result, filter: RaceTypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'stakes') return result.is_stakes
  // msw_aoc_alw
  const rt = result.race_type?.toUpperCase() || ''
  return MSW_AOC_ALW_TYPES.some(t => rt.includes(t))
}

function matchesPosition(result: Result, filter: PositionFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'win') return result.finish_position === 1
  return result.finish_position <= 3
}

function exportCSV(results: Result[], stallionName: string) {
  const headers = [
    'Horse', 'Sex', 'Age', 'Date', 'Track', 'Race #', 'Race Type',
    'Stakes Grade', 'Race Name', 'Purse', 'Distance', 'Surface',
    'Finish', 'Beaten Lengths', 'Win Margin', 'Odds',
    'Jockey', 'Trainer', 'Chart URL', 'Replay URL'
  ]

  const currentYear = new Date().getFullYear()

  const rows = results.map(r => [
    r.horse_name || 'Unknown',
    r.horse_sex || '',
    r.horse_yob ? String(currentYear - r.horse_yob) : '',
    r.race_date,
    formatTrack(r.track),
    String(r.race_number),
    r.race_type || '',
    r.stakes_grade || '',
    r.race_name || '',
    r.purse ? String(r.purse) : '',
    formatDistance(r.distance || null),
    r.surface || '',
    String(r.finish_position),
    r.beaten_lengths || '',
    r.win_margin || '',
    r.odds || '',
    r.jockey || '',
    r.trainer || '',
    r.chart_url || '',
    r.replay_url || '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().split('T')[0]
  link.href = url
  link.download = `${stallionName.toLowerCase().replace(/\s+/g, '-')}-results-${dateStr}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function ResultsSection({ results, stallionName }: ResultsSectionProps) {
  const [search, setSearch] = useState('')
  const [raceType, setRaceType] = useState<RaceTypeFilter>('all')
  const [position, setPosition] = useState<PositionFilter>('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return results.filter(r => {
      if (q && !(r.horse_name || '').toLowerCase().includes(q)) return false
      if (!matchesRaceType(r, raceType)) return false
      if (!matchesPosition(r, position)) return false
      return true
    })
  }, [results, search, raceType, position])

  const hasFilters = search || raceType !== 'all' || position !== 'all'

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-header mb-0">All Results</h2>
        <button
          onClick={() => exportCSV(filtered, stallionName)}
          className="text-xs font-medium px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Export CSV {filtered.length !== results.length && `(${filtered.length})`}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search horse name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 w-48"
        />
        <select
          value={raceType}
          onChange={e => setRaceType(e.target.value as RaceTypeFilter)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="all">All Race Types</option>
          <option value="msw_aoc_alw">MSW / AOC / ALW</option>
          <option value="stakes">Stakes</option>
        </select>
        <select
          value={position}
          onChange={e => setPosition(e.target.value as PositionFilter)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="all">All Finishes</option>
          <option value="win">Winners</option>
          <option value="top3">Top 3</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setRaceType('all'); setPosition('all') }}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className="card-stack">
          {filtered.map(result => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      ) : (
        <p className="empty-state">
          {hasFilters ? 'No results match your filters' : 'No results yet'}
        </p>
      )}
    </section>
  )
}
