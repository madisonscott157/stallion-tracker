'use client'

import { useState, useEffect, useMemo } from 'react'
import { WorkoutCard } from '@/components/WorkoutCard'
import { formatTrack } from '@/lib/utils'
import type { Workout } from '@/lib/supabase'

interface WorkoutsSectionProps {
  stallion: string
}

function cleanTrackForFilter(track: string | null): string {
  if (!track) return ''
  let cleaned = track.split(/Distance:|Time:|Track Condition:/i)[0]?.trim() || track
  cleaned = cleaned.replace(/\s*(Training Center|Farm|Equestrian Center)\s*/gi, '').trim()
  return cleaned
}

export function WorkoutsSection({ stallion }: WorkoutsSectionProps) {
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [trackFilter, setTrackFilter] = useState('')

  useEffect(() => {
    async function fetchWorkouts() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ stallion, limit: '100' })
        const res = await fetch(`/api/workouts?${params}`)
        if (res.ok) {
          const data = await res.json()
          setAllWorkouts(data)
        }
      } catch (error) {
        console.error('Error fetching workouts:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchWorkouts()
  }, [stallion])

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
    <section className="mb-8 border-t border-slate-200 pt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-header mb-0">Recent Workouts</h2>
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

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading workouts...</div>
      ) : workouts.length > 0 ? (
        <div className="card-stack">
          {workouts.map(workout => (
            <WorkoutCard key={workout.id} workout={workout} />
          ))}
        </div>
      ) : (
        <p className="empty-state">
          {trackFilter ? 'No workouts at this track' : 'No recent workouts'}
        </p>
      )}
    </section>
  )
}
