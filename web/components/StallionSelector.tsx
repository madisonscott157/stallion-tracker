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
  displayName?: string
}

export function StallionSelector({ value, onChange, displayName }: StallionSelectorProps) {
  const [stallions, setStallions] = useState<Stallion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const stallionParam = searchParams.get('stallion')
  const hasFetched = useRef(false)

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

  const canSwitch = stallions.length > 1 || isAdmin

  if (!canSwitch) {
    return (
      <span
        className="text-base sm:text-lg font-semibold tracking-wide truncate max-w-full"
        style={{ color: 'var(--org-secondary, #64748b)' }}
      >
        {(displayName || '').toUpperCase()}
      </span>
    )
  }

  return (
    <div className="relative flex items-center min-w-0 max-w-full">
      <select
        value={value || ''}
        onChange={(e) => {
          const stallion = stallions.find(s => s.id === e.target.value)
          if (stallion) onChange(stallion.id, stallion.name)
        }}
        className="appearance-none bg-transparent border-none text-base sm:text-lg font-semibold tracking-wide cursor-pointer focus:outline-none pr-5 min-w-0 max-w-full"
        style={{ color: 'var(--org-secondary, #64748b)' }}
        aria-label="Switch stallion"
      >
        {stallions.map(s => (
          <option key={s.id} value={s.id} className="text-slate-900 bg-white">
            {s.name.toUpperCase()}
          </option>
        ))}
      </select>
      <svg
        className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
        style={{ color: 'var(--org-secondary, #64748b)' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}
