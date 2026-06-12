'use client'

import { memo } from 'react'
import { cn, cleanRaceName, formatDistance, formatHorseDescription, formatDate, formatOrdinal, formatTrack, shouldShowSilks, isToday, isTomorrow, buildEquibaseRaceUrl } from '@/lib/utils'
import { formatPurse } from '@/lib/currency'
import { useAuth } from '@/lib/auth-context'
import type { Result } from '@/lib/supabase'

interface ResultCardProps {
  result: Result
  showSireName?: boolean
  // When the surrounding section is "all winners" (e.g. dashboard Recent
  // Winners), the amber/gold background on every card becomes visual noise.
  // Setting this true keeps the gold left border + WIN badge but renders the
  // card body white so the list reads cleanly.
  suppressWinHighlight?: boolean
}

export const ResultCard = memo(function ResultCard({ result, showSireName, suppressWinHighlight }: ResultCardProps) {
  const { profile, allOrgsWithSilks, isAdmin } = useAuth()
  const horseName = result.horse_name || 'Unknown'
  const horseDesc = formatHorseDescription(result.horse_sex || null, result.horse_yob || null)
  const isWinner = result.finish_position === 1

  const { show: showSilks, silksUrls } = shouldShowSilks(profile?.organization, result.owner, allOrgsWithSilks, isAdmin)

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
  const isThird = result.finish_position === 3
  const isG1 = result.stakes_grade === 'G1'
  const isG2 = result.stakes_grade === 'G2'
  // 'Listed' is treated visually like a non-graded stakes — no pill, navy
  // accents — matching Equibase / TDN convention where only G1/G2/G3 are
  // "graded".
  const isGraded = result.stakes_grade != null && result.stakes_grade !== 'Listed'

  // Determine border color:
  // - WIN or G1: gold
  // - 2nd place or G2: silver
  // - 3rd place: bronze
  // - G3: accent (orange)
  // - Listed / non-graded stakes: navy
  // - Other: no border
  let borderClass = ''
  if (isWinner || isG1) {
    borderClass = 'border-l-4 border-l-gold-border'
  } else if (isSecond || isG2) {
    borderClass = 'border-l-4 border-l-silver-border'
  } else if (isThird) {
    borderClass = 'border-l-4 border-l-bronze-border'
  } else if (isGraded) {
    borderClass = 'border-l-4 border-l-accent'
  } else if (result.is_stakes) {
    borderClass = 'border-l-4 border-l-primary'
  }

  return (
    <div
      className={cn(
        'rounded-lg border px-2 sm:px-4 py-1.5 sm:py-2.5 card-hover',
        isWinner && !suppressWinHighlight
          ? 'bg-amber-50/60 border-gold/30 shadow-[0_1px_4px_rgba(212,175,55,0.15)] card-hover-white'
          : isSecond
          ? 'bg-slate-50/60 border-silver/30 shadow-[0_1px_4px_rgba(168,169,173,0.15)] card-hover-white'
          : isThird
          ? 'bg-orange-50/40 border-bronze/30 shadow-[0_1px_4px_rgba(205,127,50,0.15)] card-hover-white'
          : 'bg-white border-slate-200',
        borderClass
      )}
    >
      {/* Row 1: Position + Horse name + sex/age + silks */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {isWinner ? (
          <span className="bg-gold text-white text-xs rounded font-medium px-1.5 py-0.5 relative top-[-1px]">
            WIN
          </span>
        ) : isSecond ? (
          <span className="bg-silver text-white text-xs rounded font-medium px-1.5 py-0.5 relative top-[-1px]">
            2nd
          </span>
        ) : isThird ? (
          <span className="bg-bronze text-white text-xs rounded font-medium px-1.5 py-0.5 relative top-[-1px]">
            3rd
          </span>
        ) : (
          <span className="text-slate-500 text-sm font-medium">
            {result.finish_position && result.finish_position > 0
              ? formatOrdinal(result.finish_position)
              : (result.finish_status || '-')}
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
        {showSireName && result.sire_name && (
          <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 relative top-[-1px]">{result.sire_name}</span>
        )}
        {showSilks && silksUrls.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt="Silks"
            className="h-5 sm:h-6 w-auto object-contain relative top-[4px]"
          />
        ))}
      </div>

      {/* Row 2: Date, Track, Race info */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 -mt-0.5 sm:mt-1 text-sm text-slate-500">
        <span className="font-medium text-slate-600">{dateLabel}</span>
        <span className="text-slate-300">|</span>
        {(() => {
          const trackText = `${trackDisplay} R${result.race_number}`
          const raceUrl = buildEquibaseRaceUrl(result.track_code, result.race_date, result.race_country, result.race_number)
          return raceUrl ? (
            <a href={raceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{trackText}</a>
          ) : (
            <span>{trackText}</span>
          )
        })()}
        {result.race_type && (
          <>
            <span className="text-slate-300">|</span>
            <span className={cn(isStakesWinner && "font-semibold text-slate-700")}>{result.race_type}</span>
          </>
        )}
        {(() => {
          // For European rows (PMU / Racing API), `purse` holds the total race
          // pot and `earnings` holds the horse's individual cut once Arion has
          // enriched the row. For US/CA rows, the chart-scraper parser writes
          // the horse's earnings directly into `purse` and leaves `earnings`
          // null. Prefer `earnings` when present so we always show the horse's
          // share rather than the race purse.
          const amt = result.earnings ?? result.purse
          const ccy = result.earnings != null ? result.earnings_currency : result.purse_currency
          if (amt == null) return null
          return (
            <>
              <span className="text-slate-300">|</span>
              <span>{formatPurse(amt, ccy)}</span>
            </>
          )
        })()}
        {result.distance && (
          <>
            <span className="text-slate-300">|</span>
            <span>{formatDistance(result.distance, result.race_country)}</span>
          </>
        )}
        {result.surface && (
          <>
            <span className="text-slate-300">|</span>
            <span>{result.surface}</span>
          </>
        )}
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

      {/* Row 3: Stakes info + Win margin */}
      {(result.stakes_grade || stakesRaceName || (isWinner && result.win_margin)) && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 -mt-0.5 sm:mt-1 text-sm">
          {isGraded && (
            <span className={cn(
              "text-white text-xs rounded font-medium inline-flex items-center justify-center",
              isG1 ? "bg-gold" : isG2 ? "bg-silver" : "bg-accent"
            )} style={{ minWidth: '1.75rem', height: '1.25rem', lineHeight: 1, paddingLeft: '0.375rem', paddingRight: '0.375rem' }}>
              {result.stakes_grade}
            </span>
          )}
          {stakesRaceName && (
            <span className={cn(
              "font-medium",
              isStakesWinner && "font-bold",
              isG1 ? "text-gold-border" : isG2 ? "text-silver-border" : isGraded ? "text-accent" : ""
            )}
              style={!isGraded ? { color: 'var(--org-primary)' } : undefined}
            >{stakesRaceName}</span>
          )}
          {isWinner && result.win_margin && (
            <>
              {(result.stakes_grade || stakesRaceName) && <span className="text-slate-300">|</span>}
              <span className={cn(
                "text-green-700 font-medium",
                isStakesWinner && "font-bold"
              )}>Won by {result.win_margin}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
})
