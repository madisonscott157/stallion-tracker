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
  const isTopThree = result.finish_position <= 3

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

  // Stakes winner should have bold race info
  const isStakesWinner = isWinner && result.is_stakes
  const isSecond = result.finish_position === 2
  const isG1 = result.stakes_grade === 'G1'
  const isG2 = result.stakes_grade === 'G2'

  // Determine border color:
  // - WIN or G1: gold
  // - 2nd place or G2: silver
  // - G3 or other stakes: accent (orange)
  // - Non-graded stakes: navy
  // - Other: no border
  let borderClass = ''
  if (isWinner || isG1) {
    borderClass = 'border-l-4 border-l-gold-border'
  } else if (isSecond || isG2) {
    borderClass = 'border-l-4 border-l-silver-border'
  } else if (result.stakes_grade) {
    borderClass = 'border-l-4 border-l-accent'
  } else if (result.is_stakes) {
    borderClass = 'border-l-4 border-l-primary'
  }

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 px-4 py-2.5',
        borderClass
      )}
    >
      {/* Row 1: Position + Horse name + sex/age + race info | Date, Track, Chart */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          {isWinner ? (
            <span className="bg-gold text-white text-xs px-1.5 py-0.5 rounded font-medium shrink-0 relative top-[-1px]">
              WIN
            </span>
          ) : isSecond ? (
            <span className="bg-silver text-white text-xs px-1.5 py-0.5 rounded font-medium shrink-0 relative top-[-1px]">
              2nd
            </span>
          ) : (
            <span className="text-slate-500 text-sm font-medium shrink-0">
              {formatOrdinal(result.finish_position)}
            </span>
          )}
          {result.horse_profile_url ? (
            <a
              href={result.horse_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
              style={{ color: 'var(--org-primary)' }}
            >
              {horseName}
            </a>
          ) : (
            <span className="font-medium text-slate-900">{horseName}</span>
          )}
          {horseDesc && (
            <span className="text-sm text-slate-400">{horseDesc}</span>
          )}
          {/* Race info inline with horse name */}
          {(result.race_type || result.purse || result.distance) && (
            <>
              <span className="text-slate-300">|</span>
              <span className={cn(
                "text-sm text-slate-500",
                isStakesWinner && "font-semibold text-slate-700"
              )}>
                {[
                  result.race_type,
                  result.purse && `$${result.purse.toLocaleString()}`,
                  result.distance && formatDistance(result.distance)
                ].filter(Boolean).join(' | ')}
              </span>
            </>
          )}
        </div>
        <div className="flex items-baseline gap-3 text-sm text-slate-600 whitespace-nowrap shrink-0">
          <span className="font-medium">{dateLabel}</span>
          <span className="text-slate-300">|</span>
          <span>{trackDisplay} R{result.race_number}</span>
          {result.chart_url && (
            <>
              <span className="text-slate-300">|</span>
              <a
                href={result.chart_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: 'var(--org-primary)' }}
              >
                Chart
              </a>
            </>
          )}
          {result.replay_url && (
            <>
              <span className="text-slate-300">|</span>
              <a
                href={result.replay_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: 'var(--org-primary)' }}
              >
                Replay
              </a>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Stakes info (only shown for stakes races) */}
      {(result.stakes_grade || stakesRaceName) && (
        <div className="flex items-baseline gap-2 mt-1 text-sm">
          {result.stakes_grade && (
            <span className={cn(
              "text-white text-xs px-1.5 py-0.5 rounded font-medium relative top-[-1px]",
              isG1 ? "bg-gold" : isG2 ? "bg-silver" : "bg-accent"
            )}>
              {result.stakes_grade}
            </span>
          )}
          {stakesRaceName && (
            <span className={cn(
              "font-medium",
              isStakesWinner && "font-bold",
              isG1 ? "text-gold-border" : isG2 ? "text-silver-border" : result.stakes_grade ? "text-accent" : ""
            )}
              style={!result.stakes_grade ? { color: 'var(--org-primary)' } : undefined}
            >{stakesRaceName}</span>
          )}
          {isWinner && result.win_margin && (
            <>
              <span className="text-slate-300">|</span>
              <span className={cn(
                "text-green-700 font-medium",
                isStakesWinner && "font-bold"
              )}>Won by {result.win_margin}</span>
            </>
          )}
        </div>
      )}

      {/* Win margin for non-stakes winners */}
      {isWinner && result.win_margin && !result.is_stakes && (
        <div className="mt-1 text-sm">
          <span className="text-green-700 font-medium">Won by {result.win_margin}</span>
        </div>
      )}
    </div>
  )
}
