'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { readToggle, writeToggle } from '@/lib/toggle-storage'

interface ClmToggleProps {
  // Stallion id, or "_dashboard" on the cross-stallion dashboard.
  context: string
  onPreferenceChange: () => void
  className?: string
  checkboxClassName?: string
}

// `users.show_claiming_races` is the admin-granted permission to see CLM races
// at all. The toggle itself is sticky per-stallion in localStorage, defaults
// off, and stays visible at all times so the user can flip it back on.
export function ClmToggle({ context, onPreferenceChange, className, checkboxClassName }: ClmToggleProps) {
  const { profile } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setChecked(readToggle('clm', context))
  }, [context])

  const orgAllows = profile?.organization?.allow_claiming_toggle !== false
  const userPermitted = profile?.show_claiming_races === true
  if (!profile || !orgAllows || !userPermitted) return null

  const handleToggle = () => {
    const next = !checked
    setChecked(next)
    writeToggle('clm', context, next)
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
      CLM
    </label>
  )
}
