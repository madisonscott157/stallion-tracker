'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { readToggle, writeToggle } from '@/lib/toggle-storage'

interface StakesToggleProps {
  // Stallion id, or "_dashboard" on the cross-stallion dashboard.
  context: string
  onPreferenceChange: () => void
  className?: string
  checkboxClassName?: string
}

// Stakes-only filter — sticky per-stallion in localStorage, defaults off.
// Always visible (no admin gate).
export function StakesToggle({ context, onPreferenceChange, className, checkboxClassName }: StakesToggleProps) {
  const { profile } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setChecked(readToggle('stakes', context))
  }, [context])

  if (!profile) return null

  const handleToggle = () => {
    const next = !checked
    setChecked(next)
    writeToggle('stakes', context, next)
    onPreferenceChange()
  }

  return (
    <label className={cn('inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium uppercase tracking-wide', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        className={cn('w-4 h-4 rounded', checkboxClassName || 'accent-white')}
      />
      <span className="sm:hidden">STK</span>
      <span className="hidden sm:inline">Stakes Only</span>
    </label>
  )
}
