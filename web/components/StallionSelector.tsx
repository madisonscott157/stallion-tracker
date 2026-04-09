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
  const selectRef = useRef<HTMLSelectElement>(null)

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

  const canSwitch = stallions.length > 1 || isAdmin

  return (
    <button
      className="flex items-baseline gap-1 group"
      style={{ color: 'var(--org-secondary)' }}
      onClick={() => canSwitch && selectRef.current?.showPicker()}
      aria-label="Switch stallion"
    >
      <span className="text-base sm:text-lg font-semibold tracking-wide truncate">
        {(displayName || '').toUpperCase()}
      </span>
      {canSwitch && (
        <svg className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 translate-y-[-1px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {canSwitch && (
        <select
          ref={selectRef}
          value={value || ''}
          onChange={(e) => {
            const stallion = stallions.find(s => s.id === e.target.value)
            if (stallion) onChange(stallion.id, stallion.name)
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          {stallions.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </button>
  )
}
