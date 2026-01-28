'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    async function fetchStallions() {
      if (!profile?.organization?.id) {
        setIsLoading(false)
        return
      }

      // Get stallions linked to user's organization
      const { data, error } = await supabase
        .from('organization_stallions')
        .select('stallion_id, stallions(id, name)')
        .eq('organization_id', profile.organization.id)
        .order('stallions(name)')

      if (!error && data) {
        const orgStallions = data
          .map(os => os.stallions as unknown as Stallion)
          .filter(Boolean)
        setStallions(orgStallions)
        // Auto-select first stallion if none selected
        if (!value && orgStallions.length > 0) {
          onChange(orgStallions[0].id, orgStallions[0].name)
        }
      }
      setIsLoading(false)
    }

    if (profile) {
      fetchStallions()
    }
  }, [profile, value, onChange, supabase])

  if (isLoading) return null
  if (stallions.length <= 1) return null // Don't show selector if only one stallion

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
