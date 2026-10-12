function positiveIds(values) {
  return (Array.isArray(values) ? values : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
}

function hasStudioFilter(studioId) {
  if (studioId === null || studioId === undefined || studioId === '') return false
  const id = Number(studioId)
  return Number.isFinite(id) && id >= 0
}

/**
 * Top-nav highlight for the page on screen. Section homes keep their own tab.
 * A single idol's works page is not a nav destination, so nothing is selected.
 * Series, studio, and single-tag pages highlight the tab they belong to.
 */
export function resolveTopNavTab({
  isJavMode = false,
  javTab = 'list',
  javIdolIds = [],
  javSeriesId = null,
  javStudioId = null,
  javTags = [],
} = {}) {
  if (!isJavMode) return 'video'
  if (javTab === 'idol' || javTab === 'studio' || javTab === 'series') return javTab
  if (javTab !== 'list') return ''

  if (positiveIds(javIdolIds).length === 1) return ''
  if (Number(javSeriesId) > 0) return 'series'
  if (hasStudioFilter(javStudioId)) return 'studio'
  if (positiveIds(javTags).length === 1) return 'tags'
  return 'list'
}
