'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NewsCard } from '@/components/NewsCard'
import type { NewsItem } from '@/lib/supabase'

// Dashboard teaser: latest few news items + link to the full feed.
// Self-gates — renders nothing until news exists for the user's stallions.
export function NewsTeaser() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news?limit=3')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setItems(data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || items.length === 0) return null

  return (
    <section className="mb-6 sm:mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Latest News</h2>
        <Link
          href="/dashboard/news"
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          View all
        </Link>
      </div>
      <div className="card-stack">
        {items.map(item => (
          <NewsCard key={item.id} item={item} showStallionNames />
        ))}
      </div>
    </section>
  )
}
