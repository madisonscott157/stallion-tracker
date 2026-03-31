'use client'

import { formatDate, formatDistance, formatTrack, shouldShowSilks } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { Workout } from '@/lib/supabase'

interface WorkoutCardProps {
  workout: Workout
  showSireName?: boolean
}

function cleanWorkoutTrack(track: string | null): string {
  if (!track) return ''
  let cleaned = track.split(/Distance:|Time:|Track Condition:/i)[0]?.trim() || track
  cleaned = cleaned.replace(/\s*(Training Center|Farm|Equestrian Center)\s*/gi, '').trim()
  return formatTrack(cleaned)
}

export function WorkoutCard({ workout, showSireName }: WorkoutCardProps) {
  const { profile, allOrgsWithSilks, isAdmin } = useAuth()

  // Show name, or "YOB Dam" if unnamed
  const displayName = workout.horse_name
    ? workout.horse_name
    : `${workout.horse_yob || ''} ${workout.horse_dam || 'Unknown'}`.trim()

  const { show: showSilks, silksUrls } = shouldShowSilks(profile?.organization, workout.owner, allOrgsWithSilks, isAdmin)
  const track = cleanWorkoutTrack(workout.track)
  const distance = formatDistance(workout.distance)
  const surface = workout.surface?.split(/Rank:/i)[0]?.trim()
  const rank = workout.rank_position && workout.rank_total
    ? `${workout.rank_position}/${workout.rank_total}`
    : null

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5">
      {/* Row 1: Horse name + silks */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {workout.horse_profile_url ? (
          <a
            href={workout.horse_profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
            style={{ color: 'var(--org-primary)' }}
          >
            {displayName}
          </a>
        ) : (
          <span className="font-medium text-slate-900">{displayName}</span>
        )}
        {showSireName && workout.sire_name && (
          <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 relative top-[-1px]">{workout.sire_name}</span>
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
      {/* Row 2: Workout details */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 -mt-0.5 sm:mt-1 text-sm text-slate-500">
        <span className="font-medium text-slate-600">{formatDate(workout.workout_date)}</span>
        <span className="text-slate-300">|</span>
        <span>{track}</span>
        {distance && (
          <>
            <span className="text-slate-300">|</span>
            <span>{distance}</span>
          </>
        )}
        {workout.time && (
          <>
            <span className="text-slate-300">|</span>
            <span>{workout.time}</span>
          </>
        )}
        {surface && (
          <>
            <span className="text-slate-300">|</span>
            <span>{surface}</span>
          </>
        )}
        {rank && (
          <>
            <span className="text-slate-300">|</span>
            <span>{rank}</span>
          </>
        )}
      </div>
    </div>
  )
}
