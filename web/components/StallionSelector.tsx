'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

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

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    async function fetchStallions() {
      if (!profile) {
        setIsLoading(false)
        return
      }

      try {
        const res = await fetch('/api/stallions')
        if (res.ok) {
          const data = await res.json()
          setStallions(data)
          if (!value && data.length > 0) {
            onChange(data[0].id, data[0].name)
          }
        }
      } catch (err) {
        console.error('Failed to fetch stallions:', err)
      }
      setIsLoading(false)
    }

    if (profile) {
      fetchStallions()
    }
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
