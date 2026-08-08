import { create } from 'zustand'
import {
  fetchTags,
  fetchVideos,
  createTag,
  deleteTag,
  renameTag,
  addTagToVideos,
  removeTagFromVideos,
  fetchDirectories,
  createDirectory,
  updateDirectory,
  deleteDirectory as deleteDirectoryApi,
  fetchJavs,
  fetchJavIdols,
  fetchJavExternalWorks,
  fetchJavFavoriteGroups,
  fetchJavStudios,
  fetchJavSeries,
  fetchJavTags,
  fetchConfig,
} from '@/api'
import { normalizeIdolSort, normalizeJavSort } from '@/constants/jav'
import { normalizeVideoSort } from '@/constants/video'
import { zh } from '@/utils/i18n'
import { getErrorMessage } from '@/utils/errors'

const VIDEO_PAGE_SIZE = 25
const JAV_PAGE_SIZE = 24
const JAV_STUDIO_PAGE_SIZE = 25
const JAV_SERIES_PAGE_SIZE = 25
const JAV_GRID_COLUMNS_AUTO = 0
const JAV_TITLE_MAX_ROWS_DEFAULT = 2
const JAV_IDOL_TAG_MAX_ROWS_DEFAULT = 2
const JAV_TAG_MAX_ROWS_DEFAULT = 2
let videoLoadSeq = 0
let videoLoadMoreSeq = 0
let javLoadSeq = 0
let javLoadMoreSeq = 0
let javExternalLoadSeq = 0
let idolLoadSeq = 0
let idolLoadMoreSeq = 0
let studioLoadSeq = 0
let studioLoadMoreSeq = 0
let seriesLoadSeq = 0
let seriesLoadMoreSeq = 0
let lastVideoFetchKey = null
let lastJavFetchKey = null
let lastJavExternalFetchKey = null
let lastIdolFetchKey = null
const lastFavoriteGroupFetchKeys = {}
let lastStudioFetchKey = null
let lastSeriesFetchKey = null
let lastTagFetchKey = null
let lastJavTagFetchKey = null
let tagFetchInFlight = null
let tagFetchInFlightKey = null
let javTagFetchInFlight = null
let javTagFetchInFlightKey = null
const RANDOM_SEED_MAX = 2147483646
const DIRECTORY_FILTER_ALL = 'all'
const DIRECTORY_FILTER_CUSTOM = 'custom'

const normalizeSeed = (seed) => {
  const num = Math.floor(Number(seed))
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.min(num, RANDOM_SEED_MAX)
}

const generateSeed = () => Math.floor(Math.random() * RANDOM_SEED_MAX) + 1

export const videoSelectionKey = (video) => {
  if (video?.location_id) return `loc:${video.location_id}`
  if (video?.id) return `vid:${video.id}`
  return ''
}

const selectedVideoContentIds = (state) => {
  const ids = new Set()
  for (const key of state.selectedVideoIds || []) {
    const meta = state.selectedVideoMeta?.[key]
    const raw = meta && typeof meta === 'object' ? meta.video_id : key
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed > 0) ids.add(parsed)
  }
  return Array.from(ids)
}

const cleanDirectoryIds = (ids) =>
  Array.from(
    new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  ).sort((a, b) => a - b)

// closedSubdirectories state shape: { [directoryId]: [subdirName, ...] }
// It records first-level subdirectories hidden inside an otherwise enabled directory.
const closedSubdirectoryPairs = (state) => {
  const map = state?.closedSubdirectories || {}
  const active = new Set(cleanDirectoryIds((state?.directories || []).map((d) => d?.id)))
  const pairs = []
  for (const [rawId, names] of Object.entries(map)) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0 || !active.has(id)) continue
    if (!Array.isArray(names)) continue
    for (const name of names) {
      const clean = String(name || '').trim()
      if (clean) pairs.push({ directoryId: id, name: clean })
    }
  }
  return pairs.sort((a, b) =>
    a.directoryId === b.directoryId ? a.name.localeCompare(b.name) : a.directoryId - b.directoryId
  )
}

const closedSubdirsKey = (state) =>
  closedSubdirectoryPairs(state)
    .map((pair) => `${pair.directoryId}:${pair.name}`)
    .join(',')

const cleanDirectorySubpaths = (subpaths) =>
  Array.from(
    new Map(
      (subpaths || [])
        .map((item) => {
          const id = Number(item?.directoryId)
          const path = String(item?.path || '').trim()
          if (!Number.isFinite(id) || id <= 0 || !path) return null
          return [`${id}:${path}`, { directoryId: id, path }]
        })
        .filter(Boolean)
    ).values()
  ).sort((a, b) =>
    a.directoryId === b.directoryId ? a.path.localeCompare(b.path) : a.directoryId - b.directoryId
  )

const directorySubpathsKey = (state) =>
  cleanDirectorySubpaths(state?.directorySubpaths)
    .map((item) => `${item.directoryId}:${item.path}`)
    .join(',')

const directorySubpathKeyOf = (subpaths) =>
  cleanDirectorySubpaths(subpaths)
    .map((item) => `${item.directoryId}:${item.path}`)
    .join(',')

// Keeps only subpath entries whose directory is still active.
const pruneDirectorySubpaths = (subpaths, directoryIds) => {
  const keep = new Set(cleanDirectoryIds(directoryIds))
  return cleanDirectorySubpaths(subpaths).filter((item) => keep.has(item.directoryId))
}

// directorySubpaths scoped to the currently enabled directories.
export const directoryQuerySubpaths = (state) => {
  if (state?.directoryFilterMode !== DIRECTORY_FILTER_CUSTOM) {
    return []
  }
  const enabled = new Set(cleanDirectoryIds(state.enabledDirectoryIds))
  const active = cleanDirectoryIds((state.directories || []).map((directory) => directory?.id))
  if (active.length === 0) {
    return cleanDirectorySubpaths(state.directorySubpaths).filter((item) =>
      enabled.has(item.directoryId)
    )
  }
  const activeSet = new Set(active)
  return cleanDirectorySubpaths(state.directorySubpaths).filter(
    (item) => enabled.has(item.directoryId) && activeSet.has(item.directoryId)
  )
}

// Keeps only closed-subdirectory entries whose directory is still active.
const pruneClosedSubdirectories = (closed, directoryIds) => {
  const keep = new Set(cleanDirectoryIds(directoryIds))
  const next = {}
  for (const [rawId, names] of Object.entries(closed || {})) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || !keep.has(id)) continue
    const cleanNames = Array.isArray(names)
      ? Array.from(new Set(names.map((n) => String(n || '').trim()).filter(Boolean)))
      : []
    if (cleanNames.length > 0) next[id] = cleanNames
  }
  return next
}

const sameIds = (a, b) => {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((id, index) => id === b[index])
}

export const directoryQueryIds = (state) => {
  if (state?.directoryFilterMode !== DIRECTORY_FILTER_CUSTOM) {
    return []
  }
  const enabled = cleanDirectoryIds(state.enabledDirectoryIds)
  if (enabled.length === 0) {
    return [0]
  }
  const active = cleanDirectoryIds((state.directories || []).map((directory) => directory?.id))
  if (active.length === 0) {
    return enabled
  }
  const activeSet = new Set(active)
  const scoped = enabled.filter((id) => activeSet.has(id))
  if (scoped.length === 0) {
    return [0]
  }
  if (scoped.length === active.length) {
    return []
  }
  return scoped
}

