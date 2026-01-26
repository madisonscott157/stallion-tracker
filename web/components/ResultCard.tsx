'use client'

import { cn, cleanRaceName, formatDistance, formatHorseDescription, formatDate, formatOrdinal, isToday, isTomorrow } from '@/lib/utils'
import type { Result } from '@/lib/supabase'

interface ResultCardProps {
  result: Result
}

// Format track name: "FAIR GROUNDS" → "Fair Grounds"
function formatTrack(track: string): string {
  return track
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function ResultCard({ result }: ResultCardProps) {
  const horseName = result.horse_name || 'Unknown'
  const horseDesc = formatHorseDescription(result.horse_sex || null, result.horse_yob || null)
  const isWinner = result.finish_position === 1

  const dateLabel = isToday(result.race_date)
    ? 'Today'
    : isTomorrow(result.race_date)
    ? 'Tomorrow'
    : formatDate(result.race_date)

  const trackDisplay = formatTrack(result.track)

  // Clean stakes race name (remove STAKES prefix and sponsor info)
  const stakesRaceName = result.is_stakes && result.race_name
    ? cleanRaceName(result.race_name.replace(/^STAKES\s*/i, '').trim())
    : null

  // Determine border color based on stakes status
  const borderClass = result.stakes_grade
    ? 'border-l-4 border-l-accent'  // Graded stakes: orange
    : result.is_stakes
    ? 'border-l-4 border-l-primary' // Non-graded stakes: navy
    : ''                             // Non-stakes: no colored border

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 px-4 py-2.5',
        borderClass
      )}
    >
      {/* Row 1: Position + Horse name + sex/age | Date, Track */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2 min-w-0">
          {isWinner ? (
            <span className="bg-green-700 text-white text-xs px-1.5 py-0.5 rounded font-medium shrink-0 relative top-[-1px]">
              WIN
            </span>
          ) : (
            <span className="text-slate-500 text-sm font-medium shrink-0">
              {formatOrdinal(result.finish_position)}
            </span>
          )}
          <span className="font-medium text-slate-900">{horseName}</span>
          {horseDesc && (
            <span className="text-sm text-slate-400">{horseDesc}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600 whitespace-nowrap shrink-0">
          <span className="font-medium">{dateLabel}</span>
          <span className="text-slate-300">|</span>
          <span>{trackDisplay} R{result.race_number}</span>
        </div>
      </div>

      {/* Row 2: Grade badge + Race name + details | Margin, Chart */}
      <div className="flex items-baseline justify-between gap-4 mt-1 text-sm text-slate-500">
        <div className="flex items-baseline gap-2 min-w-0">
          {result.stakes_grade && (
            <span className="bg-accent text-white text-xs px-1.5 py-0.5 rounded font-medium relative top-[-1px]">
              {result.stakes_grade}
            </span>
          )}
          {stakesRaceName && (
            <span className={cn(
              "font-medium",
              result.stakes_grade ? "text-accent" : "text-primary"
            )}>{stakesRaceName}</span>
          )}
          {stakesRaceName && <span className="text-slate-300">|</span>}
          {result.race_type && <span>{result.race_type}</span>}
          {result.purse && (
            <>
              <span className="text-slate-300">|</span>
              <span>${result.purse.toLocaleString()}</span>
            </>
          )}
          {result.distance && (
            <>
              <span className="text-slate-300">|</span>
              <span>{formatDistance(result.distance)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          {isWinner && result.win_margin && (
            <span className="text-green-700 font-medium">Won by {result.win_margin}</span>
          )}
          {!isWinner && result.beaten_lengths && (
            <span>Beaten {result.beaten_lengths}</span>
          )}
          {result.chart_url && (
            <>
              {(result.win_margin || result.beaten_lengths) && <span className="text-slate-300">|</span>}
              <a
                href={result.chart_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Chart
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
