'use client'

import { useEffect, useState, useRef } from 'react'
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
  const hasFetched = useRef(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!profile || hasFetched.current) return
    hasFetched.current = true

    async function fetchStallions() {
      let stallionList: Stallion[] = []

      // Always start with org-linked stallions (works with RLS)
      if (profile!.organization?.id) {
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

      // For admin, also try to get all stallions via API
      if (isAdmin) {
        try {
          const res = await fetch('/api/stallions')
          if (res.ok) {
            const allStallions: Stallion[] = await res.json()
            if (allStallions.length > stallionList.length) {
              stallionList = allStallions
            }
          }
        } catch {
          // API failed, stick with org stallions
        }
      }

      setStallions(stallionList)

      // Auto-select first stallion if none selected
      if (!value && stallionList.length > 0) {
        onChange(stallionList[0].id, stallionList[0].name)
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