const videoListRequestKey = (state, directoryIds = directoryQueryIds(state)) => {
  const search = state.searchTerm ? state.searchTerm : ''
  const effectiveSort = state.videoTempSort || state.sortOrder
  return [
    state.randomMode ? 'r' : 'p',
    state.randomMode ? 1 : state.page,
    state.pageSize,
    search,
    effectiveSort,
    state.randomMode ? state.randomSeed || '' : '',
    (state.selectedTags || []).join(','),
    directoryIds.join(','),
    closedSubdirsKey(state),
    directorySubpathsKey(state),
    state.videoHideJav ? 'hide-jav' : 'show-jav',
  ].join('|')
}

const javListRequestKey = (state, directoryIds = directoryQueryIds(state)) => {
  const search = state.javSearchTerm || ''
  const effectiveSort = state.javTempSort || state.javSort
  return [
    state.javRandomMode ? 'r' : 'p',
    state.javRandomMode ? 1 : state.javPage,
    state.javPageSize,
    search,
    (state.javIdolIds || []).join(','),
    (state.javTags || []).join(','),
    state.javStudioId ?? '',
    state.javSeriesId || '',
    state.javPrefix || '',
    state.javSoloOnly ? 'solo' : '',
    state.javFavoriteGroupId || '',
    effectiveSort,
    state.javRandomMode ? state.javRandomSeed || '' : '',
    directoryIds.join(','),
    closedSubdirsKey(state),
    directorySubpathsKey(state),
  ].join('|')
}

const idolListRequestKey = (state, directoryIds = directoryQueryIds(state)) => {
  const effectiveSort = effectiveIdolSort(state)
  return [
    'idol',
    state.idolPage,
    state.idolPageSize,
    state.javSearchTerm || '',
    effectiveSort,
    state.idolFavoriteGroupId || '',
    directoryIds.join(','),
    closedSubdirsKey(state),
    directorySubpathsKey(state),
  ].join('|')
}

const effectiveIdolSort = (state) => {
  if (state.idolTempSort) return state.idolTempSort
  if (state.idolFavoriteGroupId) return ''
  return state.idolSort
}

const studioListRequestKey = (state, directoryIds = directoryQueryIds(state)) =>
  [
    'studio',
    state.studioPage,
    state.studioPageSize,
    state.javSearchTerm || '',
    state.studioFavoriteGroupId || '',
    directoryIds.join(','),
    closedSubdirsKey(state),
    directorySubpathsKey(state),
  ].join('|')

const seriesListRequestKey = (state, directoryIds = directoryQueryIds(state)) =>
  [
    'series',
    state.seriesPage,
    state.seriesPageSize,
    state.javSearchTerm || '',
    state.seriesFavoriteGroupId || '',
    directoryIds.join(','),
    closedSubdirsKey(state),
    directorySubpathsKey(state),
  ].join('|')

