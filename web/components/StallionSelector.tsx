'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
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
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const stallionParam = searchParams.get('stallion')
  const hasFetched = useRef(false)

  // Fetch stallion list on mount via API (auth handled server-side by cookies)
  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    async function fetchStallions() {
      try {
        const res = await fetch('/api/stallions')
        if (res.ok) {
          setStallions(await res.json())
        }
      } catch (error) {
        console.error('Error fetching stallions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStallions()
  }, [])

  // Effect 2: Auto-select stallion when list loads or URL param changes
  useEffect(() => {
    if (stallions.length === 0) return

    if (stallionParam) {
      const urlStallion = stallions.find(s => s.id === stallionParam)
      if (urlStallion) {
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
