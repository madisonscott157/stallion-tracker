'use client'

interface HeaderProps {
  stallionName: string
  onExportPDF?: () => void
  isExporting?: boolean
}

export function Header({ stallionName, onExportPDF, isExporting }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-primary text-white px-5 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-wide">
          {stallionName.toUpperCase()} <span className="font-normal text-slate-300">| Progeny Tracker</span>
        </h1>
        {onExportPDF && (
          <button
            onClick={onExportPDF}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
        )}
      </div>
    </header>
  )
}
