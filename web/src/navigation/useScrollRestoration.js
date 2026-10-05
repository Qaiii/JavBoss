import { useEffect } from 'react'

export default function useScrollRestoration({
  activeJavLoading,
  activeLoadingMore,
  configLoaded,
  hydrated,
  idolItems,
  idolWaterfallHasMore,
  isJavMode,
  javItems,
  javTab,
  javWaterfallHasMore,
  loadMoreJavIdols,
  loadMoreJavSeries,
  loadMoreJavStudios,
  loadMoreJavs,
  loadMoreVideos,
  loading,
  pendingScrollRestoreRef,
  schedulePendingScrollRestore,
  seriesItems,
  seriesWaterfallHasMore,
  studioItems,
  studioWaterfallHasMore,
  videoWaterfallHasMore,
  videos,
}) {
  useEffect(() => {
    if (!hydrated || !configLoaded || !pendingScrollRestoreRef.current) return
    if ((isJavMode ? activeJavLoading : loading) || activeLoadingMore) return

    const pending = pendingScrollRestoreRef.current
    const maxY = Math.max(
      0,
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) -
        window.innerHeight
    )
    const needsMoreContent = (pending.y || 0) > maxY + 24
    if (needsMoreContent) {
      if (!isJavMode && videoWaterfallHasMore) {
        loadMoreVideos()
        return
      }
      if (isJavMode && javTab === 'list' && javWaterfallHasMore) {
        loadMoreJavs()
        return
      }
      if (isJavMode && javTab === 'idol' && idolWaterfallHasMore) {
        loadMoreJavIdols()
        return
      }
      if (isJavMode && javTab === 'studio' && studioWaterfallHasMore) {
        loadMoreJavStudios()
        return
      }
      if (isJavMode && javTab === 'series' && seriesWaterfallHasMore) {
        loadMoreJavSeries()
        return
      }
    }

    schedulePendingScrollRestore()
  }, [
    activeJavLoading,
    activeLoadingMore,
    configLoaded,
    hydrated,
    idolItems.length,
    idolWaterfallHasMore,
    isJavMode,
    javItems.length,
    javTab,
    javWaterfallHasMore,
    loadMoreJavIdols,
    loadMoreJavSeries,
    loadMoreJavStudios,
    loadMoreJavs,
    loadMoreVideos,
    loading,
    pendingScrollRestoreRef,
    schedulePendingScrollRestore,
    seriesItems.length,
    seriesWaterfallHasMore,
    studioItems.length,
    studioWaterfallHasMore,
    videoWaterfallHasMore,
    videos.length,
  ])
}
