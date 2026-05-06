'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { signOut } = useAuth()

  const navItems = [
    { href: '/admin', label: 'Users & Stables' },
    { href: '/admin/stallions', label: 'Stallions' },
    { href: '/admin/bookings', label: 'Bookings' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-1.5 pt-1.5" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}>

          {/* ── Mobile: title row + tabs row below ── */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-base font-semibold shrink-0">Admin</h1>
              <div className="flex items-center gap-3 text-sm shrink-0">
                <Link
                  href="/"
                  className="inline-flex items-center min-h-[40px] text-slate-400 hover:text-white transition-colors"
                >
                  App
                </Link>
                <button
                  onClick={() => signOut()}
                  className="inline-flex items-center min-h-[40px] text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                >
                  Logout
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-1 overflow-x-auto -mx-4 px-4">
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-xs whitespace-nowrap border-b-2 pb-1 pt-2 transition-colors ${
                    pathname === item.href
                      ? 'text-white font-medium border-white'
                      : 'text-slate-400 hover:text-white border-transparent'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* ── Desktop: single row ── */}
          <div className="hidden sm:flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-5 overflow-x-auto">
              <h1 className="text-lg font-semibold shrink-0">Admin</h1>
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm whitespace-nowrap border-b-2 pb-0.5 transition-colors ${
                    pathname === item.href
                      ? 'text-white font-medium border-white'
                      : 'text-slate-400 hover:text-white border-transparent'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex items-baseline gap-3 text-sm shrink-0">
              <Link
                href="/"
                className="text-slate-400 hover:text-white transition-colors"
              >
                App
              </Link>
              <button
                onClick={() => signOut()}
                className="text-slate-400 hover:text-white transition-colors whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          </div>

        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {children}
      </main>
    </div>
  )
}
