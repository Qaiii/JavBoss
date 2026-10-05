import { normalizeIdolProfileFilters, resolveJavSort } from '@/constants/jav'
import { javLibraryScopeQueryFlags } from '@/utils/javLibrary'

const cleanDirectoryIds = (ids) =>
  Array.from(
    new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  ).sort((a, b) => a - b)

function closedSubdirsParam(state) {
  const map = state?.closedSubdirectories || {}
  const active = new Set(cleanDirectoryIds((state?.directories || []).map((directory) => directory?.id)))
  const pairs = []
  for (const [rawId, names] of Object.entries(map)) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0 || !active.has(id) || !Array.isArray(names)) continue
    for (const name of names) {
      const clean = String(name || '').trim()
      if (clean) pairs.push(`${id}:${clean}`)
    }
  }
  return pairs.sort().join(',')
}

function directorySubpathsParam(state) {
  if (state?.directoryFilterMode !== 'custom') return ''
  const enabled = new Set(cleanDirectoryIds(state.enabledDirectoryIds))
  return (state.directorySubpaths || [])
    .map((item) => {
      const id = Number(item?.directoryId)
      const path = String(item?.path || '').trim()
      if (!Number.isFinite(id) || id <= 0 || !path || !enabled.has(id)) return ''
      return `${id}:${path}`
    })
    .filter(Boolean)
    .sort()
    .join(',')
}

function directoryIdsParam(state) {
  if (state?.directoryFilterMode !== 'custom') return ''
  const enabled = cleanDirectoryIds(state.enabledDirectoryIds)
  if (enabled.length === 0) return '0'
  const active = cleanDirectoryIds((state.directories || []).map((directory) => directory?.id))
  if (active.length === 0) return enabled.join(',')
  const scoped = enabled.filter((id) => active.includes(id))
  if (scoped.length === 0) return '0'
  if (scoped.length === active.length) return ''
  return scoped.join(',')
}

function listScope(state) {
  return {
    closedSubdirs: closedSubdirsParam(state),
    directorySubpaths: directorySubpathsParam(state),
    directoryIds: directoryIdsParam(state),
  }
}

export const directoryScopeKey = (state) =>
  (state.directories || [])
    .map(
      (directory) =>
        `${directory.id}:${directory.enabled !== false ? 1 : 0}:${directory.is_delete ? 1 : 0}`
    )
    .sort()
    .join(',')

export function videoQuery(state) {
  return {
    limit: state.pageSize,
    offset: state.randomMode ? 0 : (state.page - 1) * state.pageSize,
    tags: state.selectedTags || [],
    search: state.searchTerm || '',
    sort: state.randomMode ? 'random' : state.videoTempSort || state.sortOrder,
    seed: state.randomMode ? state.randomSeed : null,
    hideJav: state.videoHideJav,
    ...listScope(state),
  }
}

export function javQuery(state) {
  return {
    limit: state.javPageSize,
    offset: state.javRandomMode ? 0 : (state.javPage - 1) * state.javPageSize,
    search: state.javSearchTerm || '',
    idolIds: state.javIdolIds || [],
    tagIds: state.javTags || [],
    studioId: state.javStudioId,
    seriesId: state.javSeriesId,
    prefix: state.javPrefix,
    soloOnly: state.javSoloOnly,
    favoriteRatingEnabled: state.javFavoriteRatingEnabled,
    favoriteRatingMin: state.javFavoriteRatingMin,
    favoriteRatingMax: state.javFavoriteRatingMax,
    favoriteGroupId: state.javFavoriteGroupId,
    sort: resolveJavSort(state).sort,
    seed: state.javRandomMode ? state.javRandomSeed : null,
    ...javLibraryScopeQueryFlags(state.javLibraryScope, {
      idolCount: (state.javIdolIds || []).length,
    }),
    ...listScope(state),
  }
}

export function idolQuery(state) {
  return {
    limit: state.idolPageSize,
    offset: (state.idolPage - 1) * state.idolPageSize,
    search: state.javSearchTerm || '',
    sort: state.idolTempSort || (state.idolFavoriteGroupId ? '' : state.idolSort),
    favoriteGroupId: state.idolFavoriteGroupId,
    profileFilters: normalizeIdolProfileFilters(state.idolProfileFilters),
    ...listScope(state),
  }
}

export const studioQuery = (state) => ({
  limit: state.studioPageSize,
  offset: (state.studioPage - 1) * state.studioPageSize,
  search: state.javSearchTerm || '',
  favoriteGroupId: state.studioFavoriteGroupId,
  ...listScope(state),
})
export const seriesQuery = (state) => ({
  limit: state.seriesPageSize,
  offset: (state.seriesPage - 1) * state.seriesPageSize,
  search: state.javSearchTerm || '',
  favoriteGroupId: state.seriesFavoriteGroupId,
  ...listScope(state),
})

export const listQueryKey = (query, state) =>
  JSON.stringify([directoryScopeKey(state), query(state)])
export const videoQueryKey = (state) => listQueryKey(videoQuery, state)
export const javQueryKey = (state) => listQueryKey(javQuery, state)
export const idolQueryKey = (state) => listQueryKey(idolQuery, state)
export const studioQueryKey = (state) => listQueryKey(studioQuery, state)
export const seriesQueryKey = (state) => listQueryKey(seriesQuery, state)
