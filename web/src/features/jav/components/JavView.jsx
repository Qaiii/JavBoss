import JavGrid from '@/features/jav/components/JavGrid'
import JavIdolHero from '@/features/jav/components/JavIdolHero'
import { JavDetailHeader } from '@/features/jav/components/JavSeriesDetailHeader'
import BulkActionsMenu from '@/features/playback/components/BulkActionsMenu'
import WaterfallLoader from '@/shared/ui/WaterfallLoader'
import { useStore } from '@/store'
import { zh } from '@/utils/i18n'

export default function JavView({
  javTotal,
  javLoading,
  javRandomMode,
  buildJavUrl,
  javItems,
  selectedJavIds,
  onToggleSelect,
  onSelectAll,
  onSelectPage,
  onPlayPage,
  onPlayAll,
  bulkActionBusy,
  bulkPlaybackEnabled,
  javGridColumns,
  javTitleMaxRows,
  javIdolTagMaxRows,
  javTagMaxRows,
  onPlay,
  onIdolClick,
  onOpenFavorites,
  onOpenJavFavorites,
  onOpenStudioFavorites,
  onOpenSeriesFavorites,
  onPrefixClick,
  onStudioClick,
  onSeriesClick,
  onTagClick,
  onOpenFile,
  openFileLabel,
  onRevealFile,
  onOpenScreenshots,
  onManageVideoPlay,
  onManageVideoPlayAtTime,
  onManageVideoCoverChanged,
  onManageVideoOpenFile,
  onManageVideoRevealFile,
  onManageVideoOpenTagPicker,
  onManageVideoOpenScreenshots,
  onManageVideoOpenScrapeSettings,
  onManageVideoRename,
  onManageVideoDelete,
  onManageVideoTagClick,
  onLoadMore,
  loadingMore,
  hasMore,
  activeIdolId = 0,
  activeSeriesId = 0,
  seriesName = '',
  activeStudioId = 0,
  studioName = '',
  activeTagId = 0,
  tagName = '',
  onDislikeWork,
  playOnCoverClick = false,
}) {
  const storeDislike = useStore((state) => state.dislikeJavIdolWork)
  const storeIdolId = useStore((state) =>
    Array.isArray(state.javIdolIds) && state.javIdolIds.length === 1 ? Number(state.javIdolIds[0]) : 0
  )
  const storeSeriesId = useStore((state) => Number(state.javSeriesId) || 0)
  const storeSeriesName = useStore((state) => state.javSeriesName || '')
  const storeStudioId = useStore((state) => Number(state.javStudioId) || 0)
  const storeStudioName = useStore((state) => state.javStudioName || '')
  const storeTagId = useStore((state) =>
    Array.isArray(state.javTags) && state.javTags.length === 1 ? Number(state.javTags[0]) : 0
  )
  const resolvedIdolId = Number(activeIdolId) > 0 ? Number(activeIdolId) : storeIdolId
  const resolvedSeriesId = Number(activeSeriesId) > 0 ? Number(activeSeriesId) : storeSeriesId
  const resolvedStudioId = Number(activeStudioId) > 0 ? Number(activeStudioId) : storeStudioId
  const resolvedTagId = Number(activeTagId) > 0 ? Number(activeTagId) : storeTagId
  const headerKind = resolvedSeriesId > 0 ? 'series' : resolvedStudioId > 0 ? 'studio' : resolvedTagId > 0 ? 'tag' : ''
  const headerId =
    headerKind === 'series' ? resolvedSeriesId : headerKind === 'studio' ? resolvedStudioId : resolvedTagId
  const headerName =
    headerKind === 'series' ? seriesName || storeSeriesName : headerKind === 'studio' ? studioName || storeStudioName : tagName
  const dislikeWork = onDislikeWork || storeDislike

  const body = (
    <>
      {headerKind ? (
        <JavDetailHeader
          kind={headerKind}
          entityId={headerId}
          fallbackName={headerName}
          collapseIdols={headerKind !== 'series'}
          buildIdolUrl={(idol) =>
            buildJavUrl?.({
              page: 1,
              search: '',
              tab: 'list',
              idolIds: [idol.id],
              tagIds: [],
              studioId: null,
              seriesId: null,
              prefix: '',
              favoriteRatingEnabled: false,
              tempSort: '',
            })
          }
          onIdolClick={onIdolClick}
        />
      ) : null}
      {/* 入库 / 排序 live in the top navigation's 更多 menu; only bulk actions stay in the page. */}
      <div className="sticky-pagination mb-4 flex flex-wrap items-center justify-end gap-3">
        <BulkActionsMenu
          label={zh('JAV 批量操作', 'JAV bulk actions')}
          hasItems={Number(javRandomMode ? javItems.length : javTotal) > 0}
          pageSelectable={javItems.some((item) => Number(item?.id) > 0)}
          busy={bulkActionBusy || javLoading}
          bulkPlaybackEnabled={bulkPlaybackEnabled}
          onSelectAll={onSelectAll}
          onSelectPage={onSelectPage}
          onPlayPage={onPlayPage}
          onPlayAll={onPlayAll}
        />
      </div>
      {javLoading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded border border-dashed border-gray-200 text-gray-500">
          {zh('加载中…', 'Loading...')}
        </div>
      ) : (
        <div>
          <JavGrid
            items={javItems}
            selectedIds={selectedJavIds}
            onToggleSelect={onToggleSelect}
            selectionDisabled={bulkActionBusy}
            columns={javGridColumns}
            titleMaxRows={javTitleMaxRows}
            idolTagMaxRows={javIdolTagMaxRows}
            tagMaxRows={javTagMaxRows}
            buildJavUrl={buildJavUrl}
            onPlay={onPlay}
            onIdolClick={onIdolClick}
            onOpenFavorites={onOpenFavorites}
            onOpenJavFavorites={onOpenJavFavorites}
            onOpenStudioFavorites={onOpenStudioFavorites}
            onOpenSeriesFavorites={onOpenSeriesFavorites}
            onPrefixClick={onPrefixClick}
            onStudioClick={onStudioClick}
            onSeriesClick={onSeriesClick}
            onTagClick={onTagClick}
            onOpenFile={onOpenFile}
            openFileLabel={openFileLabel}
            onRevealFile={onRevealFile}
            onOpenScreenshots={onOpenScreenshots}
            onManageVideoPlay={onManageVideoPlay}
            onManageVideoPlayAtTime={onManageVideoPlayAtTime}
            onManageVideoCoverChanged={onManageVideoCoverChanged}
            onManageVideoOpenFile={onManageVideoOpenFile}
            onManageVideoRevealFile={onManageVideoRevealFile}
            onManageVideoOpenTagPicker={onManageVideoOpenTagPicker}
            onManageVideoOpenScreenshots={onManageVideoOpenScreenshots}
            onManageVideoOpenScrapeSettings={onManageVideoOpenScrapeSettings}
            onManageVideoRename={onManageVideoRename}
            onManageVideoDelete={onManageVideoDelete}
            onManageVideoTagClick={onManageVideoTagClick}
            activeIdolId={resolvedIdolId}
            onDislikeWork={dislikeWork}
            playOnCoverClick={playOnCoverClick}
            forceHideSeries={headerKind === 'series'}
          />
        </div>
      )}
      <WaterfallLoader
        enabled={!javLoading}
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </>
  )

  if (!(Number(resolvedIdolId) > 0)) return body

  return (
    <div className="idol-profile">
      <JavIdolHero idolId={resolvedIdolId} />
      <div className="idol-profile-works">
        <div className="idol-profile-works-inner">{body}</div>
      </div>
    </div>
  )
}
