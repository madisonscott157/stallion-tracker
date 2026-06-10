'use client'

import { useState } from 'react'
import { timeAgo } from '@/lib/utils'
import type { NewsItem } from '@/lib/supabase'

interface NewsCardProps {
  item: NewsItem
  showStallionNames?: boolean
  onDelete?: (id: string) => void
}

export function NewsCard({ item, showStallionNames = false, onDelete }: NewsCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const horseNames = Array.from(
    new Set(item.tags.map(t => t.horse_name).filter(Boolean))
  ) as string[]
  const stallionNames = Array.from(
    new Set(item.tags.map(t => t.stallion_name).filter(Boolean))
  ) as string[]
  const chips = horseNames.length > 0 ? horseNames : (showStallionNames ? stallionNames : [])
  const when = item.published_at || item.created_at

  return (
    <div className="relative">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-white border border-slate-200 rounded-lg px-3 py-2.5 sm:p-4 hover:border-slate-300 hover:shadow-sm transition-all card-hover"
      >
        <div className="flex gap-3">
          {item.image_url && !imageFailed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-md shrink-0 bg-slate-100"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span className="font-semibold uppercase tracking-wider">{item.source}</span>
              {when && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span>{timeAgo(when)}</span>
                </>
              )}
              {item.posted_by && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                  style={{ backgroundColor: 'var(--org-secondary, #64748b)' }}
                >
                  Shared
                </span>
              )}
            </div>
            <h3 className="font-medium text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">
              {item.title}
            </h3>
            {item.snippet && (
              <p className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2">{item.snippet}</p>
            )}
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {chips.slice(0, 4).map(name => (
                  <span
                    key={name}
                    className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </a>
      {onDelete && (
        <button
          onClick={() => onDelete(item.id)}
          aria-label="Delete news item"
          title="Delete"
          className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  )
}
