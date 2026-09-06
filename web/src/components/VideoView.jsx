import VideoGrid from '@/components/VideoGrid'
import WaterfallLoader from '@/components/WaterfallLoader'
import { zh } from '@/utils/i18n'

export default function VideoView({
  loading,
  videos,
  selectedVideoIds,
  toggleSelectVideo,
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
  return (
    <>
      {loading ? (
        <div className="mt-4 flex min-h-[200px] items-center justify-center rounded border border-dashed border-gray-200 text-gray-500">
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
