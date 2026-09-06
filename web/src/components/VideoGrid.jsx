import VideoCard from '@/components/VideoCard'
import { useStore, videoSelectionKey } from '@/store'
import { cardGridMinmax } from '@/utils/cardLayout'

export default function VideoGrid({
  videos,
  selectedIds,
  onToggleSelect,
  showSelection = true,
  onPlay,
  onOpenFile,
  onRevealFile,
  onViewLocation,
  openFileLabel,
  onOpenTagPicker,
  showTagEditor = true,
  onOpenScreenshots,
  onOpenScrapeSettings,
  onRenameVideo,
  onDeleteVideo,
  onTagClick,
}) {
  const cardMinmax = useStore((state) => cardGridMinmax('video', state.config))
  return (
    <div
      className="grid gap-8"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinmax}, 1fr))` }}
    >
      {videos.map((v) => (
        <VideoCard
          key={videoSelectionKey(v)}
          video={v}
          checked={selectedIds.has(videoSelectionKey(v))}
          onToggle={() => onToggleSelect(v)}
          showSelection={showSelection}
          onPlay={onPlay}
          onOpenFile={onOpenFile}
          onRevealFile={onRevealFile}
          onViewLocation={onViewLocation}
          openFileLabel={openFileLabel}
          onOpenTagPicker={() => onOpenTagPicker(v.id)}
          showTagEditor={showTagEditor}
          onOpenScreenshots={onOpenScreenshots}
          onOpenScrapeSettings={onOpenScrapeSettings}
          onRenameVideo={onRenameVideo}
          onDeleteVideo={onDeleteVideo}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  )
}
