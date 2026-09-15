import { useEffect, useRef } from 'react'
import { zh } from '@/utils/i18n'

export default function WaterfallLoader({ enabled, hasMore, loading, onLoadMore }) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!enabled || !hasMore || loading || typeof onLoadMore !== 'function') return undefined
    const node = sentinelRef.current
    if (!node) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore()
        }
      },
      { rootMargin: '640px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, hasMore, loading, onLoadMore])

  if (!enabled) return null
  if (!hasMore && !loading) return null

  return (
    <div ref={sentinelRef} className="flex min-h-16 items-center justify-center py-4 text-sm">
      {loading ? (
        <span className="text-app-muted">{zh('加载更多…', 'Loading more...')}</span>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="hover:border-app-gold/40 rounded border border-app-border bg-app-surface px-3 py-1 text-app-muted shadow-sm"
        >
          {zh('加载更多', 'Load more')}
        </button>
      )}
    </div>
  )
}
