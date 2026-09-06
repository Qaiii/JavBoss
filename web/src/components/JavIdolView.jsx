import JavIdolGrid from '@/components/JavIdolGrid'
import WaterfallLoader from '@/components/WaterfallLoader'
import { zh } from '@/utils/i18n'

export default function JavIdolView({
  loading,
  buildIdolUrl,
  preferChineseName = false,
  items,
  onSelectIdol,
  onOpenFavorites,
  onMerged,
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
        <JavIdolGrid
          items={items}
          onSelectIdol={onSelectIdol}
          onOpenFavorites={onOpenFavorites}
          onMerged={onMerged}
          buildIdolUrl={buildIdolUrl}
          preferChineseName={preferChineseName}
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
