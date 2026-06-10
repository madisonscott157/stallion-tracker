'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardHeader } from '@/components/DashboardHeader'
import { NewsCard } from '@/components/NewsCard'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/lib/auth-context'
import type { NewsItem } from '@/lib/supabase'

const PAGE_SIZE = 25

interface StallionOption {
  id: string
  name: string
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)
  const { isAdmin } = useAuth()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/news?limit=${PAGE_SIZE}`, { signal: controller.signal })
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
  }, [fetchKey])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/news?limit=${PAGE_SIZE}&offset=${items.length}`)
      if (res.ok) {
        const data = await res.json()
        setItems(prev => [...prev, ...(data.items || [])])
        setHasMore(!!data.hasMore)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this news item for all organizations?')) return
    const res = await fetch(`/api/news?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(item => item.id !== id))
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <DashboardHeader />

      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-slate-400 hover:text-slate-600"
              aria-label="Back to dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold text-slate-900">News</h1>
          </div>
        </div>

        {isAdmin && <PostLinkForm onPosted={() => setFetchKey(k => k + 1)} />}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <>
            <div className="card-stack">
              {items.map(item => (
                <NewsCard
                  key={item.id}
                  item={item}
                  showStallionNames
                  onDelete={isAdmin ? handleDelete : undefined}
                />
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
      </main>
    </div>
  )
}

function PostLinkForm({ onPosted }: { onPosted: () => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [stallions, setStallions] = useState<StallionOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || stallions.length > 0) return
    fetch('/api/stallions')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setStallions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [open, stallions.length])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const submit = async () => {
    setError(null)
    if (!url.trim()) {
      setError('Paste a link first')
      return
    }
    if (selected.size === 0) {
      setError('Pick at least one stallion')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        url: url.trim(),
        stallion_ids: Array.from(selected),
      }
      if (title.trim()) body.title = title.trim()
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to post link')
        return
      }
      setUrl('')
      setTitle('')
      setSelected(new Set())
      setOpen(false)
      onPosted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-slate-600 underline hover:text-slate-800"
        >
          + Post a link
        </button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Post a link</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close form"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://… article link"
            className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (optional — read from the page if blank)"
            className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {stallions.map(s => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="accent-slate-600"
                />
                {s.name}
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting}
            className="text-sm font-medium text-white rounded-md px-4 py-2 disabled:opacity-50"
            style={{ backgroundColor: 'var(--org-primary, #0f172a)' }}
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      )}
    </div>
  )
}
