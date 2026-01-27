'use client'

import { formatDate, formatDistance } from '@/lib/utils'
import type { Workout } from '@/lib/supabase'

interface WorkoutCardProps {
  workout: Workout
}

// Convert track name: "PAYSON PARK TRAINING CENTER" → "Payson Park"
function formatTrack(track: string | null): string {
  if (!track) return ''

  // Clean garbage from parsing issues
  let cleaned = track.split(/Distance:|Time:|Track Condition:/i)[0]?.trim() || track

  // Remove "Training Center", "Farm", etc.
  cleaned = cleaned.replace(/\s*(Training Center|Farm|Equestrian Center)\s*/gi, '')

  // Convert to Title Case
  return cleaned
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()
}

export function WorkoutCard({ workout }: WorkoutCardProps) {
  // Show name, or "YOB Dam" if unnamed
  const displayName = workout.horse_name
    ? workout.horse_name
    : `${workout.horse_yob || ''} ${workout.horse_dam || 'Unknown'}`.trim()

  const track = formatTrack(workout.track)
  const distance = formatDistance(workout.distance)
  const surface = workout.surface?.split(/Rank:/i)[0]?.trim()
  const rank = workout.rank_position && workout.rank_total
    ? `${workout.rank_position}/${workout.rank_total}`
    : null

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-4">
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
          <h3 className="font-medium text-slate-900">{displayName}</h3>
        )}
        <div className="flex items-center gap-3 text-sm text-slate-600 whitespace-nowrap shrink-0">
          <span>{formatDate(workout.workout_date)}</span>
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
    </div>
  )
}
