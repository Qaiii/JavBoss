// Compatibility exports. New code imports APIs from its feature module.
export { authExpiredEvent } from '@/api/client'
export {
  fetchAvailabilityProviders,
  checkProviderAvailability,
  fetchConfig,
  updateConfig,
  fetchTools,
  downloadFFmpeg,
} from '@/features/settings/api'
export {
  fetchAuthStatus,
  loginWithPassword,
  logoutSession,
  changePassword,
  fetchExtensionTokens,
  createExtensionToken,
  rotateExtensionToken,
  deleteExtensionToken,
} from '@/features/auth/api'
export {
  fetchVideos,
  openVideoFile,
  playVideoFile,
  playVideoPlaylist,
  revealVideoLocation,
  incrementVideoPlayCount,
  fetchPlaybackInfo,
  fetchVideoScreenshots,
  fetchVideoScreenshotsByIds,
  createVideoScreenshot,
  deleteVideoScreenshot,
  updateVideoCover,
  resetVideoCover,
  renameVideoLocation,
  deleteVideoLocation,
} from '@/features/video/api'
export {
  fetchTags,
  createTag,
  fetchTagCategories,
  createTagCategory,
  reorderTagCategories,
  renameTagCategory,
  deleteTagCategory,
  assignTagsCategory,
  deleteTag,
  deleteTagsBatch,
  renameTag,
  addTagToVideos,
  removeTagFromVideos,
  replaceTagsForVideos,
} from '@/features/tags/api'
export {
  updateVideoJavScrapeSettings,
  fetchVideoJavScrapePossibleCodes,
  manualVideoJavScrape,
  linkVideoToExistingJav,
  fetchJavItem,
  fetchJavs,
  fetchJavFilterOptions,
  getResolvedJavSampleImages,
  resolveJavSampleImages,
  fetchJavPrefixes,
  fetchJavTags,
  fetchJavTagCategories,
  updateJavCover,
  updateJavItem,
  createJavTag,
  createJavScrapedTag,
  organizeJavTags,
  createJavTagCategory,
  reorderJavTagCategories,
  renameJavTagCategory,
  deleteJavTagCategory,
  assignJavTagsCategory,
  renameJavTag,
  deleteJavTag,
  deleteJavTagsBatch,
  replaceJavTagsForItems,
  addJavTagToJavs,
  removeJavTagFromJavs,
  fetchJavIdols,
  createJavIdol,
  fetchJavIdolOptions,
  mergeJavIdols,
  updateJavIdol,
  fetchJavIdolCoverOptions,
  updateJavIdolCover,
  fetchJavStudios,
  fetchJavStudioOptions,
  mergeJavStudios,
  updateJavStudio,
  fetchJavStudioJavDBURL,
  fetchJavStudioPreview,
  fetchJavSeries,
  fetchJavSeriesJavDBURL,
  fetchJavSeriesPreview,
  fetchJavIdolPreview,
  fetchJavIdolJavDBURL,
  fetchJavJavDBURL,
  resolveJavIdols,
} from '@/features/jav/api'
export {
  fetchDirectories,
  createDirectory,
  browseDirectories,
  updateDirectory,
  deleteDirectory,
  processDirectory,
  scanDirectory,
} from '@/features/directories/api'
export {
  fetchDownloaderSettings,
  updateDownloaderSettings,
  updateCloudDrive2Settings,
  fetchCloudDrive2Token,
  testCloudDrive2,
  fetchDownloadJobs,
  createDownloadJob,
  retryDownloadJob,
  cancelDownloadJob,
  revealDownloadLocation,
  deleteDownloadJob,
} from '@/features/downloads/api'
export {
  fetchJavFavoriteGroups,
  createJavFavoriteGroup,
  renameJavFavoriteGroup,
  deleteJavFavoriteGroup,
  reorderJavFavoriteGroups,
  fetchJavFavoriteGroupItems,
  reorderJavFavoriteGroupItems,
  removeJavFavoriteGroupItems,
  fetchJavFavoriteSelection,
  replaceJavFavoriteGroups,
  addJavsToFavoriteGroups,
} from '@/features/favorites/api'

