'use client'

import { useRef, useState, useCallback, useEffect, ReactNode } from 'react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const threshold = 60

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only trigger when scrolled to top
    if (window.scrollY > 0) return
    startY.current = e.touches[0].clientY
    setPulling(true)
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || refreshing) return
    const diff = e.touches[0].clientY - startY.current
    if (diff < 0) {
      setPullDistance(0)
      return
    }
    // Dampen the pull (feels more natural)
    setPullDistance(Math.min(diff * 0.4, 80))
  }, [pulling, refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return
    setPulling(false)

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true)
      setPullDistance(threshold * 0.6)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pulling, pullDistance, refreshing, onRefresh])

  const handleTouchCancel = useCallback(() => {
    setPulling(false)
    setPullDistance(0)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd)
    el.addEventListener('touchcancel', handleTouchCancel)

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel])

  return (
    <div ref={containerRef}>
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: pullDistance > 0 ? `${pullDistance}px` : '0px' }}
      >
        <div
          className={`w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full ${refreshing ? 'animate-spin' : ''}`}
          style={{
            opacity: Math.min(pullDistance / threshold, 1),
            transform: `rotate(${pullDistance * 3}deg)`,
          }}
        />
      </div>
      {children}
    </div>
  )
}
