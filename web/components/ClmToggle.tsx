'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

interface ClmToggleProps {
  onPreferenceChange: () => void
  className?: string
  checkboxClassName?: string
}

export function ClmToggle({ onPreferenceChange, className, checkboxClassName }: ClmToggleProps) {
  const { profile, updateProfile } = useAuth()
  const [updating, setUpdating] = useState(false)
  const orgAllows = profile?.organization?.allow_claiming_toggle !== false

  if (!profile || !orgAllows || !profile.show_claiming_races) return null

  const handleToggle = async () => {
    if (updating) return
    setUpdating(true)
    try {
      await updateProfile({ show_claiming_races: !profile.show_claiming_races })
      onPreferenceChange()
    } catch (err) {
      console.error('Failed to update CLM preference:', err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <label className={cn('inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium uppercase tracking-wide', className)}>
      <input
        type="checkbox"
        checked={profile.show_claiming_races}
        onChange={handleToggle}
        disabled={updating}
        className={cn('w-4 h-4 rounded', checkboxClassName || 'accent-white')}
      />
      CLM
    </label>
  )
}
