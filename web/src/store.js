import { createListResources } from '@/query/createListResources'
import { createVideoSlice } from '@/state/createVideoSlice'
import { createJavSlice } from '@/state/createJavSlice'
import { createNavigationSlice } from '@/state/createNavigationSlice'
import { createFavoriteSlice } from '@/state/createFavoriteSlice'
import { createCatalogSlice } from '@/state/createCatalogSlice'
import { createConfigSlice } from '@/state/createConfigSlice'
import { createTagSlice } from '@/state/createTagSlice'
import { createDirectorySlice } from '@/state/createDirectorySlice'
import { create } from 'zustand'
import { createWatchedTimeSlice } from '@/state/createWatchedTimeSlice'
import { directoryScopeResetState } from '@/state/model'
import { dislikeJavIdolWork as postJavIdolWorkDislike, fetchJavExternalWorks } from '@/api'
import {
  loadSavedJavLibraryScope,
  normalizeJavLibraryScope,
  saveJavLibraryScope,
} from '@/utils/javLibrary'
import { getErrorMessage } from '@/utils/errors'

export { videoSelectionKey } from '@/state/model'

const DIRECTORY_FILTER_ALL = 'all'
const DIRECTORY_FILTER_CUSTOM = 'custom'

const cleanDirectoryIds = (ids) =>
  Array.from(
    new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  ).sort((a, b) => a - b)

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

const directorySubpathKeyOf = (subpaths) =>
  cleanDirectorySubpaths(subpaths)
    .map((item) => `${item.directoryId}:${item.path}`)
    .join(',')

const pruneClosedSubdirectories = (closed, directoryIds) => {
  const keep = new Set(cleanDirectoryIds(directoryIds))
  const next = {}
  for (const [rawId, names] of Object.entries(closed || {})) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || !keep.has(id)) continue
    const cleanNames = Array.isArray(names)
      ? Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)))
      : []
    if (cleanNames.length > 0) next[id] = cleanNames
  }
  return next
}

