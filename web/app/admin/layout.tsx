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
  const { profile, signOut, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  const navItems = [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/organizations', label: 'Stables' },
    { href: '/admin/stallions', label: 'Stallions' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 pt-2 pb-1 flex items-baseline justify-between">
          <div className="flex items-baseline gap-8">
            <h1 className="text-xl font-semibold">Admin Dashboard</h1>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition-colors ${
                  pathname === item.href
                    ? 'text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-baseline gap-4">
            <Link
              href="/"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Back to App
            </Link>
            <span className="text-slate-600">|</span>
            <span className="text-sm text-slate-400">{profile?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  )
}
