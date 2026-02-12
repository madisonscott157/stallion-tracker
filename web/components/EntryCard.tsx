'use client'

import { cn, cleanRaceName, formatDate, formatDistance, formatHorseDescription, formatTrack, shouldShowSilks, isToday, isTomorrow } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { Entry } from '@/lib/supabase'

interface EntryCardProps {
  entry: Entry
}

export function EntryCard({ entry }: EntryCardProps) {
  const { profile, allOrgsWithSilks } = useAuth()
  const horseName = entry.horse_name || `${entry.horse_yob || ''} ${entry.horse_dam || 'Unknown'}`.trim()
  const horseDesc = formatHorseDescription(entry.horse_sex || null, entry.horse_yob || null)

  const { show: showSilks, silksUrl } = shouldShowSilks(profile?.organization, entry.owner, allOrgsWithSilks)

  const dateLabel = isToday(entry.race_date)
    ? 'Today'
    : isTomorrow(entry.race_date)
    ? 'Tomorrow'
    : formatDate(entry.race_date)

  // Clean stakes race name (remove STAKES prefix and sponsor info)
  const stakesRaceName = entry.is_stakes && entry.race_name
    ? cleanRaceName(entry.race_name.replace(/^STAKES\s*/i, '').trim())
    : null

  const trackDisplay = formatTrack(entry.track)
  const distanceDisplay = formatDistance(entry.distance || null)

  // Determine border color based on stakes status
  const borderClass = entry.stakes_grade
    ? 'border-l-4 border-l-accent'  // Graded stakes: orange
    : entry.is_stakes
    ? 'border-l-4 border-l-primary' // Non-graded stakes: navy
    : ''                             // Non-stakes: no colored border

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5',
        !entry.scratched && borderClass
      )}
    >
      {/* Row 1: Horse name + sex/age - baseline aligned */}
      <div className="flex items-baseline gap-2">
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
          <span className="text-xs font-semibold text-slate-400 shrink-0">SCR</span>
        )}
        {horseDesc && (
          <span className={cn(
            'text-sm',
            entry.scratched ? 'text-slate-300' : 'text-slate-400'
          )}>{horseDesc}</span>
        )}
        {showSilks && (
          <img
            src={silksUrl}
            alt="Silks"
            className="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0 relative -top-0.5"
          />
        )}
      </div>

      {/* Row 2: Date, Track, Time, Race details */}
      <div className={cn(
        'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 -mt-0.5 sm:mt-1 text-sm',
        entry.scratched ? 'text-slate-400' : 'text-slate-500'
      )}>
        <span className={cn('font-medium', entry.scratched ? 'text-slate-400' : 'text-slate-600')}>{dateLabel}</span>
        <span className="text-slate-300">|</span>
        <span>{trackDisplay} R{entry.race_number}</span>
        {entry.post_time && (
          <>
            <span className="text-slate-300">|</span>
            <span>{entry.post_time} {entry.timezone}</span>
          </>
        )}
        {entry.race_type && (
          <>
            <span className="text-slate-300">|</span>
            <span>{entry.race_type}</span>
          </>
        )}
        {entry.purse && (
          <>
            <span className="text-slate-300">|</span>
            <span>${entry.purse.toLocaleString()}</span>
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
          {entry.stakes_grade && (
            <span className={cn(
              'text-xs rounded font-medium inline-flex items-center justify-center',
              entry.scratched ? 'bg-slate-300 text-slate-500' : 'bg-accent text-white'
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
                  entry.stakes_grade === 'G1' ? "text-gold-border" :
                  entry.stakes_grade === 'G2' ? "text-silver-border" :
                  entry.stakes_grade ? "text-accent" : ""
                )}
                style={!entry.stakes_grade ? { color: 'var(--org-primary)' } : undefined}
              >
                {stakesRaceName}
              </a>
            ) : (
              <span className={cn(
                "font-medium",
                entry.scratched ? "text-slate-400" :
                entry.stakes_grade === 'G1' ? "text-gold-border" :
                entry.stakes_grade === 'G2' ? "text-silver-border" :
                entry.stakes_grade ? "text-accent" : "text-slate-900"
              )}>{stakesRaceName}</span>
            )
          )}
        </div>
      )}

      {/* Row 4: Trainer, Jockey (hidden on small mobile) */}
      {(entry.trainer || entry.jockey) && (
        <div className="hidden sm:flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-slate-500">
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
}