export const useStore = create((set, get) => ({
  // UI state
  page: 1,
  pageSize: VIDEO_PAGE_SIZE,
  setPageSize: (size) => {
    const next = Math.max(1, Math.floor(Number(size) || VIDEO_PAGE_SIZE))
    set({ pageSize: next, videoTempSort: '', page: 1, randomMode: false, randomSeed: null })
  },
  selectedTags: [],
  selectedVideoIds: new Set(),
  selectedVideoMeta: {},
  searchTerm: '',
  sortOrder: 'recent',
  videoTempSort: '',
  videoHideJav: false,
  javSort: 'recent',
  javTempSort: '',
  randomMode: false,
  randomSeed: null,
  javRandomMode: false,
  javRandomSeed: null,
  viewMode: 'video', // video | jav
  javTab: 'list', // list | idol | studio | series
  javPage: 1,
  javPageSize: JAV_PAGE_SIZE,
  javGridColumns: JAV_GRID_COLUMNS_AUTO,
  javTitleMaxRows: JAV_TITLE_MAX_ROWS_DEFAULT,
  javIdolTagMaxRows: JAV_IDOL_TAG_MAX_ROWS_DEFAULT,
  javTagMaxRows: JAV_TAG_MAX_ROWS_DEFAULT,
  setJavGridColumns: (columns) => {
    const n = Math.floor(Number(columns))
    const next = Number.isFinite(n) && n > 0 ? Math.min(n, 12) : JAV_GRID_COLUMNS_AUTO
    set({ javGridColumns: next })
  },
  setJavPageSize: (size) => {
    const next = Math.max(1, Math.floor(Number(size) || JAV_PAGE_SIZE))
    set({
      javPageSize: next,
      javTempSort: '',
      javRandomMode: false,
      javRandomSeed: null,
      javPage: 1,
    })
  },
  javSearchTerm: '',
  javIdolIds: [],
  javTags: [],
  javStudioId: null,
  javStudioName: '',
  javSeriesId: null,
  javSeriesName: '',
  javPrefix: '',
  javSoloOnly: false,
  javFavoriteGroupId: null,
  javItems: [],
  javTotal: 0,
  javLoading: false,
  javLoadingMore: false,
  javError: null,
  // External (JavDB) works for the single selected idol, persisted by the
  // background scrape queue and read on demand.
  javExternalItems: [],
  javExternalPage: 1,
  javExternalHasNext: false,
  javExternalTotal: 0,
  javExternalTracked: false,
  javExternalLastScrapedAt: null,
  javExternalScrapeError: '',
  javExternalLoading: false,
  javExternalError: null,
  javExternalSourceURL: '',
  idolPage: 1,
  idolPageSize: JAV_PAGE_SIZE,
  idolSort: 'work',
  idolTempSort: '',
  idolFavoriteGroupId: null,
  idolItems: [],
  idolTotal: 0,
  idolLoading: false,
  idolLoadingMore: false,
  idolError: null,
  favoriteGroupsByType: {
    jav: [],
    idol: [],
    studio: [],
    series: [],
  },
  favoriteGroupsLoadingByType: {},
  favoriteGroupsErrorByType: {},
  studioPage: 1,
  studioPageSize: JAV_STUDIO_PAGE_SIZE,
  studioFavoriteGroupId: null,
  studioItems: [],
  studioTotal: 0,
  studioLoading: false,
  studioLoadingMore: false,
  studioError: null,
  seriesPage: 1,
  seriesPageSize: JAV_SERIES_PAGE_SIZE,
  seriesFavoriteGroupId: null,
  seriesItems: [],
  seriesTotal: 0,
  seriesLoading: false,
  seriesLoadingMore: false,
  seriesError: null,
  setIdolPageSize: (size) => {
    const next = Math.max(1, Math.floor(Number(size) || JAV_PAGE_SIZE))
    set({ idolPageSize: next, idolPage: 1, studioPage: 1, seriesPage: 1 })
  },
  setStudioPageSize: (size) => {
    const next = Math.max(1, Math.floor(Number(size) || JAV_STUDIO_PAGE_SIZE))
    set({ studioPageSize: next, studioPage: 1 })
  },
  setSeriesPageSize: (size) => {
    const next = Math.max(1, Math.floor(Number(size) || JAV_SERIES_PAGE_SIZE))
    set({ seriesPageSize: next, seriesPage: 1 })
  },
  setIdolSort: (sort) => {
    const normalized = normalizeIdolSort(sort)
    set({ idolSort: normalized, idolTempSort: '', idolPage: 1 })
  },
  setIdolTempSort: (sort) => {
    const normalized = normalizeIdolSort(sort, '')
    set({ idolTempSort: normalized })
  },
  setIdolFavoriteGroupId: (id) => {
    const parsed = Number(id)
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    set({ idolFavoriteGroupId: next, idolTempSort: '', idolPage: 1 })
  },
  setJavFavoriteGroupId: (id) => {
    const parsed = Number(id)
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    set({ javFavoriteGroupId: next, javPage: 1, javRandomMode: false, javRandomSeed: null })
  },
  setStudioFavoriteGroupId: (id) => {
    const parsed = Number(id)
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    set({ studioFavoriteGroupId: next, studioPage: 1 })
  },
  setSeriesFavoriteGroupId: (id) => {
    const parsed = Number(id)
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    set({ seriesFavoriteGroupId: next, seriesPage: 1 })
  },

  // data
  config: {},
  videos: [],
  tags: [],
  javTagOptions: [],
  directories: [],
  enabledDirectoryIds: [],
  directorySubpaths: [],
  closedSubdirectories: {},
  directoryFilterMode: DIRECTORY_FILTER_ALL,
  loading: false,
  videoLoadingMore: false,
  error: null,
  total: 0,
  hasNext: false,

  // actions
  setPage: (p) => set({ page: p }),
  setSelectedTags: (names, options = {}) => {
    const { resetPage = true, preserveTempSort = false } = options
    const clean = Array.from(new Set((names || []).map((n) => (n || '').trim()).filter(Boolean)))
    const updates = { selectedTags: clean }
    if (!preserveTempSort) {
      updates.videoTempSort = ''
    }
    if (resetPage) {
      updates.page = 1
    }
    set(updates)
  },
  setSearchTerm: (value, options = {}) => {
    const { resetPage = true } = options
    const trimmed = (value || '').trim()
    const state = get()
    const baseUpdate = { videoTempSort: '', randomMode: false, randomSeed: null }
    if (trimmed === state.searchTerm) {
      // 仅重置分页/随机模式
      const updates = { ...baseUpdate }
      if (resetPage && state.page !== 1) {
        updates.page = 1
      }
      set(updates)
      return
    }
    const next = { searchTerm: trimmed, ...baseUpdate }
    if (resetPage) {
      next.page = 1
    }
    set(next)
  },
  toggleTagFilter: (tagName) => {
    const { selectedTags } = get()
    const exists = selectedTags.includes(tagName)
    const next = exists ? selectedTags.filter((t) => t !== tagName) : [...selectedTags, tagName]
    set({ selectedTags: next, videoTempSort: '', page: 1 })
  },
  clearFilters: () => set({ selectedTags: [], videoTempSort: '', page: 1 }),
  toggleSelectVideo: (video) => {
    const key = videoSelectionKey(video)
    if (!video || !video.id || !key) return
    const label = video.filename || video.path || `#${video.id}`
    const setIds = new Set(get().selectedVideoIds)
    const meta = { ...get().selectedVideoMeta }
    if (setIds.has(key)) {
      setIds.delete(key)
      delete meta[key]
    } else {
      setIds.add(key)
      meta[key] = { label, video_id: video.id, location_id: video.location_id || null }
    }
    set({ selectedVideoIds: setIds, selectedVideoMeta: meta })
  },
  clearSelection: () => set({ selectedVideoIds: new Set(), selectedVideoMeta: {} }),
  setSortOrder: (order) => {
    const normalized = normalizeVideoSort(order)
    set({ sortOrder: normalized, videoTempSort: '', randomMode: false, randomSeed: null, page: 1 })
  },
  setVideoTempSort: (order) => {
    const normalized = normalizeVideoSort(order, '')
    set({ videoTempSort: normalized, randomMode: false, randomSeed: null })
  },
  setJavSort: (order) => {
    const normalized = normalizeJavSort(order)
    set({
      javSort: normalized,
      javTempSort: '',
      javRandomMode: false,
      javRandomSeed: null,
      javPage: 1,
    })
  },
  setJavTempSort: (order) => {
    const normalized = normalizeJavSort(order, '')
    set({ javTempSort: normalized, javRandomMode: false, javRandomSeed: null })
  },
  clearRandomMode: () => set({ randomMode: false, randomSeed: null }),
  clearJavRandom: () => set({ javTempSort: '', javRandomMode: false, javRandomSeed: null }),
  setViewMode: (mode) => {
    if (mode !== 'video' && mode !== 'jav') return
    set({
      viewMode: mode,
      ...(mode === 'jav' ? { videoTempSort: '' } : { javTempSort: '', idolTempSort: '' }),
    })
  },
  setJavTab: (tab) => {
    if (tab !== 'list' && tab !== 'idol' && tab !== 'studio' && tab !== 'series') return
    set({ javTab: tab, javTempSort: '', idolTempSort: '' })
  },
  setJavIdolIds: (idolIds) => {
    const clean = Array.from(
      new Set(
        (idolIds || [])
          .map((id) => Number.parseInt(String(id), 10))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    )
    set({
      javIdolIds: clean,
      javStudioId: null,
      javStudioName: '',
      javSeriesId: null,
      javSeriesName: '',
      javPrefix: '',
      javTempSort: '',
      javPage: 1,
    })
  },
  setJavTags: (tags) => {
    const clean = Array.from(
      new Set(
        (tags || [])
          .map((t) => Number.parseInt(String(t), 10))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    )
    set({
      javTags: clean,
      javStudioId: null,
      javStudioName: '',
      javSeriesId: null,
      javSeriesName: '',
      javPrefix: '',
      javTempSort: '',
      javPage: 1,
    })
  },
  setJavStudio: (studio) => {
    const id = Number(studio?.id)
    if (!Number.isFinite(id) || id <= 0) {
      set({ javStudioId: null, javStudioName: '', javPage: 1 })
      return
    }
    set({
      javStudioId: id,
      javStudioName: String(studio?.name || '').trim(),
      javSeriesId: null,
      javSeriesName: '',
      javPrefix: '',
      javSoloOnly: false,
      javIdolIds: [],
      javTags: [],
      javTempSort: '',
      javRandomMode: false,
      javRandomSeed: null,
      javPage: 1,
    })
  },
  setJavSeries: (series) => {
    const id = Number(series?.id)
    if (!Number.isFinite(id) || id <= 0) {
      set({ javSeriesId: null, javSeriesName: '', javPage: 1 })
      return
    }
    set({
      javSeriesId: id,
      javSeriesName: String(series?.name || '').trim(),
      javSoloOnly: false,
      javStudioId: null,
      javStudioName: '',
      javPrefix: '',
      javIdolIds: [],
      javTags: [],
      javTempSort: '',
      javRandomMode: false,
      javRandomSeed: null,
      javPage: 1,
    })
  },
  setJavPage: (p) => {
    const state = get()
    set({ javPage: state.javRandomMode ? 1 : p })
  },
  setIdolPage: (p) => set({ idolPage: p }),
  setStudioPage: (p) => set({ studioPage: p }),
  setSeriesPage: (p) => set({ seriesPage: p }),
  setJavSearchTerm: (value, options = {}) => {
    const { resetPage = true } = options
    const trimmed = (value || '').trim()
    const state = get()
    if (trimmed === state.javSearchTerm) {
      if (resetPage && state.javPage !== 1) {
        set({
          javTempSort: '',
          idolTempSort: '',
          javPage: 1,
          idolPage: 1,
          studioPage: 1,
          seriesPage: 1,
        })
      }
      return
    }
    const next = { javSearchTerm: trimmed, javTempSort: '', idolTempSort: '' }
    if (resetPage) {
      next.javPage = 1
      next.idolPage = 1
      next.studioPage = 1
      next.seriesPage = 1
    }
    set(next)
  },

  loadTags: async (options = {}) => {
    const { videoHideJav } = get()
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const key = `tags|${directoryIds.join(',')}|${directorySubpathsKey(get())}|${closedSubdirsKey(get())}|${videoHideJav ? 'hide-jav' : 'show-jav'}`
    if (tagFetchInFlight && tagFetchInFlightKey === key) {
      return tagFetchInFlight
    }
    if (!options.force && options.skipUnchanged && key === lastTagFetchKey) {
      return null
    }
    tagFetchInFlightKey = key
    tagFetchInFlight = (async () => {
      try {
        const tags = await fetchTags({
          directoryIds,
          directorySubpaths,
          closedSubdirs,
          hideJav: videoHideJav,
        })
        set({ tags })
        lastTagFetchKey = key
        return tags
      } catch (e) {
        set({ error: e.message })
        return null
      } finally {
        if (tagFetchInFlightKey === key) {
          tagFetchInFlight = null
          tagFetchInFlightKey = null
        }
      }
    })()
    return tagFetchInFlight
  },
  loadJavTags: async (options = {}) => {
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const key = `jav-tags|${directoryIds.join(',')}|${directorySubpathsKey(get())}|${closedSubdirsKey(get())}`
    if (javTagFetchInFlight && javTagFetchInFlightKey === key) {
      return javTagFetchInFlight
    }
    if (!options.force && options.skipUnchanged && key === lastJavTagFetchKey) {
      return null
    }
    javTagFetchInFlightKey = key
    javTagFetchInFlight = (async () => {
      try {
        const tags = await fetchJavTags({ directoryIds, directorySubpaths, closedSubdirs })
        set({ javTagOptions: tags })
        lastJavTagFetchKey = key
        return tags
      } catch (e) {
        set({ javError: getErrorMessage(e) })
        return null
      } finally {
        if (javTagFetchInFlightKey === key) {
          javTagFetchInFlight = null
          javTagFetchInFlightKey = null
        }
      }
    })()
    return javTagFetchInFlight
  },
  loadConfig: async () => {
    try {
      const cfg = await fetchConfig()
      const state = get()
      const clamp = (raw) => {
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n) || n <= 0) return null
        return Math.min(n, 500)
      }
      const updates = { config: cfg }
      const videoSize = clamp(cfg?.video_page_size)
      const videoSort = normalizeVideoSort((cfg?.video_sort || '').toLowerCase(), '')
      const videoHideJav = String(cfg?.video_hide_jav || '').toLowerCase() === 'true'
      const javSize = clamp(cfg?.jav_page_size)
      const javGridColumnsRaw = parseInt(cfg?.jav_grid_columns, 10)
      const javGridColumns =
        Number.isFinite(javGridColumnsRaw) && javGridColumnsRaw > 0
          ? Math.min(javGridColumnsRaw, 12)
          : JAV_GRID_COLUMNS_AUTO
      const javTitleMaxRowsRaw = parseInt(cfg?.jav_title_max_rows, 10)
      const javTitleMaxRows =
        Number.isFinite(javTitleMaxRowsRaw) && javTitleMaxRowsRaw >= 0
          ? Math.min(javTitleMaxRowsRaw, 12)
          : JAV_TITLE_MAX_ROWS_DEFAULT
      const javIdolTagMaxRowsRaw = parseInt(cfg?.jav_idol_tag_max_rows, 10)
      const javIdolTagMaxRows =
        Number.isFinite(javIdolTagMaxRowsRaw) && javIdolTagMaxRowsRaw >= 0
          ? Math.min(javIdolTagMaxRowsRaw, 12)
          : JAV_IDOL_TAG_MAX_ROWS_DEFAULT
      const javTagMaxRowsRaw = parseInt(cfg?.jav_tag_max_rows, 10)
      const javTagMaxRows =
        Number.isFinite(javTagMaxRowsRaw) && javTagMaxRowsRaw >= 0
          ? Math.min(javTagMaxRowsRaw, 12)
          : JAV_TAG_MAX_ROWS_DEFAULT
      const idolSize = clamp(cfg?.idol_page_size)
      const studioSize = clamp(cfg?.studio_page_size)
      const seriesSize = clamp(cfg?.series_page_size)
      const javSort = normalizeJavSort((cfg?.jav_sort || '').toLowerCase(), '')
      const idolSort = normalizeIdolSort((cfg?.idol_sort || '').toLowerCase(), '')
      if (videoSize && videoSize !== state.pageSize) {
        updates.pageSize = videoSize
      }
      if (videoSort) {
        updates.sortOrder = videoSort
      }
      if (videoHideJav !== state.videoHideJav) {
        updates.videoHideJav = videoHideJav
      }
      if (javSort) {
        updates.javSort = javSort
      }
      if (idolSort) {
        updates.idolSort = idolSort
      }
      if (javSize && javSize !== state.javPageSize) {
        updates.javPageSize = javSize
      }
      if (javGridColumns !== state.javGridColumns) {
        updates.javGridColumns = javGridColumns
      }
      if (javTitleMaxRows !== state.javTitleMaxRows) {
        updates.javTitleMaxRows = javTitleMaxRows
      }
      if (javIdolTagMaxRows !== state.javIdolTagMaxRows) {
        updates.javIdolTagMaxRows = javIdolTagMaxRows
      }
      if (javTagMaxRows !== state.javTagMaxRows) {
        updates.javTagMaxRows = javTagMaxRows
      }
      if (idolSize && idolSize !== state.idolPageSize) {
        updates.idolPageSize = idolSize
      }
      if (studioSize && studioSize !== state.studioPageSize) {
        updates.studioPageSize = studioSize
      }
      if (seriesSize && seriesSize !== state.seriesPageSize) {
        updates.seriesPageSize = seriesSize
      }
      set(updates)
      return cfg
    } catch (e) {
      console.error('load config failed', e)
      return null
    }
  },
  loadDirectories: async () => {
    try {
      const directories = await fetchDirectories()
      const active = directories.filter((d) => !d.is_delete)
      const activeIDs = cleanDirectoryIds(active.map((d) => d.id))
      const activeSet = new Set(activeIDs)
      const state = get()
      const enabled =
        state.directoryFilterMode === DIRECTORY_FILTER_ALL
          ? activeIDs
          : cleanDirectoryIds(state.enabledDirectoryIds).filter((id) => activeSet.has(id))
      const nextMode =
        state.directoryFilterMode === DIRECTORY_FILTER_CUSTOM &&
        cleanDirectorySubpaths(state.directorySubpaths).length === 0 &&
        enabled.length === activeIDs.length
          ? DIRECTORY_FILTER_ALL
          : state.directoryFilterMode
      set({
        directories: active,
        enabledDirectoryIds: nextMode === DIRECTORY_FILTER_ALL ? activeIDs : enabled,
        directoryFilterMode: nextMode,
        directorySubpaths: pruneDirectorySubpaths(state.directorySubpaths, activeIDs),
        closedSubdirectories: pruneClosedSubdirectories(state.closedSubdirectories, activeIDs),
      })
    } catch (e) {
      console.error(zh('加载目录失败', 'Failed to load directories'), e)
    }
  },
  loadVideos: async (options = {}) => {
    const {
      page: p0,
      pageSize,
      selectedTags,
      searchTerm,
      sortOrder,
      videoTempSort,
      videoHideJav,
      randomMode,
      randomSeed,
    } = get()
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const search = searchTerm ? searchTerm : ''
    const effectiveSort = videoTempSort || sortOrder
    const key = videoListRequestKey({ ...get(), page: p0 }, directoryIds)
    if (!options.force && key === lastVideoFetchKey) {
      return
    }
    lastVideoFetchKey = key
    const reqId = (videoLoadSeq += 1)
    set({ loading: true, error: null, videoLoadingMore: false })
    try {
      const resp = await fetchVideos({
        limit: pageSize,
        offset: randomMode ? 0 : (p0 - 1) * pageSize,
        tags: selectedTags,
        search,
        sort: randomMode ? 'random' : effectiveSort,
        seed: randomMode ? randomSeed : null,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        hideJav: videoHideJav,
      })
      if (reqId !== videoLoadSeq || key !== videoListRequestKey(get())) return
      const total = resp.total ?? 0
      const items = resp.items ?? []
      const lastPage = Math.max(1, Math.ceil(total / pageSize))
      const hasNext = randomMode ? false : p0 < lastPage
      set({ videos: items, total, hasNext })
    } catch (e) {
      if (reqId !== videoLoadSeq || key !== videoListRequestKey(get())) return
      set({ error: e.message })
    } finally {
      if (reqId === videoLoadSeq) {
        set({ loading: false })
      }
    }
  },
  loadMoreVideos: async () => {
    const state = get()
    if (state.loading || state.videoLoadingMore || state.randomMode) return
    const loaded = Array.isArray(state.videos) ? state.videos.length : 0
    const total = state.total || 0
    const baseOffset = (state.page - 1) * state.pageSize
    if (total > 0 && baseOffset + loaded >= total) return

    const directoryIds = directoryQueryIds(state)
    const directorySubpaths = directoryQuerySubpaths(state)
    const closedSubdirs = closedSubdirectoryPairs(state)
    const search = state.searchTerm ? state.searchTerm : ''
    const effectiveSort = state.videoTempSort || state.sortOrder
    const requestKey = videoListRequestKey(state, directoryIds)
    const loadReqId = videoLoadSeq
    const loadMoreReqId = (videoLoadMoreSeq += 1)
    set({ videoLoadingMore: true, error: null })
    try {
      const resp = await fetchVideos({
        limit: state.pageSize,
        offset: baseOffset + loaded,
        tags: state.selectedTags,
        search,
        sort: effectiveSort,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        hideJav: state.videoHideJav,
      })
      if (
        loadReqId !== videoLoadSeq ||
        loadMoreReqId !== videoLoadMoreSeq ||
        requestKey !== videoListRequestKey(get())
      ) {
        return
      }
      const items = resp.items ?? []
      const nextTotal = resp.total ?? total
      const nextLoaded = loaded + items.length
      set({
        videos: [...(get().videos || []), ...items],
        total: nextTotal,
        hasNext:
          nextTotal > 0 ? baseOffset + nextLoaded < nextTotal : items.length >= state.pageSize,
      })
    } catch (e) {
      if (
        loadReqId !== videoLoadSeq ||
        loadMoreReqId !== videoLoadMoreSeq ||
        requestKey !== videoListRequestKey(get())
      ) {
        return
      }
      set({ error: e.message })
    } finally {
      if (loadMoreReqId === videoLoadMoreSeq) {
        set({ videoLoadingMore: false })
      }
    }
  },
  loadJavs: async (options = {}) => {
    const {
      javPage,
      javPageSize,
      javSearchTerm,
      javIdolIds,
      javTags,
      javStudioId,
      javSeriesId,
      javPrefix,
      javSoloOnly,
      javFavoriteGroupId,
      javSort,
      javTempSort,
      javRandomMode,
      javRandomSeed,
    } = get()
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const search = javSearchTerm || ''
    const effectiveSort = javTempSort || javSort
    const key = javListRequestKey(get(), directoryIds)
    if (!options.force && key === lastJavFetchKey) {
      return
    }
    lastJavFetchKey = key
    const reqId = (javLoadSeq += 1)
    set({ javLoading: true, javLoadingMore: false, javError: null })
    try {
      const resp = await fetchJavs({
        limit: javPageSize,
        offset: javRandomMode ? 0 : (javPage - 1) * javPageSize,
        search,
        idolIds: javIdolIds,
        tagIds: javTags,
        studioId: javStudioId,
        seriesId: javSeriesId,
        prefix: javPrefix,
        soloOnly: javSoloOnly,
        favoriteGroupId: javFavoriteGroupId,
        sort: javRandomMode ? 'random' : effectiveSort,
        seed: javRandomMode ? javRandomSeed : null,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
      })
      if (reqId !== javLoadSeq || key !== javListRequestKey(get())) return
      const items = resp.items || []
      set({
        javItems: items,
        javTotal: javRandomMode ? items.length : resp.total || 0,
      })
    } catch (e) {
      if (reqId !== javLoadSeq || key !== javListRequestKey(get())) return
      set({ javError: getErrorMessage(e) })
    } finally {
      if (reqId === javLoadSeq) {
        set({ javLoading: false })
      }
    }
  },
  loadMoreJavs: async () => {
    const state = get()
    if (state.javLoading || state.javLoadingMore || state.javRandomMode) return
    const loaded = Array.isArray(state.javItems) ? state.javItems.length : 0
    const total = state.javTotal || 0
    const baseOffset = (state.javPage - 1) * state.javPageSize
    if (total > 0 && baseOffset + loaded >= total) return

    const directoryIds = directoryQueryIds(state)
    const directorySubpaths = directoryQuerySubpaths(state)
    const closedSubdirs = closedSubdirectoryPairs(state)
    const search = state.javSearchTerm || ''
    const effectiveSort = state.javTempSort || state.javSort
    const requestKey = javListRequestKey(state, directoryIds)
    const loadReqId = javLoadSeq
    const loadMoreReqId = (javLoadMoreSeq += 1)
    set({ javLoadingMore: true, javError: null })
    try {
      const resp = await fetchJavs({
        limit: state.javPageSize,
        offset: baseOffset + loaded,
        search,
        idolIds: state.javIdolIds,
        tagIds: state.javTags,
        studioId: state.javStudioId,
        seriesId: state.javSeriesId,
        prefix: state.javPrefix,
        soloOnly: state.javSoloOnly,
        favoriteGroupId: state.javFavoriteGroupId,
        sort: effectiveSort,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
      })
      if (
        loadReqId !== javLoadSeq ||
        loadMoreReqId !== javLoadMoreSeq ||
        requestKey !== javListRequestKey(get())
      ) {
        return
      }
      const items = resp.items || []
      set({
        javItems: [...(get().javItems || []), ...items],
        javTotal: resp.total || total,
      })
    } catch (e) {
      if (
        loadReqId !== javLoadSeq ||
        loadMoreReqId !== javLoadMoreSeq ||
        requestKey !== javListRequestKey(get())
      ) {
        return
      }
      set({ javError: getErrorMessage(e) })
    } finally {
      if (loadMoreReqId === javLoadMoreSeq) {
        set({ javLoadingMore: false })
      }
    }
  },
  // loadJavExternalWorks reads one page of the selected idol's persisted
  // JavDB works (scraped in the background). The library list (loadJavs) only
  // contains works with local files; this covers the rest so both can be shown
  // side by side. No live JavDB requests happen here.
  loadJavExternalWorks: async (targetPage = 1, options = {}) => {
    const state = get()
    const idolIds = Array.isArray(state.javIdolIds) ? state.javIdolIds : []
    if (idolIds.length !== 1) {
      set({
        javExternalItems: [],
        javExternalPage: 1,
        javExternalHasNext: false,
        javExternalTotal: 0,
        javExternalTracked: false,
        javExternalLastScrapedAt: null,
        javExternalScrapeError: '',
        javExternalError: null,
      })
      return
    }
    const idolId = Number(idolIds[0])
    const page = Math.max(1, Math.floor(Number(targetPage) || 1))
    const key = `${idolId}|${page}`
    if (!options.force && key === lastJavExternalFetchKey) {
      return
    }
    lastJavExternalFetchKey = key
    const reqId = (javExternalLoadSeq += 1)
    set({ javExternalLoading: true, javExternalError: null })
    try {
      const resp = await fetchJavExternalWorks(idolId, { page })
      if (reqId !== javExternalLoadSeq || key !== `${Number(get().javIdolIds[0])}|${page}`) {
        return
      }
      set({
        javExternalItems: resp.items || [],
        javExternalPage: page,
        javExternalHasNext: Boolean(resp.has_next),
        javExternalTotal: resp.total || 0,
        javExternalTracked: Boolean(resp.tracked),
        javExternalLastScrapedAt: resp.last_scraped_at || null,
        javExternalScrapeError: resp.last_error || '',
        javExternalSourceURL: resp.source_url || '',
      })
    } catch (e) {
      if (reqId !== javExternalLoadSeq || key !== `${Number(get().javIdolIds[0])}|${page}`) {
        return
      }
      set({ javExternalError: getErrorMessage(e) })
    } finally {
      if (reqId === javExternalLoadSeq) {
        set({ javExternalLoading: false })
      }
    }
  },
  loadJavIdols: async (options = {}) => {
    const { idolPage, idolPageSize, javSearchTerm, idolFavoriteGroupId } = get()
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const search = javSearchTerm || ''
    const key = idolListRequestKey(get(), directoryIds)
    if (!options.force && key === lastIdolFetchKey) {
      return
    }
    lastIdolFetchKey = key
    const reqId = (idolLoadSeq += 1)
    set({ idolLoading: true, idolLoadingMore: false, idolError: null })
    try {
      const resp = await fetchJavIdols({
        limit: idolPageSize,
        offset: (idolPage - 1) * idolPageSize,
        search,
        sort: effectiveIdolSort(get()),
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        favoriteGroupId: idolFavoriteGroupId,
      })
      if (reqId !== idolLoadSeq || key !== idolListRequestKey(get())) return
      set({
        idolItems: resp.items || [],
        idolTotal: resp.total || 0,
      })
    } catch (e) {
      if (reqId !== idolLoadSeq || key !== idolListRequestKey(get())) return
      set({ idolError: getErrorMessage(e) })
    } finally {
      if (reqId === idolLoadSeq) {
        set({ idolLoading: false })
      }
    }
  },
  loadMoreJavIdols: async () => {
    const state = get()
    if (state.idolLoading || state.idolLoadingMore) return
    const loaded = Array.isArray(state.idolItems) ? state.idolItems.length : 0
    const total = state.idolTotal || 0
    const baseOffset = (state.idolPage - 1) * state.idolPageSize
    if (total > 0 && baseOffset + loaded >= total) return

    const directoryIds = directoryQueryIds(state)
    const directorySubpaths = directoryQuerySubpaths(state)
    const closedSubdirs = closedSubdirectoryPairs(state)
    const search = state.javSearchTerm || ''
    const requestKey = idolListRequestKey(state, directoryIds)
    const loadReqId = idolLoadSeq
    const loadMoreReqId = (idolLoadMoreSeq += 1)
    set({ idolLoadingMore: true, idolError: null })
    try {
      const resp = await fetchJavIdols({
        limit: state.idolPageSize,
        offset: baseOffset + loaded,
        search,
        sort: effectiveIdolSort(state),
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        favoriteGroupId: state.idolFavoriteGroupId,
      })
      if (
        loadReqId !== idolLoadSeq ||
        loadMoreReqId !== idolLoadMoreSeq ||
        requestKey !== idolListRequestKey(get())
      ) {
        return
      }
      const items = resp.items || []
      set({
        idolItems: [...(get().idolItems || []), ...items],
        idolTotal: resp.total || total,
      })
    } catch (e) {
      if (
        loadReqId !== idolLoadSeq ||
        loadMoreReqId !== idolLoadMoreSeq ||
        requestKey !== idolListRequestKey(get())
      ) {
        return
      }
      set({ idolError: getErrorMessage(e) })
    } finally {
      if (loadMoreReqId === idolLoadMoreSeq) {
        set({ idolLoadingMore: false })
      }
    }
  },
  loadJavFavoriteGroups: async (entityType = 'idol', options = {}) => {
    const type = ['jav', 'idol', 'studio', 'series'].includes(entityType) ? entityType : 'idol'
    const directoryIds = directoryQueryIds(get())
    const key = `${type}-favorite-groups|${directoryIds.join(',')}`
    if (!options.force && key === lastFavoriteGroupFetchKeys[type]) {
      return get().favoriteGroupsByType?.[type] || []
    }
    lastFavoriteGroupFetchKeys[type] = key
    set((state) => ({
      favoriteGroupsLoadingByType: { ...(state.favoriteGroupsLoadingByType || {}), [type]: true },
      favoriteGroupsErrorByType: { ...(state.favoriteGroupsErrorByType || {}), [type]: null },
    }))
    try {
      const groups = await fetchJavFavoriteGroups(type, { directoryIds })
      set((state) => ({
        favoriteGroupsByType: { ...(state.favoriteGroupsByType || {}), [type]: groups || [] },
      }))
      return groups || []
    } catch (e) {
      const message = getErrorMessage(e)
      set((state) => ({
        favoriteGroupsErrorByType: {
          ...(state.favoriteGroupsErrorByType || {}),
          [type]: message,
        },
      }))
      return get().favoriteGroupsByType?.[type] || []
    } finally {
      set((state) => ({
        favoriteGroupsLoadingByType: {
          ...(state.favoriteGroupsLoadingByType || {}),
          [type]: false,
        },
      }))
    }
  },
  loadJavStudios: async (options = {}) => {
    const { studioPage, studioPageSize, javSearchTerm, studioFavoriteGroupId } = get()
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const search = javSearchTerm || ''
    const key = studioListRequestKey(get(), directoryIds)
    if (!options.force && key === lastStudioFetchKey) {
      return
    }
    lastStudioFetchKey = key
    const reqId = (studioLoadSeq += 1)
    set({ studioLoading: true, studioLoadingMore: false, studioError: null })
    try {
      const resp = await fetchJavStudios({
        limit: studioPageSize,
        offset: (studioPage - 1) * studioPageSize,
        search,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        favoriteGroupId: studioFavoriteGroupId,
      })
      if (reqId !== studioLoadSeq || key !== studioListRequestKey(get())) return
      set({
        studioItems: resp.items || [],
        studioTotal: resp.total || 0,
      })
    } catch (e) {
      if (reqId !== studioLoadSeq || key !== studioListRequestKey(get())) return
      set({ studioError: getErrorMessage(e) })
    } finally {
      if (reqId === studioLoadSeq) {
        set({ studioLoading: false })
      }
    }
  },
  loadMoreJavStudios: async () => {
    const state = get()
    if (state.studioLoading || state.studioLoadingMore) return
    const loaded = Array.isArray(state.studioItems) ? state.studioItems.length : 0
    const total = state.studioTotal || 0
    const baseOffset = (state.studioPage - 1) * state.studioPageSize
    if (total > 0 && baseOffset + loaded >= total) return

    const directoryIds = directoryQueryIds(state)
    const directorySubpaths = directoryQuerySubpaths(state)
    const closedSubdirs = closedSubdirectoryPairs(state)
    const search = state.javSearchTerm || ''
    const requestKey = studioListRequestKey(state, directoryIds)
    const loadReqId = studioLoadSeq
    const loadMoreReqId = (studioLoadMoreSeq += 1)
    set({ studioLoadingMore: true, studioError: null })
    try {
      const resp = await fetchJavStudios({
        limit: state.studioPageSize,
        offset: baseOffset + loaded,
        search,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        favoriteGroupId: state.studioFavoriteGroupId,
      })
      if (
        loadReqId !== studioLoadSeq ||
        loadMoreReqId !== studioLoadMoreSeq ||
        requestKey !== studioListRequestKey(get())
      ) {
        return
      }
      const items = resp.items || []
      set({
        studioItems: [...(get().studioItems || []), ...items],
        studioTotal: resp.total || total,
      })
    } catch (e) {
      if (
        loadReqId !== studioLoadSeq ||
        loadMoreReqId !== studioLoadMoreSeq ||
        requestKey !== studioListRequestKey(get())
      ) {
        return
      }
      set({ studioError: getErrorMessage(e) })
    } finally {
      if (loadMoreReqId === studioLoadMoreSeq) {
        set({ studioLoadingMore: false })
      }
    }
  },
  loadJavSeries: async (options = {}) => {
    const { seriesPage, seriesPageSize, javSearchTerm, seriesFavoriteGroupId } = get()
    const directoryIds = directoryQueryIds(get())
    const directorySubpaths = directoryQuerySubpaths(get())
    const closedSubdirs = closedSubdirectoryPairs(get())
    const search = javSearchTerm || ''
    const key = seriesListRequestKey(get(), directoryIds)
    if (!options.force && key === lastSeriesFetchKey) {
      return
    }
    lastSeriesFetchKey = key
    const reqId = (seriesLoadSeq += 1)
    set({ seriesLoading: true, seriesLoadingMore: false, seriesError: null })
    try {
      const resp = await fetchJavSeries({
        limit: seriesPageSize,
        offset: (seriesPage - 1) * seriesPageSize,
        search,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        favoriteGroupId: seriesFavoriteGroupId,
      })
      if (reqId !== seriesLoadSeq || key !== seriesListRequestKey(get())) return
      set({
        seriesItems: resp.items || [],
        seriesTotal: resp.total || 0,
      })
    } catch (e) {
      if (reqId !== seriesLoadSeq || key !== seriesListRequestKey(get())) return
      set({ seriesError: getErrorMessage(e) })
    } finally {
      if (reqId === seriesLoadSeq) {
        set({ seriesLoading: false })
      }
    }
  },
  loadMoreJavSeries: async () => {
    const state = get()
    if (state.seriesLoading || state.seriesLoadingMore) return
    const loaded = Array.isArray(state.seriesItems) ? state.seriesItems.length : 0
    const total = state.seriesTotal || 0
    const baseOffset = (state.seriesPage - 1) * state.seriesPageSize
    if (total > 0 && baseOffset + loaded >= total) return

    const directoryIds = directoryQueryIds(state)
    const directorySubpaths = directoryQuerySubpaths(state)
    const closedSubdirs = closedSubdirectoryPairs(state)
    const search = state.javSearchTerm || ''
    const requestKey = seriesListRequestKey(state, directoryIds)
    const loadReqId = seriesLoadSeq
    const loadMoreReqId = (seriesLoadMoreSeq += 1)
    set({ seriesLoadingMore: true, seriesError: null })
    try {
      const resp = await fetchJavSeries({
        limit: state.seriesPageSize,
        offset: baseOffset + loaded,
        search,
        directoryIds,
        directorySubpaths,
        closedSubdirs,
        favoriteGroupId: state.seriesFavoriteGroupId,
      })
      if (
        loadReqId !== seriesLoadSeq ||
        loadMoreReqId !== seriesLoadMoreSeq ||
        requestKey !== seriesListRequestKey(get())
      ) {
        return
      }
      const items = resp.items || []
      set({
        seriesItems: [...(get().seriesItems || []), ...items],
        seriesTotal: resp.total || total,
      })
    } catch (e) {
      if (
        loadReqId !== seriesLoadSeq ||
        loadMoreReqId !== seriesLoadMoreSeq ||
        requestKey !== seriesListRequestKey(get())
      ) {
        return
      }
      set({ seriesError: getErrorMessage(e) })
    } finally {
      if (loadMoreReqId === seriesLoadMoreSeq) {
        set({ seriesLoadingMore: false })
      }
    }
  },

  createTag: async (name) => {
    const tag = await createTag(name)
    set({ tags: [...get().tags, tag] })
  },
  deleteTag: async (id) => {
    await deleteTag(id)
    set({ tags: get().tags.filter((t) => t.id !== id) })
  },
  renameTag: async (id, name) => {
    await renameTag(id, name)
    set({ tags: get().tags.map((t) => (t.id === id ? { ...t, name } : t)) })
  },
  addTagToSelection: async (tagId) => {
    const ids = selectedVideoContentIds(get())
    if (ids.length === 0) return
    await addTagToVideos(tagId, ids)
    await get().loadVideos()
  },
  removeTagFromSelection: async (tagId) => {
    const ids = selectedVideoContentIds(get())
    if (ids.length === 0) return
    await removeTagFromVideos(tagId, ids)
    await get().loadVideos()
  },
  goToLastPage: async () => {
    set({ loading: true, error: null })
    try {
      const {
        pageSize,
        selectedTags,
        searchTerm,
        sortOrder,
        videoTempSort,
        randomMode,
        randomSeed,
      } = get()
      const directoryIds = directoryQueryIds(get())
      const directorySubpaths = directoryQuerySubpaths(get())
      const effectiveSort = videoTempSort || sortOrder
      // Get total via a cheap fetch (limit=1) or use existing total
      let { total } = get()
      const search = searchTerm ? searchTerm : ''
      if (!total) {
        const res = await fetchVideos({
          limit: 1,
          offset: 0,
          tags: selectedTags,
          search,
          sort: randomMode ? 'random' : effectiveSort,
          seed: randomMode ? randomSeed : null,
          directoryIds,
          directorySubpaths,
        })
        total = res.total ?? 0
        set({ total })
      }
      const lastPage = Math.max(1, Math.ceil(total / pageSize))
      const res2 = await fetchVideos({
        limit: pageSize,
        offset: (lastPage - 1) * pageSize,
        tags: selectedTags,
        search,
        sort: randomMode ? 'random' : effectiveSort,
        seed: randomMode ? randomSeed : null,
        directoryIds,
        directorySubpaths,
      })
      const items = res2.items ?? []
      set({ page: lastPage, videos: items, hasNext: false })
    } catch (e) {
      set({ error: e.message })
    } finally {
      set({ loading: false })
    }
  },
  loadRandom: async (seed) => {
    const nextSeed = normalizeSeed(seed) ?? generateSeed()
    const nextPage = 1
    set({ videoTempSort: '', randomMode: true, randomSeed: nextSeed, page: nextPage })
  },
  loadJavRandom: async (seed) => {
    const nextSeed = normalizeSeed(seed) ?? generateSeed()
    set({ javTempSort: '', javRandomMode: true, javRandomSeed: nextSeed, javPage: 1 })
  },

  setEnabledDirectoryIds: (ids) => {
    const clean = cleanDirectoryIds(ids)
    const active = cleanDirectoryIds(get().directories.map((directory) => directory?.id))
    const mode =
      active.length > 0 && clean.length === active.length
        ? DIRECTORY_FILTER_ALL
        : DIRECTORY_FILTER_CUSTOM
    set({
      enabledDirectoryIds: mode === DIRECTORY_FILTER_ALL ? active : clean,
      directoryFilterMode: mode,
      directorySubpaths: [],
      closedSubdirectories: pruneClosedSubdirectories(get().closedSubdirectories, clean),
      page: 1,
      javPage: 1,
      idolPage: 1,
      studioPage: 1,
      seriesPage: 1,
      videoTempSort: '',
      javTempSort: '',
      idolTempSort: '',
      randomMode: false,
      randomSeed: null,
      javRandomMode: false,
      javRandomSeed: null,
    })
    lastVideoFetchKey = null
    lastJavFetchKey = null
    lastIdolFetchKey = null
    lastStudioFetchKey = null
    lastSeriesFetchKey = null
    lastTagFetchKey = null
    lastJavTagFetchKey = null
  },
  // 将视图聚焦到某个根目录下的子目录（含其全部子目录），例如“查看所在目录”。
  // ids 为启用的根目录 ID 列表，subpaths 为 [{ directoryId, path }] 形式的子目录聚焦。
  setDirectorySubpathFilter: (ids, subpaths) => {
    const clean = cleanDirectoryIds(ids)
    const cleanSubpaths = cleanDirectorySubpaths(subpaths)
    const active = cleanDirectoryIds(get().directories.map((directory) => directory?.id))
    const activeSet = new Set(active)
    const scopedSubpaths = cleanSubpaths.filter((item) => activeSet.has(item.directoryId))
    const mode =
      active.length > 0 && clean.length === active.length && scopedSubpaths.length === 0
        ? DIRECTORY_FILTER_ALL
        : DIRECTORY_FILTER_CUSTOM
    set({
      enabledDirectoryIds: mode === DIRECTORY_FILTER_ALL ? active : clean,
      directoryFilterMode: mode,
      directorySubpaths: scopedSubpaths,
      closedSubdirectories: pruneClosedSubdirectories(get().closedSubdirectories, clean),
      page: 1,
      javPage: 1,
      idolPage: 1,
      studioPage: 1,
      seriesPage: 1,
      videoTempSort: '',
      javTempSort: '',
      idolTempSort: '',
      randomMode: false,
      randomSeed: null,
      javRandomMode: false,
      javRandomSeed: null,
    })
    lastVideoFetchKey = null
    lastJavFetchKey = null
    lastIdolFetchKey = null
    lastStudioFetchKey = null
    lastSeriesFetchKey = null
    lastTagFetchKey = null
    lastJavTagFetchKey = null
  },
  setClosedSubdirectories: (directoryId, names) => {
    const id = Number(directoryId)
    const cleanNames = Array.from(
      new Set((names || []).map((name) => String(name || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
    const state = get()
    const next = { ...(state.closedSubdirectories || {}) }
    if (cleanNames.length === 0) {
      delete next[id]
    } else {
      next[id] = cleanNames
    }
    set({
      closedSubdirectories: next,
      page: 1,
      javPage: 1,
      idolPage: 1,
      studioPage: 1,
      seriesPage: 1,
      videoTempSort: '',
      javTempSort: '',
      idolTempSort: '',
      randomMode: false,
      randomSeed: null,
      javRandomMode: false,
      javRandomSeed: null,
    })
    lastVideoFetchKey = null
    lastJavFetchKey = null
    lastIdolFetchKey = null
    lastStudioFetchKey = null
    lastSeriesFetchKey = null
    lastTagFetchKey = null
    lastJavTagFetchKey = null
  },
  setClosedSubdirectoriesFromUrl: (pairs) => {
    const map = {}
    for (const pair of Array.isArray(pairs) ? pairs : []) {
      const id = Number(pair?.directoryId)
      const name = String(pair?.name || '').trim()
      if (!Number.isFinite(id) || id <= 0 || !name) continue
      if (!map[id]) map[id] = []
      if (!map[id].includes(name)) map[id].push(name)
    }
    const active = cleanDirectoryIds(get().directories.map((directory) => directory?.id))
    const pruned = pruneClosedSubdirectories(map, active)
    const state = get()
    const current = state.closedSubdirectories || {}
    if (JSON.stringify(current) === JSON.stringify(pruned)) {
      return
    }
    set({ closedSubdirectories: pruned })
    lastVideoFetchKey = null
    lastJavFetchKey = null
    lastIdolFetchKey = null
    lastStudioFetchKey = null
    lastSeriesFetchKey = null
    lastTagFetchKey = null
    lastJavTagFetchKey = null
  },
  setDirectoryFilterFromUrl: (ids, subpaths) => {
    const cleanSubpaths = cleanDirectorySubpaths(subpaths)
    const resetKeys = () => {
      lastVideoFetchKey = null
      lastJavFetchKey = null
      lastIdolFetchKey = null
      lastStudioFetchKey = null
      lastSeriesFetchKey = null
      lastTagFetchKey = null
      lastJavTagFetchKey = null
    }
    const subpathKeyOfState = directorySubpathKeyOf(get().directorySubpaths)
    if (ids == null) {
      const active = cleanDirectoryIds(get().directories.map((directory) => directory?.id))
      const state = get()
      if (cleanSubpaths.length > 0) {
        // 仅带 directory_subpaths（如单根目录场景）：按子目录所属目录启用过滤
        const anchorIds = cleanDirectoryIds(cleanSubpaths.map((item) => item.directoryId))
        const enabled = anchorIds.length > 0 ? anchorIds : active
        if (
          state.directoryFilterMode === DIRECTORY_FILTER_CUSTOM &&
          sameIds(state.enabledDirectoryIds, enabled) &&
          subpathKeyOfState === directorySubpathKeyOf(cleanSubpaths)
        ) {
          return
        }
        set({
          directoryFilterMode: DIRECTORY_FILTER_CUSTOM,
          enabledDirectoryIds: enabled,
          directorySubpaths: cleanSubpaths,
          page: 1,
          javPage: 1,
          idolPage: 1,
          studioPage: 1,
          seriesPage: 1,
        })
        resetKeys()
        return
      }
      if (
        state.directoryFilterMode === DIRECTORY_FILTER_ALL &&
        sameIds(state.enabledDirectoryIds, active)
      ) {
        return
      }
      set({
        directoryFilterMode: DIRECTORY_FILTER_ALL,
        enabledDirectoryIds: active,
        directorySubpaths: [],
      })
      resetKeys()
      return
    }
    const clean = cleanDirectoryIds(ids)
    const state = get()
    if (
      state.directoryFilterMode === DIRECTORY_FILTER_CUSTOM &&
      sameIds(state.enabledDirectoryIds, clean) &&
      subpathKeyOfState === directorySubpathKeyOf(cleanSubpaths)
    ) {
      return
    }
    set({
      directoryFilterMode: DIRECTORY_FILTER_CUSTOM,
      enabledDirectoryIds: clean,
      directorySubpaths: cleanSubpaths,
      page: 1,
      javPage: 1,
      idolPage: 1,
      studioPage: 1,
      seriesPage: 1,
    })
    resetKeys()
  },

  createDirectory: async ({ path }) => {
    const dir = await createDirectory({ path })
    const next = dir && !dir.is_delete ? [...get().directories, dir] : get().directories
    const state = get()
    set({
      directories: next,
      enabledDirectoryIds:
        state.directoryFilterMode === DIRECTORY_FILTER_ALL
          ? cleanDirectoryIds(next.map((directory) => directory?.id))
          : state.enabledDirectoryIds,
    })
    return dir
  },
  updateDirectory: async (id, payload) => {
    const dir = await updateDirectory(id, payload)
    const state = get()
    const next = state.directories
      .map((d) =>
        d.id === id
          ? {
              ...d,
              ...dir,
              scanned_video_count: d.scanned_video_count,
              scraped_video_count: d.scraped_video_count,
              is_scanning: d.is_scanning,
              work_status: d.work_status,
            }
          : d
      )
      .filter((d) => d && !d.is_delete)
    const active = cleanDirectoryIds(next.map((directory) => directory?.id))
    const activeSet = new Set(active)
    set({
      directories: next,
      enabledDirectoryIds:
        state.directoryFilterMode === DIRECTORY_FILTER_ALL
          ? active
          : cleanDirectoryIds(state.enabledDirectoryIds).filter((enabledID) =>
              activeSet.has(enabledID)
            ),
    })
    return dir
  },
  deleteDirectory: async (id) => {
    const dir = await deleteDirectoryApi(id)
    const state = get()
    const next = state.directories
      .map((d) => (d.id === id ? dir : d))
      .filter((d) => d && !d.is_delete)
    const active = cleanDirectoryIds(next.map((directory) => directory?.id))
    const activeSet = new Set(active)
    set({
      directories: next,
      enabledDirectoryIds:
        state.directoryFilterMode === DIRECTORY_FILTER_ALL
          ? active
          : cleanDirectoryIds(state.enabledDirectoryIds).filter((enabledID) =>
              activeSet.has(enabledID)
            ),
    })
    return dir
  },
}))
