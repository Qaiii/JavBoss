export const JAV_SCRAPE_CHECK_FIELDS = [
  { key: 'cover_landscape', label: ['封面图', 'Cover'] },
  { key: 'title', label: ['标题', 'Title'] },
  { key: 'tags', label: ['标签', 'Tags'] },
  { key: 'series', label: ['系列', 'Series'] },
  { key: 'studio', label: ['发行商', 'Studio'] },
  { key: 'source', label: ['来源', 'Source'] },
  { key: 'idols', label: ['演员', 'Actors'] },
  { key: 'release', label: ['发行日期', 'Release date'] },
  { key: 'duration', label: ['时长', 'Duration'] },
  { key: 'uncensored', label: ['有码/无码', 'Censored state'] },
]

export function javScrapeCheckFieldCounts(report) {
  const fields = report?.fields && typeof report.fields === 'object' ? report.fields : {}
  return JAV_SCRAPE_CHECK_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    count: Math.max(0, Number(fields[field.key]) || 0),
  })).filter((field) => field.count > 0)
}

export function javScrapeCheckHasPending(report) {
  return Number(report?.cover_pending) > 0 || Number(report?.metadata_pending) > 0
}
