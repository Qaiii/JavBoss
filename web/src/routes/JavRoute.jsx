import JavIdolView from '@/components/JavIdolView'
import JavSeriesView from '@/components/JavSeriesView'
import JavStudioView from '@/components/JavStudioView'
import JavView from '@/components/JavView'

function JavIdolRoute({
  buildJavUrl,
  config,
  hasMore,
  items,
  loading,
  loadingMore,
  onLoadMore,
  onOpenFavorites,
  onMerged,
  onSelectIdol,
}) {
  return (
    <JavIdolView
      loading={loading}
      buildIdolUrl={(idol) =>
        buildJavUrl({
          page: 1,
          search: '',
          tab: 'list',
          idolIds: [idol.id],
          tagIds: [],
          prefix: '',
          favoriteRatingEnabled: false,
          tempSort: '',
        })
      }
      items={items}
      preferChineseName={configFlag(config?.jav_idol_prefer_chinese_name)}
      onSelectIdol={onSelectIdol}
      onOpenFavorites={onOpenFavorites}
      onMerged={onMerged}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  )
}

function JavStudioRoute({
  buildJavUrl,
  hasMore,
  items,
  loading,
  loadingMore,
  onLoadMore,
  onMerged,
  onOpenFavorites,
  onOpenSeriesFavorites,
  onSelectPrefix,
  onSelectSeries,
  onSelectStudio,
}) {
  return (
    <JavStudioView
      loading={loading}
      buildStudioUrl={(studio) =>
        buildJavUrl({
          page: 1,
          search: '',
          tab: 'list',
          idolIds: [],
          tagIds: [],
          studioId: studio.id,
          studioName: studio.name,
          prefix: '',
          favoriteRatingEnabled: false,
          tempSort: '',
        })
      }
      buildSeriesUrl={(series) =>
        buildJavUrl({
          page: 1,
          search: '',
          tab: 'list',
          idolIds: [],
          tagIds: [],
          studioId: null,
          seriesId: series.id,
          seriesName: series.name,
          prefix: '',
          favoriteRatingEnabled: false,
          tempSort: '',
        })
      }
      items={items}
      onSelectStudio={onSelectStudio}
      onSelectSeries={onSelectSeries}
      onSelectPrefix={onSelectPrefix}
      onOpenFavorites={onOpenFavorites}
      onOpenSeriesFavorites={onOpenSeriesFavorites}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onMerged={onMerged}
    />
  )
}

function JavSeriesRoute({
  buildJavUrl,
  hasMore,
  items,
  loading,
  loadingMore,
  onLoadMore,
  onOpenFavorites,
  onSelectSeries,
  onSelectStudio,
}) {
  return (
    <JavSeriesView
      loading={loading}
      buildSeriesUrl={(series) =>
        buildJavUrl({
          page: 1,
          search: '',
          tab: 'list',
          idolIds: [],
          tagIds: [],
          studioId: null,
          seriesId: series.id,
          seriesName: series.name,
          prefix: '',
          favoriteRatingEnabled: false,
          tempSort: '',
        })
      }
      items={items}
      onSelectSeries={onSelectSeries}
      onSelectStudio={onSelectStudio}
      onOpenFavorites={onOpenFavorites}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  )
}

function JavListRoute({
  activeIdolId,
  activeJavLoading,
  alternatePlayerLabel,
  buildJavUrl,
  hasMore,
  javGridColumns,
  javIdolTagMaxRows,
  javItems,
  selectedJavIds,
  onToggleSelect,
  onSelectAll,
  onSelectPage,
  onPlayPage,
  onPlayAll,
  bulkActionBusy,
  mpvEnabled,
  javTagMaxRows,
  javTitleMaxRows,
  loadingMore,
  onIdolClick,
  onLoadMore,
  onOpenFavorites,
  onOpenJavFavorites,
  onOpenStudioFavorites,
  onOpenSeriesFavorites,
  onOpenFile,
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
  onPlay,
  onPrefixClick,
  onRevealFile,
  onSeriesClick,
  onStudioClick,
  onTagClick,
  onJavLibraryScopeChange,
  onDislikeWork,
  javLibraryScope,
  playOnCoverClick = false,
}) {
  return (
    <JavView
      javLoading={activeJavLoading}
      buildJavUrl={buildJavUrl}
      javItems={javItems}
      selectedJavIds={selectedJavIds}
      onToggleSelect={onToggleSelect}
      onSelectAll={onSelectAll}
      onSelectPage={onSelectPage}
      onPlayPage={onPlayPage}
      onPlayAll={onPlayAll}
      bulkActionBusy={bulkActionBusy}
      mpvEnabled={mpvEnabled}
      javGridColumns={javGridColumns}
      javTitleMaxRows={javTitleMaxRows}
      javIdolTagMaxRows={javIdolTagMaxRows}
      javTagMaxRows={javTagMaxRows}
      onPlay={onPlay}
      onOpenFile={onOpenFile}
      openFileLabel={alternatePlayerLabel}
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
      onIdolClick={onIdolClick}
      onOpenFavorites={onOpenFavorites}
      onOpenJavFavorites={onOpenJavFavorites}
      onOpenStudioFavorites={onOpenStudioFavorites}
      onOpenSeriesFavorites={onOpenSeriesFavorites}
      onPrefixClick={onPrefixClick}
      onStudioClick={onStudioClick}
      onSeriesClick={onSeriesClick}
      onTagClick={onTagClick}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      hasMore={hasMore}
      javLibraryScope={javLibraryScope}
      onJavLibraryScopeChange={onJavLibraryScopeChange}
      activeIdolId={activeIdolId}
      onDislikeWork={onDislikeWork}
      playOnCoverClick={playOnCoverClick}
    />
  )
}

export default function JavRoute({ tab, ...props }) {
  if (tab === 'idol') return <JavIdolRoute {...props.idol} buildJavUrl={props.buildJavUrl} />
  if (tab === 'studio') return <JavStudioRoute {...props.studio} buildJavUrl={props.buildJavUrl} />
  if (tab === 'series') {
    return (
      <JavSeriesRoute
        {...props.series}
        buildJavUrl={props.buildJavUrl}
        onSelectStudio={props.onSelectStudio}
      />
    )
  }
  return <JavListRoute {...props.list} buildJavUrl={props.buildJavUrl} />
}

function configFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
}
