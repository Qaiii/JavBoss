export const JAV_COVER_ORIENTATION_LANDSCAPE = 'landscape'
export const JAV_COVER_ORIENTATION_PORTRAIT = 'portrait'

export function normalizeJavCoverOrientation(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === JAV_COVER_ORIENTATION_PORTRAIT
    ? JAV_COVER_ORIENTATION_PORTRAIT
    : JAV_COVER_ORIENTATION_LANDSCAPE
}

export function javCoverSrc(code, { version } = {}) {
  const trimmed = String(code || '').trim()
  if (!trimmed) return ''
  const params = new URLSearchParams()
  if (version) params.set('v', String(version))
  const query = params.toString()
  return `/jav/${encodeURIComponent(trimmed)}/cover${query ? `?${query}` : ''}`
}

export function javCardCoverSrc({ code, inLibrary = true, coverUrl, version } = {}) {
  const trimmedCode = String(code || '').trim()
  if (inLibrary && trimmedCode) {
    return javCoverSrc(trimmedCode, { version })
  }
  return String(coverUrl || '').trim() || null
}

export function javCoverAspectClass(orientation) {
  return normalizeJavCoverOrientation(orientation) === JAV_COVER_ORIENTATION_PORTRAIT
    ? ''
    : 'aspect-[800/538]'
}

export function javCoverGridMinmax(orientation) {
  return normalizeJavCoverOrientation(orientation) === JAV_COVER_ORIENTATION_PORTRAIT
    ? '13rem'
    : '21rem'
}

export function javCoverIsPortrait(orientation) {
  return normalizeJavCoverOrientation(orientation) === JAV_COVER_ORIENTATION_PORTRAIT
}
