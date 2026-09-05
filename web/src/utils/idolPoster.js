export const IDOL_POSTER_KIND_UPLOAD = 'upload'
export const IDOL_POSTER_KIND_SCREENSHOT = 'screenshot'
export const IDOL_POSTER_MAX_IMAGES = 12

export function idolPosterImageKey(image) {
  const kind = String(image?.kind || '').trim()
  const name = String(image?.name || '').trim()
  const videoId = Number(image?.video_id) || 0
  if (!kind || !name) return ''
  if (kind === IDOL_POSTER_KIND_SCREENSHOT) {
    if (videoId <= 0) return ''
    return `${kind}:${videoId}:${name}`
  }
  if (kind === IDOL_POSTER_KIND_UPLOAD) {
    return `${kind}:${name}`
  }
  return ''
}

export function idolPosterImageSrc(idolId, image) {
  const url = String(image?.url || '').trim()
  if (url) return url
  const kind = String(image?.kind || '').trim()
  const name = String(image?.name || '').trim()
  const id = Number(idolId)
  if (kind === IDOL_POSTER_KIND_UPLOAD && Number.isFinite(id) && id > 0 && name) {
    return `/jav/idols/${id}/poster/${encodeURIComponent(name)}`
  }
  const videoId = Number(image?.video_id)
  if (kind === IDOL_POSTER_KIND_SCREENSHOT && Number.isFinite(videoId) && videoId > 0 && name) {
    return `/videos/${videoId}/screenshots/${encodeURIComponent(name)}`
  }
  return ''
}

export function normalizeIdolPosterImages(images) {
  if (!Array.isArray(images)) return []
  const seen = new Set()
  const next = []
  for (const image of images) {
    const kind = String(image?.kind || '').trim()
    const name = String(image?.name || '').trim()
    const videoId = Number(image?.video_id) || 0
    const item =
      kind === IDOL_POSTER_KIND_UPLOAD
        ? { kind, name, url: String(image?.url || '').trim() }
        : kind === IDOL_POSTER_KIND_SCREENSHOT
          ? { kind, video_id: videoId, name, url: String(image?.url || '').trim() }
          : null
    const key = idolPosterImageKey(item)
    if (!item || !key || seen.has(key)) continue
    seen.add(key)
    next.push(item)
    if (next.length >= IDOL_POSTER_MAX_IMAGES) break
  }
  return next
}
