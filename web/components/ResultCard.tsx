'use client'

import { cn, cleanRaceName, formatDistance, formatHorseDescription, formatDate, formatOrdinal, formatTrack, shouldShowSilks, isToday, isTomorrow } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { Result } from '@/lib/supabase'

interface ResultCardProps {
  result: Result
}

export function ResultCard({ result }: ResultCardProps) {
  const { profile, allOrgsWithSilks } = useAuth()
  const horseName = result.horse_name || 'Unknown'
  const horseDesc = formatHorseDescription(result.horse_sex || null, result.horse_yob || null)
  const isWinner = result.finish_position === 1
  const isTopThree = result.finish_position <= 3

  const { show: showSilks, silksUrl } = shouldShowSilks(profile?.organization, result.owner, allOrgsWithSilks)

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
        'bg-white rounded-lg border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5',
        borderClass
      )}
    >
      {/* Row 1: Position + Horse name + sex/age + silks - using inline elements for proper vertical-align */}
      <div>
        {isWinner ? (
          <span className="bg-gold text-white text-xs rounded font-medium px-1.5 py-0.5 align-middle">
            WIN
          </span>
        ) : isSecond ? (
          <span className="bg-silver text-white text-xs rounded font-medium px-1.5 py-0.5 align-middle">
            2nd
          </span>
        ) : (
          <span className="text-slate-500 text-sm font-medium align-middle">
            {formatOrdinal(result.finish_position)}
          </span>
        )}
        {result.horse_profile_url ? (
          <a
            href={result.horse_profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline ml-2 align-middle"
            style={{ color: 'var(--org-primary)' }}
          >
            {horseName}
          </a>
        ) : (
          <span className="font-medium text-slate-900 ml-2 align-middle">{horseName}</span>
        )}
        {horseDesc && (
          <span className="text-sm text-slate-400 ml-2 align-middle">{horseDesc}</span>
        )}
        {showSilks && (
          <img
            src={silksUrl}
            alt="Silks"
            className="w-5 h-5 sm:w-6 sm:h-6 object-contain ml-2"
            style={{ verticalAlign: '-5px' }}
          />
        )}
      </div>

      {/* Row 2: Date, Track, Race info + Stakes info */}
      <div className="text-sm text-slate-500 leading-relaxed sm:leading-normal mt-0.5 sm:mt-1">
        <span className="font-medium text-slate-600">{dateLabel}</span>
        <span className="text-slate-300 mx-1">|</span>
        <span>{trackDisplay} R{result.race_number}</span>
        {result.race_type && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            <span className={cn(isStakesWinner && "font-semibold text-slate-700")}>{result.race_type}</span>
          </>
        )}
        {result.purse && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            <span>${result.purse.toLocaleString()}</span>
          </>
        )}
        {result.distance && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            <span>{formatDistance(result.distance)}</span>
          </>
        )}
        {result.chart_url && (
          <>
            <span className="text-slate-300 mx-1">|</span>
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
            <span className="text-slate-300 mx-1">|</span>
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
        {/* Stakes info inline */}
        {(result.stakes_grade || stakesRaceName) && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            {result.stakes_grade && (
              <span className={cn(
                "text-white text-xs rounded font-medium inline-flex items-center justify-center align-middle mr-1",
                isG1 ? "bg-gold" : isG2 ? "bg-silver" : "bg-accent"
              )} style={{ minWidth: '1.75rem', height: '1.25rem', lineHeight: 1, paddingLeft: '0.375rem', paddingRight: '0.375rem' }}>
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
                <span className="text-slate-300 mx-1">|</span>
                <span className={cn(
                  "text-green-700 font-medium",
                  isStakesWinner && "font-bold"
                )}>Won by {result.win_margin}</span>
              </>
            )}
          </>
        )}
        {/* Win margin for non-stakes winners - inline */}
        {isWinner && result.win_margin && !result.is_stakes && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            <span className="text-green-700 font-medium">Won by {result.win_margin}</span>
          </>
        )}
      </div>
    </div>
  )
}
