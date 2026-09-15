import BulkActionsMenu from '@/components/BulkActionsMenu'
import VideoGrid from '@/components/VideoGrid'
import WaterfallLoader from '@/components/WaterfallLoader'
import { zh } from '@/utils/i18n'

export default function VideoView({
  loading,
  videos,
  selectedVideoIds,
  toggleSelectVideo,
  onSelectAll,
  onSelectPage,
  onPlayPage,
  onPlayAll,
  bulkActionBusy,
  mpvEnabled,
  openPlayer,
  openAlternatePlayer,
  revealFile,
  viewLocation,
  alternatePlayerLabel,
  setTagPickerFor,
  onOpenScreenshots,
  onOpenScrapeSettings,
  onRenameVideo,
  onDeleteVideo,
  onTagClick,
  onLoadMore,
  loadingMore,
  hasMore,
}) {
  const hasVideos = videos.length > 0

  return (
    <>
      {hasVideos ? (
        <div className="sticky-pagination mb-4 flex justify-end">
          <BulkActionsMenu
            label={zh('视频批量操作', 'Video bulk actions')}
            hasItems={hasVideos}
            pageSelectable={hasVideos}
            busy={bulkActionBusy}
            mpvEnabled={mpvEnabled}
            onSelectAll={onSelectAll}
            onSelectPage={onSelectPage}
            onPlayPage={onPlayPage}
            onPlayAll={onPlayAll}
          />
        </div>
      ) : null}
      {loading ? (
        <div className="mt-4 flex min-h-[200px] items-center justify-center rounded border border-dashed border-app-border text-app-muted">
          {zh('加载中…', 'Loading...')}
        </div>
      ) : (
        <VideoGrid
          videos={videos}
          selectedIds={selectedVideoIds}
          onToggleSelect={toggleSelectVideo}
          onPlay={(video) => openPlayer(video)}
          onOpenFile={(video) => openAlternatePlayer?.(video)}
          onRevealFile={(video) => revealFile?.(video)}
          onViewLocation={(video) => viewLocation?.(video)}
          openFileLabel={alternatePlayerLabel}
          onOpenTagPicker={(vid) => setTagPickerFor(vid)}
          onOpenScreenshots={onOpenScreenshots}
          onOpenScrapeSettings={onOpenScrapeSettings}
          onRenameVideo={onRenameVideo}
          onDeleteVideo={onDeleteVideo}
          onTagClick={onTagClick}
        />
      )}
      <WaterfallLoader
        enabled={!loading}
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </>
  )
}
