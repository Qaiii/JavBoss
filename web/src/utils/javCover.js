export const JAV_COVER_ORIENTATION_LANDSCAPE = 'landscape'
export const JAV_COVER_ORIENTATION_PORTRAIT = 'portrait'

export function normalizeJavCoverOrientation(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === JAV_COVER_ORIENTATION_PORTRAIT
    ? JAV_COVER_ORIENTATION_PORTRAIT
    : JAV_COVER_ORIENTATION_LANDSCAPE
}

export function javCoverSrc(code, { orientation, version } = {}) {
  const trimmed = String(code || '').trim()
  if (!trimmed) return ''
  const params = new URLSearchParams({
    orientation: normalizeJavCoverOrientation(orientation),
  })
  if (version) params.set('v', String(version))
  return `/jav/${encodeURIComponent(trimmed)}/cover?${params.toString()}`
}

export function javCoverAspectClass(orientation) {
  return normalizeJavCoverOrientation(orientation) === JAV_COVER_ORIENTATION_PORTRAIT
    ? 'aspect-[2/3]'
    : 'aspect-[800/538]'
}

export function javCoverGridMinmax(orientation) {
  return normalizeJavCoverOrientation(orientation) === JAV_COVER_ORIENTATION_PORTRAIT
    ? '12rem'
    : '21rem'
}
