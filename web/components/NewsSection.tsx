'use client'

import { useEffect, useState } from 'react'
import { NewsCard } from '@/components/NewsCard'
import { EmptyState } from '@/components/EmptyState'
import type { NewsItem } from '@/lib/supabase'

const PAGE_SIZE = 20

interface NewsSectionProps {
  stallionId: string | null
}

export function NewsSection({ stallionId }: NewsSectionProps) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!stallionId) return
    const controller = new AbortController()
    setLoading(true)
    setItems([])

    fetch(`/api/news?stallion_id=${encodeURIComponent(stallionId)}&limit=${PAGE_SIZE}`, {
      signal: controller.signal,
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setItems(data.items || [])
          setHasMore(!!data.hasMore)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [stallionId])

  const loadMore = async () => {
    if (!stallionId || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/news?stallion_id=${encodeURIComponent(stallionId)}&limit=${PAGE_SIZE}&offset=${items.length}`
      )
      if (res.ok) {
        const data = await res.json()
        setItems(prev => [...prev, ...(data.items || [])])
        setHasMore(!!data.hasMore)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section>
      <h2 className="section-header">News</h2>
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-100 rounded-lg" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <>
          <div className="card-stack">
            {items.map(item => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm text-slate-600 underline hover:text-slate-800 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState message="No news yet" />
      )}
    </section>
  )
}
