'use client'

import { useState, useMemo } from 'react'
import { WorkoutCard } from '@/components/WorkoutCard'
import { formatTrack } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'
import type { Workout } from '@/lib/supabase'

interface WorkoutsSectionProps {
  workouts: Workout[]
}

function cleanTrackForFilter(track: string | null): string {
  if (!track) return ''
  let cleaned = track.split(/Distance:|Time:|Track Condition:/i)[0]?.trim() || track
  cleaned = cleaned.replace(/\s*(Training Center|Farm|Equestrian Center)\s*/gi, '').trim()
  return cleaned
}

export function WorkoutsSection({ workouts: allWorkouts }: WorkoutsSectionProps) {
  const [trackFilter, setTrackFilter] = useState('')

  // Get unique tracks for dropdown from all workouts
  const uniqueTracks = useMemo(() => {
    const tracks = new Set<string>()
    allWorkouts.forEach(w => {
      const cleaned = cleanTrackForFilter(w.track)
      if (cleaned) tracks.add(cleaned)
    })
    return Array.from(tracks).sort()
  }, [allWorkouts])

  // Filter workouts client-side
  const workouts = useMemo(() => {
    if (!trackFilter) return allWorkouts
    return allWorkouts.filter(w => {
      const cleaned = cleanTrackForFilter(w.track)
      return cleaned.toLowerCase().includes(trackFilter.toLowerCase())
    })
  }, [allWorkouts, trackFilter])

  return (
    <section className="mb-6 sm:mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="section-header !mb-0">Recent Workouts</h2>
        <select
          value={trackFilter}
          onChange={e => setTrackFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">All Tracks</option>
          {uniqueTracks.map(track => (
            <option key={track} value={track}>{formatTrack(track)}</option>
          ))}
        </select>
      </div>

      {workouts.length > 0 ? (
        <div className="card-stack">
          {workouts.map(workout => (
            <WorkoutCard key={workout.id} workout={workout} />
          ))}
        </div>
      ) : (
        <EmptyState variant="workouts" message={trackFilter ? 'No workouts at this track' : 'No recent workouts'} />
      )}
    </section>
  )
}
