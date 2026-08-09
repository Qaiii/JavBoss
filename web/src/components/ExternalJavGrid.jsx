import { zh } from '@/utils/i18n'

// ExternalJavGrid renders an idol's persisted JavDB works (scraped in the
// background by the idol works queue). Each card is color-coded by whether the
// work already exists in the library: amber border + badge for missing works,
// white card + green badge for in-library works. Clicking a card opens the
// JavDB detail page in a new tab. No live JavDB requests are made here.
export default function ExternalJavGrid({
  items,
  page = 1,
  hasNext = false,
  total = 0,
  tracked = false,
  lastScrapedAt = null,
  scrapeError = '',
  loading = false,
  error = '',
  sourceURL = '',
  onPageChange,
}) {
  const hasItems = Array.isArray(items) && items.length > 0

  const renderBadge = (inLibrary) =>
    inLibrary ? (
      <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
        {zh('已入库', 'In library')}
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">
        {zh('未入库', 'Not in library')}
      </span>
    )

  const formatScrapedAt = () => {
    if (!lastScrapedAt) return ''
    const date = new Date(lastScrapedAt)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`
  }

  if (loading) {
    return (
      <div className="mt-4 flex min-h-[200px] items-center justify-center rounded border border-dashed border-gray-200 text-gray-500">
        {zh('加载作品列表…', 'Loading works...')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 flex min-h-[120px] items-center justify-center rounded border border-dashed border-gray-200 text-gray-500">
        {zh(`作品列表加载失败：${error}`, `Failed to load the works list: ${error}`)}
      </div>
    )
  }

  if (!hasItems) {
    return (
      <div className="mt-4 flex min-h-[120px] flex-col items-center justify-center gap-2 rounded border border-dashed border-gray-200 text-gray-500">
        <span>
          {tracked
            ? zh(
                '该女优的作品数据尚未抓取完成，正在后台自动获取，完成后将自动显示',
                'Works are being fetched in the background and will appear when ready'
              )
            : zh(
                '该女优的作品数据已进入后台抓取队列，完成后将自动显示',
                'Works are queued for background fetching and will appear when ready'
              )}
        </span>
        {scrapeError ? (
          <span className="max-w-xl break-all text-center text-xs text-amber-600">
            {zh(`上次抓取失败：${scrapeError}`, `Last scrape failed: ${scrapeError}`)}
          </span>
        ) : null}
        {!tracked && !scrapeError ? (
          <span className="max-w-xl text-center text-xs text-gray-400">
            {zh(
              '首次抓取需要一点时间（每页抓取间隔约 2 秒），若一直无数据请检查网络能否访问 javdb.com，或配置代理后重启',
              'First fetch takes a while (~2s per page). If nothing appears, make sure javdb.com is reachable or configure a proxy and restart'
            )}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <span className="font-semibold text-gray-700">
          {zh(`JavDB 作品（共 ${total} 部）`, `JavDB works (${total})`)}
        </span>
        {tracked && formatScrapedAt() ? (
          <span className="text-xs">
            {zh(`上次抓取：${formatScrapedAt()}`, `Scraped at ${formatScrapedAt()}`)}
          </span>
        ) : null}
        {sourceURL ? (
          <a
            href={sourceURL}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-blue-600 hover:underline"
          >
            {zh('查看女优主页 ↗', 'View profile ↗')}
          </a>
        ) : null}
      </div>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(21rem, 1fr))' }}
      >
        {items.map((item, index) => {
          const inLibrary = Boolean(item?.in_library)
          const code = item?.code || ''
          const title = item?.title || zh('未知标题', 'Unknown title')
          const cover = item?.cover_url || ''
          const href = item?.source_url || sourceURL
          return (
            <div
              key={`${item?.code || 'item'}-${index}`}
              className={`flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition hover:shadow-lg ${
                inLibrary ? 'border-gray-200' : 'border-amber-300 bg-amber-50/40'
              }`}
            >
              <a
                href={href || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-[800/538] overflow-hidden bg-white"
                aria-label={zh(`在 JavDB 中查看 ${code}`, `View ${code} on JavDB`)}
              >
                {cover ? (
                  <img
                    src={cover}
                    alt={code || zh('JavDB 封面', 'JavDB cover')}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-lg font-semibold text-gray-600">
                    {code || zh('未知番号', 'Unknown code')}
                  </div>
                )}
                <div className="absolute right-2 top-2 z-10">{renderBadge(inLibrary)}</div>
              </a>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="text-sm leading-tight">
                  {code ? <span className="font-semibold text-gray-800">{code}</span> : null}
                  {code ? ' ' : null}
                  <span className="font-medium text-gray-800">{title}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {zh('上一页', 'Prev')}
        </button>
        <span className="text-sm text-gray-500">{zh(`第 ${page} 页`, `Page ${page}`)}</span>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => onPageChange?.(page + 1)}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {zh('下一页', 'Next')}
        </button>
      </div>
    </section>
  )
}