const sameIds = (left, right) => {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

const resetDirectoryPages = () => ({
  ...directoryScopeResetState(),
  videoTempSort: '',
  javTempSort: '',
  idolTempSort: '',
})

export function createAppState(set, get) {
  const lists = createListResources({ set, get })
  const invalidateDirectoryScopedRequests = () => {
    Object.values(lists).forEach((list) => list.invalidate())
    get().invalidateTagRequests()
    get().invalidateFavoriteRequests()
  }
  return {
    ...createWatchedTimeSlice({ set }),
    ...createVideoSlice({ set, get, lists }),
    ...createJavSlice({ set, get, lists }),
    ...createNavigationSlice({ set }),
    ...createFavoriteSlice({ set, get }),
    ...createCatalogSlice({ set, lists }),
    ...createConfigSlice({ get, set }),
    ...createTagSlice({ get, set }),
    ...createDirectorySlice({ set, get, invalidateDirectoryScopedRequests }),
    javLibraryScope: loadSavedJavLibraryScope(),
    setJavLibraryScope: (scope) => {
      const next = normalizeJavLibraryScope(scope)
      if (next === get().javLibraryScope) return
      saveJavLibraryScope(next)
      set({ javLibraryScope: next, javPage: 1 })
      lists.jav.invalidate()
    },
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
    enabledDirectoryIds: [],
    directorySubpaths: [],
    closedSubdirectories: {},
    directoryFilterMode: DIRECTORY_FILTER_ALL,
    setEnabledDirectoryIds: (ids) => {
      const clean = cleanDirectoryIds(ids)
      const active = cleanDirectoryIds(get().directories.map((directory) => directory?.id))
      const mode =
        active.length > 0 && clean.length === active.length
          ? DIRECTORY_FILTER_ALL
          : DIRECTORY_FILTER_CUSTOM
      invalidateDirectoryScopedRequests()
      set({
        enabledDirectoryIds: mode === DIRECTORY_FILTER_ALL ? active : clean,
        directoryFilterMode: mode,
        directorySubpaths: [],
        closedSubdirectories: pruneClosedSubdirectories(get().closedSubdirectories, clean),
        ...resetDirectoryPages(),
      })
    },
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
      invalidateDirectoryScopedRequests()
      set({
        enabledDirectoryIds: mode === DIRECTORY_FILTER_ALL ? active : clean,
        directoryFilterMode: mode,
        directorySubpaths: scopedSubpaths,
        closedSubdirectories: pruneClosedSubdirectories(get().closedSubdirectories, clean),
        ...resetDirectoryPages(),
      })
    },
    setClosedSubdirectories: (directoryId, names) => {
      const id = Number(directoryId)
      const cleanNames = Array.from(
        new Set((names || []).map((name) => String(name || '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b))
      const next = { ...(get().closedSubdirectories || {}) }
      if (cleanNames.length === 0) delete next[id]
      else next[id] = cleanNames
      invalidateDirectoryScopedRequests()
      set({
        closedSubdirectories: next,
        ...resetDirectoryPages(),
      })
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
      if (JSON.stringify(get().closedSubdirectories || {}) === JSON.stringify(pruned)) return
      invalidateDirectoryScopedRequests()
      set({ closedSubdirectories: pruned })
    },
    setDirectoryFilterFromUrl: (ids, subpaths) => {
      const cleanSubpaths = cleanDirectorySubpaths(subpaths)
      const active = cleanDirectoryIds(get().directories.map((directory) => directory?.id))
      if (ids == null) {
        if (cleanSubpaths.length > 0) {
          const anchorIds = cleanDirectoryIds(cleanSubpaths.map((item) => item.directoryId))
          const enabled = anchorIds.length > 0 ? anchorIds : active
          const mode =
            active.length > 0 && enabled.length === active.length
              ? DIRECTORY_FILTER_ALL
              : DIRECTORY_FILTER_CUSTOM
          invalidateDirectoryScopedRequests()
          set({
            enabledDirectoryIds: mode === DIRECTORY_FILTER_ALL ? active : enabled,
            directoryFilterMode: mode,
            directorySubpaths: cleanSubpaths,
            ...resetDirectoryPages(),
          })
          return
        }
        if (get().directoryFilterMode !== DIRECTORY_FILTER_ALL) {
          invalidateDirectoryScopedRequests()
          set({
            directoryFilterMode: DIRECTORY_FILTER_ALL,
            enabledDirectoryIds: active,
            directorySubpaths: [],
            ...resetDirectoryPages(),
          })
        }
        return
      }
      const cleanIds = cleanDirectoryIds(ids)
      const activeSet = new Set(active)
      const scopedSubpaths = cleanSubpaths.filter((item) => activeSet.has(item.directoryId))
      const mode =
        active.length > 0 && cleanIds.length === active.length && scopedSubpaths.length === 0
          ? DIRECTORY_FILTER_ALL
          : DIRECTORY_FILTER_CUSTOM
      const nextEnabled = mode === DIRECTORY_FILTER_ALL ? active : cleanIds
      if (
        get().directoryFilterMode === mode &&
        sameIds(get().enabledDirectoryIds || [], nextEnabled) &&
        directorySubpathKeyOf(get().directorySubpaths) === directorySubpathKeyOf(scopedSubpaths)
      ) {
        return
      }
      invalidateDirectoryScopedRequests()
      set({
        enabledDirectoryIds: nextEnabled,
        directoryFilterMode: mode,
        directorySubpaths: scopedSubpaths,
        ...resetDirectoryPages(),
      })
    },
    loadJavExternalWorks: async (targetPage = 1) => {
      const idolIds = Array.isArray(get().javIdolIds) ? get().javIdolIds : []
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
      set({ javExternalLoading: true, javExternalError: null })
      try {
        const resp = await fetchJavExternalWorks(idolId, { page })
        if (Number(get().javIdolIds?.[0]) !== idolId) return
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
      } catch (error) {
        set({ javExternalError: getErrorMessage(error) })
      } finally {
        set({ javExternalLoading: false })
      }
    },
    dislikeJavIdolWork: async (idolId, item) => {
      const code = String(item?.code || '').trim()
      const idol = Number(idolId)
      if (!code || !Number.isFinite(idol) || idol <= 0) return
      const unimported = item?.in_library === false
      await postJavIdolWorkDislike(idol, code)
      if (!unimported) return
      set((state) => {
        const nextItems = (state.javItems || []).filter((current) => {
          if (current?.in_library !== false) return true
          return String(current?.code || '').trim().toUpperCase() !== code.toUpperCase()
        })
        const removed = (state.javItems || []).length - nextItems.length
        return {
          javItems: nextItems,
          javTotal: Math.max(0, (state.javTotal || 0) - removed),
        }
      })
    },
  }
}

export const useStore = create(createAppState)
