'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { createClientComponentClient } from '@/lib/supabase'

interface Stallion {
  id: string
  name: string
}

interface StallionSelectorProps {
  value: string | null
  onChange: (stallionId: string, stallionName: string) => void
}

export function StallionSelector({ value, onChange }: StallionSelectorProps) {
  const [stallions, setStallions] = useState<Stallion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { profile } = useAuth()
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const stallionParam = searchParams.get('stallion')
  const hasFetched = useRef(false)

  const isAdmin = profile?.role === 'admin'

  // Effect 1: Fetch stallion list when profile becomes available
  useEffect(() => {
    if (!profile || hasFetched.current) return
    hasFetched.current = true

    async function fetchStallions() {
      try {
        let stallionList: Stallion[] = []

        if (isAdmin) {
          const [orgResult, apiResult] = await Promise.allSettled([
            profile!.organization?.id
              ? supabase
                  .from('organization_stallions')
                  .select('stallion_id, stallions(id, name)')
                  .eq('organization_id', profile!.organization.id)
              : Promise.resolve({ data: null, error: null }),
            fetch('/api/stallions').then(r => r.ok ? r.json() : []),
          ])

          const orgStallions = orgResult.status === 'fulfilled' && orgResult.value?.data
            ? (orgResult.value.data as any[])
                .map(os => os.stallions as unknown as Stallion)
                .filter(Boolean)
                .sort((a, b) => a.name.localeCompare(b.name))
            : []
          const apiStallions: Stallion[] = apiResult.status === 'fulfilled' ? apiResult.value : []
          stallionList = apiStallions.length > orgStallions.length ? apiStallions : orgStallions
        } else if (profile!.organization?.id) {
          const { data, error } = await supabase
            .from('organization_stallions')
            .select('stallion_id, stallions(id, name)')
            .eq('organization_id', profile!.organization.id)

          if (!error && data) {
            stallionList = data
              .map(os => os.stallions as unknown as Stallion)
              .filter(Boolean)
              .sort((a, b) => a.name.localeCompare(b.name))
          }
        }

        setStallions(stallionList)
      } catch (error) {
        console.error('Error fetching stallions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStallions()
  }, [profile])

  // Effect 2: Auto-select stallion when list loads or URL param changes
  useEffect(() => {
    if (stallions.length === 0) return

    if (stallionParam) {
      const urlStallion = stallions.find(s => s.id === stallionParam)
      if (urlStallion && urlStallion.id !== value) {
        onChange(urlStallion.id, urlStallion.name)
      }
    } else if (!value) {
      onChange(stallions[0].id, stallions[0].name)
    }
  }, [stallions, stallionParam])

  if (isLoading) return null
  if (stallions.length <= 1 && !isAdmin) return null

  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const stallion = stallions.find(s => s.id === e.target.value)
        if (stallion) onChange(stallion.id, stallion.name)
      }}
      className="px-3 py-1.5 text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-white/30 max-w-[160px] sm:max-w-none truncate"
    >
      {stallions.map(s => (
        <option key={s.id} value={s.id} className="text-slate-900 bg-white">
          {s.name}
        </option>
      ))}
    </select>
  )
}
