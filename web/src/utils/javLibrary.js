export const JAV_LIBRARY_SCOPE_LIBRARY = 'library'
export const JAV_LIBRARY_SCOPE_ALL = 'all'
export const JAV_LIBRARY_SCOPE_UNIMPORTED = 'unimported'

export const JAV_LIBRARY_SCOPE_OPTIONS = [
  { value: JAV_LIBRARY_SCOPE_LIBRARY, label: ['已入库', 'In library'] },
  { value: JAV_LIBRARY_SCOPE_ALL, label: ['全部', 'All'] },
  { value: JAV_LIBRARY_SCOPE_UNIMPORTED, label: ['未入库', 'Not in library'] },
]

export const JAV_LIBRARY_SCOPE_STORAGE_KEY = 'javboss.javLibraryScope'
export const JAV_SHOW_EXTERNAL_WORKS_STORAGE_KEY = 'javboss.showExternalWorks'

export function normalizeJavLibraryScope(value, fallback = JAV_LIBRARY_SCOPE_ALL) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
  if (
    key === JAV_LIBRARY_SCOPE_LIBRARY ||
    key === JAV_LIBRARY_SCOPE_ALL ||
    key === JAV_LIBRARY_SCOPE_UNIMPORTED
  ) {
    return key
  }
  return fallback
}

export function javLibraryScopeQueryFlags(scope, { idolCount, singleIdol = false } = {}) {
  const count = Number.isFinite(idolCount) ? idolCount : singleIdol ? 1 : 0
  const normalized = normalizeJavLibraryScope(scope)
  if (count > 1) {
    return { includeExternal: false, unimportedOnly: false }
  }
  return {
    includeExternal: normalized === JAV_LIBRARY_SCOPE_ALL,
    unimportedOnly: normalized === JAV_LIBRARY_SCOPE_UNIMPORTED,
  }
}

export function loadSavedJavLibraryScope(storage) {
  try {
    const store = storage || window.localStorage
    const raw = store.getItem(JAV_LIBRARY_SCOPE_STORAGE_KEY)
    const normalized = normalizeJavLibraryScope(raw, '')
    if (normalized) return normalized
    const legacy = store.getItem(JAV_SHOW_EXTERNAL_WORKS_STORAGE_KEY)
    if (legacy === '0' || legacy === 'false') return JAV_LIBRARY_SCOPE_LIBRARY
    return JAV_LIBRARY_SCOPE_ALL
  } catch {
    return JAV_LIBRARY_SCOPE_ALL
  }
}

export function saveJavLibraryScope(scope, storage) {
  try {
    const store = storage || window.localStorage
    store.setItem(JAV_LIBRARY_SCOPE_STORAGE_KEY, normalizeJavLibraryScope(scope))
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

const JAV_EXTERNAL_SOURCE_HOSTS = [
  { key: 'javlibrary', hosts: ['javlibrary.com'] },
  { key: 'javbus', hosts: ['javbus.com'] },
  { key: 'javdb', hosts: ['javdb.com'] },
  { key: 'javmenu', hosts: ['javmenu.com'] },
  { key: 'missav', hosts: ['missav.ws', 'missav.com'] },
  { key: 'avsox', hosts: ['avsox.click', 'avsox.com'] },
]

export function isUnimportedJav(item) {
  return item?.in_library === false
}

export function javExternalSourceKey(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, '').toLowerCase()
    const match = JAV_EXTERNAL_SOURCE_HOSTS.find((source) =>
      source.hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
    )
    return match?.key || ''
  } catch {
    return ''
  }
}

export function javCardExternalSourceKeys({ isUncensored = false, sourceURL = '' } = {}) {
  const sourceKey = javExternalSourceKey(sourceURL)
  const uncensored = isUncensored || sourceKey === 'avsox'
  const keys = uncensored
    ? ['javbus', 'avsox']
    : ['javlibrary', 'javbus', 'javdb', 'javmenu', 'missav']
  if (sourceKey && !keys.includes(sourceKey)) {
    return [...keys, sourceKey]
  }
  return keys
}
