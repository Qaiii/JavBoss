import BulkActionsMenu from '@/components/BulkActionsMenu'
import JavGrid from '@/components/JavGrid'
import JavIdolHero from '@/components/JavIdolHero'
import { JavDetailHeader } from '@/components/JavSeriesDetailHeader'
import WaterfallLoader from '@/components/WaterfallLoader'
import { zh } from '@/utils/i18n'
import { JAV_LIBRARY_SCOPE_OPTIONS, normalizeJavLibraryScope } from '@/utils/javLibrary'

export default function JavView({
  javLoading,
  buildJavUrl,
  javItems,
  selectedJavIds,
  onToggleSelect,
  onSelectAll,
  onSelectPage,
  onPlayPage,
  onPlayAll,
  bulkActionBusy,
  mpvEnabled,
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
  javLibraryScope,
  onJavLibraryScopeChange,
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
  const hasSingleIdolFilter = Number(activeIdolId) > 0
  const seriesId = Number(activeSeriesId) || 0
  const studioId = Number(activeStudioId) || 0
  const tagId = Number(activeTagId) || 0
  const headerKind = seriesId > 0 ? 'series' : studioId > 0 ? 'studio' : tagId > 0 ? 'tag' : ''
  const headerId = headerKind === 'series' ? seriesId : headerKind === 'studio' ? studioId : tagId
  const headerName =
    headerKind === 'series' ? seriesName : headerKind === 'studio' ? studioName : tagName
  const showDetailHeader = Boolean(headerKind)
  const showSeriesHeader = headerKind === 'series'
  const showIdolProfile = hasSingleIdolFilter
  const libraryScope = normalizeJavLibraryScope(javLibraryScope)
  const hasItems = javItems.some((item) => Number(item?.id) > 0)

  const body = (
    <>
      {showDetailHeader ? (
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
      <div className="sticky-pagination mb-4 flex items-center justify-end gap-2">
        <BulkActionsMenu
          label={zh('JAV 批量操作', 'JAV bulk actions')}
          hasItems={hasItems || javItems.length > 0}
          pageSelectable={hasItems}
          busy={bulkActionBusy || javLoading}
          mpvEnabled={mpvEnabled}
          onSelectAll={onSelectAll}
          onSelectPage={onSelectPage}
          onPlayPage={onPlayPage}
          onPlayAll={onPlayAll}
        />
        <div
          className="jav-library-scope"
          role="radiogroup"
          aria-label={zh('作品入库范围', 'Library scope')}
        >
          {JAV_LIBRARY_SCOPE_OPTIONS.map((option) => {
            const active = libraryScope === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={active ? 'is-active' : undefined}
                onClick={() => {
                  if (option.value === libraryScope) return
                  onJavLibraryScopeChange?.(option.value)
                }}
              >
                {zh(option.label[0], option.label[1])}
              </button>
            )
          })}
        </div>
      </div>
      {javLoading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded border border-dashed border-app-border text-app-muted">
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
            activeIdolId={activeIdolId}
            onDislikeWork={onDislikeWork}
            playOnCoverClick={playOnCoverClick}
            forceHideSeries={showSeriesHeader}
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

  if (!showIdolProfile) return body

  return (
    <div className="idol-profile">
      <JavIdolHero idolId={activeIdolId} />
      <div className="idol-profile-works">
        <div className="idol-profile-works-inner">{body}</div>
      </div>
    </div>
  )
}
