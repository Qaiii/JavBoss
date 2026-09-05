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

export function javCardExternalSourceKeys({
  inLibrary = true,
  isUncensored = false,
  sourceURL = '',
} = {}) {
  if (inLibrary) {
    return isUncensored
      ? ['javbus', 'avsox']
      : ['javlibrary', 'javbus', 'javdb', 'javmenu', 'missav']
  }
  const key = javExternalSourceKey(sourceURL)
  return key ? [key] : []
}
