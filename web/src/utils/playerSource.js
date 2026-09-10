const HEVC_PROBE_TYPES = [
  'video/mp4; codecs="hvc1.1.6.L93.B0"',
  'video/mp4; codecs="hev1.1.6.L93.B0"',
]

export function isHEVCCodec(codec) {
  const value = String(codec || '')
    .trim()
    .toLowerCase()
  return value === 'hevc' || value === 'h265' || value === 'h.265'
}

export function canPlayHEVC(mediaEl) {
  const video =
    mediaEl && typeof mediaEl.canPlayType === 'function'
      ? mediaEl
      : typeof document !== 'undefined'
        ? document.createElement('video')
        : null
  if (!video || typeof video.canPlayType !== 'function') return false
  return HEVC_PROBE_TYPES.some((type) => Boolean(video.canPlayType(type)))
}

export function selectPlaybackSource(
  info,
  { canPlayHEVC: hevcSupported = false, forceHls = false } = {}
) {
  const sources = Array.isArray(info?.sources) ? info.sources : []
  if (!sources.length) return null

  const direct = sources.find((item) => item.kind === 'direct')
  const hls = sources.find((item) => item.kind === 'hls')
  const preferred = sources.find((item) => item.kind === info.preferred_kind) || sources[0]

  if (forceHls) return hls || preferred
  if (info.preferred_kind === 'direct' && direct) return direct
  if (direct && isHEVCCodec(info.video_codec) && hevcSupported) return direct
  return preferred || hls || sources[0]
}
