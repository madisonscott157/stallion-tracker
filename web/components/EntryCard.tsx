'use client'

import { memo } from 'react'
import { cn, cleanRaceName, formatDate, formatDistance, formatHorseDescription, formatTrack, shouldShowSilks, isToday, isTomorrow, buildEquibaseRaceUrl } from '@/lib/utils'
import { convertPostTimeToET } from '@/lib/timezones'
import { formatPurse } from '@/lib/currency'
import { useAuth } from '@/lib/auth-context'
import type { Entry } from '@/lib/supabase'

interface EntryCardProps {
  entry: Entry
  showSireName?: boolean
}

export const EntryCard = memo(function EntryCard({ entry, showSireName }: EntryCardProps) {
  const { profile, allOrgsWithSilks, isAdmin } = useAuth()
  const horseName = entry.horse_name || `${entry.horse_yob || ''} ${entry.horse_dam || 'Unknown'}`.trim()
  const horseDesc = formatHorseDescription(entry.horse_sex || null, entry.horse_yob || null)

  const { show: showSilks, silksUrls } = shouldShowSilks(profile?.organization, entry.owner, allOrgsWithSilks, isAdmin)

  // Convert post time to ET. For zones east of ET (Asia, Gulf), the ET
  // calendar date can fall a day BEFORE the source race_date — e.g. a Tokyo
  // 10:00 race on Nov 23 is Nov 22 21:00 ET. We use the converted ET date
  // for the displayed label so users don't see "Nov 23 | 9:00 PM ET" for a
  // race that is, in their timezone, a Nov 22 evening event.
  const etConverted = entry.post_time
    ? convertPostTimeToET(entry.post_time, entry.race_date, entry.race_country, entry.timezone)
    : null
  const displayDate = etConverted?.etDate ?? entry.race_date
  const dateLabel = isToday(displayDate)
    ? 'Today'
    : isTomorrow(displayDate)
    ? 'Tomorrow'
    : formatDate(displayDate)

  // Clean stakes race name (remove STAKES prefix and sponsor info)
  const stakesRaceName = entry.is_stakes && entry.race_name
    ? cleanRaceName(entry.race_name.replace(/^STAKES\s*/i, '').trim())
    : null

  const trackDisplay = formatTrack(entry.track)
  const distanceDisplay = formatDistance(entry.distance || null, entry.race_country)

  // 'Listed' is treated visually like a non-graded stakes — no pill, navy
  // accents — to match Equibase / TDN convention where only G1/G2/G3 get
  // a colored grade badge.
  const isGraded = entry.stakes_grade != null && entry.stakes_grade !== 'Listed'
  const showGradeBadge = isGraded
  const gradedAccent = isGraded
    ? entry.stakes_grade === 'G1' ? 'text-gold-border'
    : entry.stakes_grade === 'G2' ? 'text-silver-border'
    : 'text-accent'
    : ''

  // Determine border color based on stakes status
  const borderClass = isGraded
    ? 'border-l-4 border-l-accent'  // Graded stakes: orange
    : entry.is_stakes
    ? 'border-l-4 border-l-primary' // Non-graded stakes (incl. Listed): navy
    : ''                             // Non-stakes: no colored border

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 card-hover',
        !entry.scratched && borderClass
      )}
    >
      {/* Row 1: Horse name + sex/age + silks */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {entry.horse_profile_url && !entry.scratched ? (
          <a
            href={entry.horse_profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-900 hover:underline"
            style={{ color: 'var(--org-primary)' }}
          >
            {horseName}
          </a>
        ) : (
          <span className={cn(
            'font-medium',
            entry.scratched ? 'text-slate-400' : 'text-slate-900'
          )}>
            {horseName}
          </span>
        )}
        {entry.scratched && (
          <span className="text-xs font-semibold text-slate-400">SCR</span>
        )}
        {horseDesc && (
          <span className={cn(
            'text-sm',
            entry.scratched ? 'text-slate-300' : 'text-slate-400'
          )}>{horseDesc}</span>
        )}
        {showSireName && entry.sire_name && (
          <span className={cn('text-xs font-medium rounded px-1.5 py-0.5 relative top-[-1px]', entry.scratched ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-600')}>{entry.sire_name}</span>
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

      {/* Row 2: Date, Track, Time, Race details */}
      <div className={cn(
        'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 -mt-0.5 sm:mt-1 text-sm',
        entry.scratched ? 'text-slate-400' : 'text-slate-500'
      )}>
        <span className={cn('font-medium', entry.scratched ? 'text-slate-400' : 'text-slate-600')}>{dateLabel}</span>
        <span className="text-slate-300">|</span>
        {(() => {
          const trackText = `${trackDisplay} R${entry.race_number}`
          const raceUrl = entry.entries_url
            ?? buildEquibaseRaceUrl(entry.track_code, entry.race_date, entry.race_country, entry.race_number)
          return raceUrl && !entry.scratched ? (
            <a href={raceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{trackText}</a>
          ) : (
            <span>{trackText}</span>
          )
        })()}
        {entry.post_time && (
          <>
            <span className="text-slate-300">|</span>
            <span>{etConverted?.time ?? `${entry.post_time} ${entry.timezone}`}</span>
          </>
        )}
        {entry.race_type && (
          <>
            <span className="text-slate-300">|</span>
            <span>{entry.race_type}</span>
          </>
        )}
        {entry.purse != null && (
          <>
            <span className="text-slate-300">|</span>
            <span>{formatPurse(entry.purse, entry.purse_currency)}</span>
          </>
        )}
        {distanceDisplay && (
          <>
            <span className="text-slate-300">|</span>
            <span>{distanceDisplay}</span>
          </>
        )}
        {entry.surface && (
          <>
            <span className="text-slate-300">|</span>
            <span>{entry.surface}</span>
          </>
        )}
      </div>

      {/* Row 3: Stakes info (only shown for stakes races) */}
      {(entry.stakes_grade || stakesRaceName) && (
        <div className={cn(
          'flex flex-wrap items-center gap-1 sm:gap-2 -mt-0.5 sm:mt-1 text-sm',
          entry.scratched ? 'text-slate-400' : 'text-slate-500'
        )}>
          {showGradeBadge && (
            <span className={cn(
              'text-xs rounded font-medium inline-flex items-center justify-center text-white',
              entry.scratched
                ? 'bg-slate-300 text-slate-500'
                : entry.stakes_grade === 'G1' ? 'bg-gold'
                : entry.stakes_grade === 'G2' ? 'bg-silver'
                : 'bg-accent'
            )} style={{ minWidth: '1.75rem', height: '1.25rem', lineHeight: 1, paddingLeft: '0.375rem', paddingRight: '0.375rem' }}>
              {entry.stakes_grade}
            </span>
          )}
          {stakesRaceName && (
            entry.entries_url && !entry.scratched ? (
              <a
                href={entry.entries_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "font-medium hover:underline",
                  isGraded ? gradedAccent : ""
                )}
                style={!isGraded ? { color: 'var(--org-primary)' } : undefined}
              >
                {stakesRaceName}
              </a>
            ) : (
              <span className={cn(
                "font-medium",
                entry.scratched ? "text-slate-400" :
                isGraded ? gradedAccent : "text-slate-900"
              )}
                style={!entry.scratched && !isGraded ? { color: 'var(--org-primary)' } : undefined}
              >{stakesRaceName}</span>
            )
          )}
        </div>
      )}

      {/* Row 4: Trainer, Jockey */}
      {(entry.trainer || entry.jockey) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 -mt-0.5 sm:mt-1 text-sm text-slate-500">
          {entry.trainer && <span>T: {entry.trainer}</span>}
          {entry.jockey && (
            <>
              {entry.trainer && <span className="text-slate-300">|</span>}
              <span>J: {entry.jockey}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
})
