import VideoView from '@/components/VideoView'

export default function VideoRoute({
  alternatePlayerLabel,
  loading,
  onDeleteVideo,
  onOpenScreenshots,
  onOpenScrapeSettings,
  onRenameVideo,
  onTagClick,
  onSelectAll,
  onSelectPage,
  onPlayPage,
  onPlayAll,
  bulkActionBusy,
  mpvEnabled,
  openAlternatePlayer,
  openPlayer,
  revealFile,
  viewLocation,
  selectedVideoIds,
  setTagPickerFor,
  toggleSelectVideo,
  videos,
  onLoadMore,
  loadingMore,
  hasMore,
}) {
  return (
    <VideoView
      loading={loading}
      videos={videos}
      selectedVideoIds={selectedVideoIds}
      toggleSelectVideo={toggleSelectVideo}
      onSelectAll={onSelectAll}
      onSelectPage={onSelectPage}
      onPlayPage={onPlayPage}
      onPlayAll={onPlayAll}
      bulkActionBusy={bulkActionBusy}
      mpvEnabled={mpvEnabled}
      openPlayer={openPlayer}
      openAlternatePlayer={openAlternatePlayer}
      revealFile={revealFile}
      viewLocation={viewLocation}
      alternatePlayerLabel={alternatePlayerLabel}
      setTagPickerFor={setTagPickerFor}
      onOpenScreenshots={onOpenScreenshots}
      onOpenScrapeSettings={onOpenScrapeSettings}
      onRenameVideo={onRenameVideo}
      onDeleteVideo={onDeleteVideo}
      onTagClick={onTagClick}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  )
}
