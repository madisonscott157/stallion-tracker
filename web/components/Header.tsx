'use client'

interface HeaderProps {
  stallionName: string
}

export function Header({ stallionName }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-primary text-white px-5 py-4">
      <h1 className="text-xl font-semibold tracking-wide">
        {stallionName.toUpperCase()} <span className="font-normal text-slate-300">| Progeny Tracker</span>
      </h1>
    </header>
  )
}
