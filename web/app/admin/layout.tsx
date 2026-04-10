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
  const { signOut, isLoading } = useAuth()

  const navItems = [
    { href: '/admin', label: 'Users & Stables' },
    { href: '/admin/stallions', label: 'Stallions' },
    { href: '/admin/bookings', label: 'Bookings' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-1.5 pt-1.5" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 sm:gap-5 overflow-x-auto">
              <h1 className="text-base sm:text-lg font-semibold shrink-0">Admin</h1>
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-xs sm:text-sm whitespace-nowrap border-b-2 pb-0.5 transition-colors ${
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
    </div>
  )
}