import { apiError, apiFetch, jsonHeaders, parseJSONResponse } from '@/api/client'

export async function fetchJavScrapeCheck() {
  const res = await apiFetch('/tools/jav-scrape-check', { cache: 'no-store' })
  if (!res.ok) throw await apiError(res)
  return parseJSONResponse(res)
}

export async function runJavScrapeCheck() {
  const res = await apiFetch('/tools/jav-scrape-check', { method: 'POST' })
  if (!res.ok) throw await apiError(res)
  return parseJSONResponse(res)
}

export async function fetchJavScrapeStatus() {
  const res = await apiFetch('/tools/jav-scrape-status', { cache: 'no-store' })
  if (!res.ok) throw await apiError(res)
  return parseJSONResponse(res)
}

export async function fetchScrapedDataCleanup() {
  const res = await apiFetch('/tools/scraped-data-cleanup', { cache: 'no-store' })
  if (!res.ok) throw await apiError(res)
  return parseJSONResponse(res)
}

export async function runScrapedDataCleanup() {
  const res = await apiFetch('/tools/scraped-data-cleanup', { method: 'POST' })
  if (!res.ok) throw await apiError(res)
  return parseJSONResponse(res)
}

export async function fetchVideoFrame(id, { second, locationId, signal } = {}) {
  const params = new URLSearchParams()
  params.set('second', String(second))
  if (locationId) params.set('location_id', String(locationId))
  const res = await apiFetch(`/videos/${id}/frame?${params.toString()}`, {
    signal,
    cache: 'no-store',
  })
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.blob()
}

export async function fetchLocalSubtitles(id) {
  const res = await apiFetch(`/videos/${id}/subtitles`, { cache: 'no-store' })
  if (!res.ok) {
    throw await apiError(res)
  }
  const data = await res.json()
  return Array.isArray(data?.subtitles) ? data.subtitles : []
}

export async function searchJavSubtitles(id, { query = '' } = {}) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  const res = await apiFetch(`/videos/${id}/subtitles/search?${params.toString()}`)
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.json()
}

export async function fetchJavSubtitleDetail(id, code) {
  const params = new URLSearchParams({ code })
  const res = await apiFetch(`/videos/${id}/subtitles/detail?${params.toString()}`)
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.json()
}

export async function saveJavSubtitle(id, { code, subtitleId, format = 'srt' } = {}) {
  const res = await apiFetch(`/videos/${id}/subtitles/save`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ code, subtitle_id: subtitleId, format }),
  })
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.json()
}

export async function fetchDirectorySubdirectories(directoryId) {
  const res = await apiFetch(`/directories/${encodeURIComponent(directoryId)}/subdirectories`)
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function fetchJavExternalWorks(idolId, { page = 1 } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  const res = await apiFetch(
    `/jav/idols/${encodeURIComponent(idolId)}/external-works?${params.toString()}`
  )
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.json()
}

export async function fetchJavIdolPosterOptions(id) {
  const res = await apiFetch(`/jav/idols/${encodeURIComponent(id)}/poster-options`)
  if (!res.ok) {
    throw await apiError(res)
  }
  const data = await parseJSONResponse(res)
  return Array.isArray(data?.items) ? data.items : []
}

export async function updateJavIdolPoster(id, images = []) {
  const res = await apiFetch(`/jav/idols/${encodeURIComponent(id)}/poster`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ images }),
  })
  if (!res.ok) {
    throw await apiError(res)
  }
  return parseJSONResponse(res)
}

export async function uploadJavIdolPoster(id, file) {
  const body = new FormData()
  body.append('file', file)
  const res = await apiFetch(`/jav/idols/${encodeURIComponent(id)}/poster`, {
    method: 'POST',
    body,
  })
  if (!res.ok) {
    throw await apiError(res)
  }
  return parseJSONResponse(res)
}

export async function fetchJavTagPreview(id) {
  const res = await apiFetch(`/jav/tags/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.json()
}

export async function dislikeJavIdolWork(idolId, code) {
  const res = await apiFetch(`/jav/idols/${encodeURIComponent(idolId)}/works/dislike`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    throw await apiError(res)
  }
  return res.json()
}
