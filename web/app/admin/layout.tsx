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
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-1" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <div className="flex flex-row items-center justify-between">
            <h1 className="text-lg sm:text-xl font-semibold">Admin</h1>
            <div className="flex flex-row items-center gap-3 sm:gap-4 text-sm">
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
          <div className="flex gap-4 sm:gap-6 mt-1">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm pb-1 border-b-2 transition-colors ${
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
