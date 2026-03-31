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

function HorseAndJockeyIcon() {
  return (
    <svg width="56" height="48" viewBox="0 0 56 48" fill="none" className="text-slate-300">
      {/* Horse body galloping */}
      <path
        d="M14 32l3-6 5-2 4 1 6-1 5 2 3 4 2 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Horse head and neck */}
      <path
        d="M38 28l3-4 4-2 2-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Ear */}
      <path d="M46 20l1-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Eye */}
      <circle cx="45" cy="22" r="1" fill="currentColor" />
      {/* Front legs (extended gallop) */}
      <path d="M38 32l4 7M36 32l1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Hind legs (extended gallop) */}
      <path d="M19 30l-4 9M22 31l-1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Tail */}
      <path d="M14 32l-4-3-2-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Jockey body */}
      <path
        d="M32 26l-1-5 2-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Jockey head */}
      <circle cx="33" cy="15" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      {/* Jockey arms (holding reins) */}
      <path d="M31 21l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Speed lines */}
      <path d="M6 26h5M4 30h6M7 34h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

const iconMap: Record<EmptyStateVariant, () => JSX.Element> = {
  entries: CalendarIcon,
  results: TrophyIcon,
  winners: TrophyIcon,
  stakes: TrophyIcon,
  workouts: HorseAndJockeyIcon,
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
