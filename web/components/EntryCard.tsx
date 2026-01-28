'use client'

import { cn, cleanRaceName, formatDate, formatDistance, formatHorseDescription, isToday, isTomorrow } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { Entry } from '@/lib/supabase'

interface EntryCardProps {
  entry: Entry
}

// Format track name: "GULFSTREAM PARK" → "Gulfstream Park"
function formatTrack(track: string): string {
  return track
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function EntryCard({ entry }: EntryCardProps) {
  const { profile } = useAuth()
  const horseName = entry.horse_name || `${entry.horse_yob || ''} ${entry.horse_dam || 'Unknown'}`.trim()
  const horseDesc = formatHorseDescription(entry.horse_sex || null, entry.horse_yob || null)

  // Check if the logged-in org owns this horse
  const orgName = profile?.organization?.name
  const silksUrl = profile?.organization?.silks_url
  const showSilks = orgName && silksUrl && entry.owner?.includes(orgName)

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
        'bg-white rounded-lg border border-slate-200 px-4 py-2.5',
        !entry.scratched && borderClass
      )}
    >
      {/* Row 1: Horse name + sex/age | Date, Track, Time */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2 min-w-0">
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
              className="w-7 h-7 object-contain shrink-0 translate-y-[3px]"
            />
          )}
        </div>
        <div className={cn(
          'flex items-center gap-3 text-sm whitespace-nowrap shrink-0',
          entry.scratched ? 'text-slate-400' : 'text-slate-600'
        )}>
          <span className="font-medium">{dateLabel}</span>
          <span className={entry.scratched ? 'text-slate-300' : 'text-slate-300'}>|</span>
          <span>{trackDisplay} R{entry.race_number}</span>
          {entry.post_time && (
            <>
              <span className="text-slate-300">|</span>
              <span>{entry.post_time} {entry.timezone}</span>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Grade badge + Race name + details | Trainer, Jockey */}
      <div className={cn(
        'flex items-baseline justify-between gap-4 mt-1 text-sm',
        entry.scratched ? 'text-slate-400' : 'text-slate-500'
      )}>
        <div className="flex items-baseline gap-2 min-w-0">
          {entry.stakes_grade && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded font-medium relative top-[-1px]',
              entry.scratched ? 'bg-slate-300 text-slate-500' : 'bg-accent text-white'
            )}>
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
          {stakesRaceName && <span className="text-slate-300">|</span>}
          {entry.race_type && <span>{entry.race_type}</span>}
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
        {(entry.trainer || entry.jockey) && (
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0 text-slate-500">
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
    </div>
  )
}
