'use client'

type EmptyStateVariant = 'entries' | 'results' | 'winners' | 'stakes' | 'workouts' | 'sales' | 'generic'

interface EmptyStateProps {
  variant?: EmptyStateVariant
  message: string
}

function HorseIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-slate-300">
      <path
        d="M38 12c-2-3-5-4-8-4l-2 1-3 5-8 2-4 6v8l4 6h6l2-3h6l2 3h4l2-4v-8l-1-4c0-2 0-5-2-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="32" cy="14" r="1.5" fill="currentColor" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-slate-300">
      <rect x="8" y="12" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 20h32" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 8v8M32 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="30" r="2" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-slate-300">
      <path d="M16 10h16v12c0 4.4-3.6 8-8 8s-8-3.6-8-8V10z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 14h-4c-2 0-3 1-3 3v2c0 3 2 5 5 5h2M32 14h4c2 0 3 1 3 3v2c0 3-2 5-5 5h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 38h8M24 30v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-slate-300">
      <rect x="10" y="24" width="6" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="21" y="16" width="6" height="22" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="32" y="20" width="6" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 40h32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function StopwatchIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-slate-300">
      <circle cx="24" cy="27" r="14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 18v9l6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M36 15l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const iconMap: Record<EmptyStateVariant, () => JSX.Element> = {
  entries: CalendarIcon,
  results: TrophyIcon,
  winners: TrophyIcon,
  stakes: TrophyIcon,
  workouts: StopwatchIcon,
  sales: ChartIcon,
  generic: HorseIcon,
}

export function EmptyState({ variant = 'generic', message }: EmptyStateProps) {
  const Icon = iconMap[variant]
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-slate-500">
      <Icon />
      <p className="mt-2 text-sm">{message}</p>
    </div>
  )
}
