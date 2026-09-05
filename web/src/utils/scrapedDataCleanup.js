export const SCRAPED_DATA_CLEANUP_FIELDS = [
  { key: 'javs', label: ['未引用作品', 'Unreferenced titles'] },
  { key: 'scraped_tags', label: ['未使用抓取标签', 'Unused scraped tags'] },
  { key: 'idols', label: ['未使用演员', 'Unused actresses'] },
  { key: 'studios', label: ['未使用发行商', 'Unused studios'] },
  { key: 'series', label: ['未使用系列', 'Unused series'] },
  { key: 'covers', label: ['未使用封面文件', 'Unused cover files'] },
  { key: 'expired_cache', label: ['过期抓取缓存', 'Expired scrape cache'] },
]

export function scrapedDataCleanupCounts(report) {
  const source = report && typeof report === 'object' ? report : {}
  return SCRAPED_DATA_CLEANUP_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    count: Math.max(0, Number(source[field.key]) || 0),
  })).filter((field) => field.count > 0)
}

export function scrapedDataCleanupTotal(report) {
  const total = Number(report?.total)
  if (Number.isFinite(total) && total > 0) {
    return total
  }
  return scrapedDataCleanupCounts(report).reduce((sum, field) => sum + field.count, 0)
}
