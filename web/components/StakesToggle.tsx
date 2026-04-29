'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

interface StakesToggleProps {
  onPreferenceChange: () => void
  className?: string
  checkboxClassName?: string
}

// "Stakes only" toggle — when checked, the entries / results / dashboard
// endpoints filter to is_stakes=true. Mirrors ClmToggle but is always
// available (no org-level allow_* gate).
export function StakesToggle({ onPreferenceChange, className, checkboxClassName }: StakesToggleProps) {
  const { profile, updateProfile } = useAuth()
  const [updating, setUpdating] = useState(false)

  if (!profile) return null

  const handleToggle = async () => {
    if (updating) return
    setUpdating(true)
    try {
      await updateProfile({ show_stakes_only: !profile.show_stakes_only })
      onPreferenceChange()
    } catch (err) {
      console.error('Failed to update stakes-only preference:', err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <label className={cn('inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium uppercase tracking-wide', className)}>
      <input
        type="checkbox"
        checked={profile.show_stakes_only ?? false}
        onChange={handleToggle}
        disabled={updating}
        className={cn('w-4 h-4 rounded', checkboxClassName || 'accent-white')}
      />
      Stakes Only
    </label>
  )
}
