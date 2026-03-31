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

  useEffect(() => {
    if (!profile || hasFetched.current) return
    hasFetched.current = true

    async function fetchStallions() {
      let stallionList: Stallion[] = []

      if (isAdmin) {
        // Admin: fetch org stallions and all stallions in parallel, use whichever is larger
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

      // Auto-select: prefer URL param, then first stallion
      if (!value && stallionList.length > 0) {
        const urlStallion = stallionParam
          ? stallionList.find(s => s.id === stallionParam)
          : null
        const pick = urlStallion || stallionList[0]
        onChange(pick.id, pick.name)
      }

      setIsLoading(false)
    }

    fetchStallions()
  }, [profile])

  if (isLoading) return null
  if (stallions.length <= 1 && !isAdmin) return null

  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const stallion = stallions.find(s => s.id === e.target.value)
        if (stallion) onChange(stallion.id, stallion.name)
      }}
      className="px-3 py-1.5 text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-white/30"
    >
      {stallions.map(s => (
        <option key={s.id} value={s.id} className="text-slate-900 bg-white">
          {s.name}
        </option>
      ))}
    </select>
  )
}
