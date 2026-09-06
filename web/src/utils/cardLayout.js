export const CARD_WIDTH_MIN = 8
export const CARD_WIDTH_MAX = 24

const LANDSCAPE = 'landscape'
const PORTRAIT = 'portrait'

export const CARD_LAYOUT_ENTITIES = ['jav', 'idol', 'studio', 'series', 'video']

export const CARD_WIDTH_DEFAULTS = {
  jav: { landscape: 21, portrait: 13 },
  idol: { landscape: 14, portrait: 14 },
  studio: { landscape: 16, portrait: 13 },
  series: { landscape: 16, portrait: 13 },
  video: { landscape: 15, portrait: 15 },
}

export const CARD_ORIENTATION_LOCK = {
  jav: null,
  idol: PORTRAIT,
  studio: null,
  series: null,
  video: LANDSCAPE,
}

export function normalizeCardWidth(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(CARD_WIDTH_MAX, Math.max(CARD_WIDTH_MIN, parsed))
}

function normalizeOrientation(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === PORTRAIT
    ? PORTRAIT
    : LANDSCAPE
}

export function defaultCardLayout(entity) {
  const key = CARD_LAYOUT_ENTITIES.includes(entity) ? entity : 'jav'
  const defaults = CARD_WIDTH_DEFAULTS[key]
  const lock = CARD_ORIENTATION_LOCK[key]
  return {
    orientation: lock || LANDSCAPE,
    landscape: defaults.landscape,
    portrait: defaults.portrait,
  }
}

export function cardCoverOrientation(entity, config) {
  const lock = CARD_ORIENTATION_LOCK[entity]
  if (lock) return lock
  const specific = config?.[`${entity}_cover_orientation`]
  if (specific != null && String(specific).trim() !== '') {
    return normalizeOrientation(specific)
  }
  return normalizeOrientation(config?.jav_cover_orientation)
}

export function cardLayoutFromConfig(entity, config) {
  const defaults = defaultCardLayout(entity)
  return {
    orientation: cardCoverOrientation(entity, config),
    landscape: normalizeCardWidth(readLandscapeWidth(entity, config), defaults.landscape),
    portrait: normalizeCardWidth(readPortraitWidth(entity, config), defaults.portrait),
  }
}

export function allCardLayoutsFromConfig(config) {
  return Object.fromEntries(
    CARD_LAYOUT_ENTITIES.map((entity) => [entity, cardLayoutFromConfig(entity, config)])
  )
}

export function cardGridMinmax(entity, config) {
  const layout = cardLayoutFromConfig(entity, config)
  const width = layout.orientation === PORTRAIT ? layout.portrait : layout.landscape
  return `${width}rem`
}

export function cardLayoutConfigPayload(layouts) {
  const jav = layouts?.jav || defaultCardLayout('jav')
  const idol = layouts?.idol || defaultCardLayout('idol')
  const studio = layouts?.studio || defaultCardLayout('studio')
  const series = layouts?.series || defaultCardLayout('series')
  const video = layouts?.video || defaultCardLayout('video')
  return {
    jav_cover_orientation: normalizeOrientation(jav.orientation),
    jav_card_landscape_width: normalizeCardWidth(jav.landscape, CARD_WIDTH_DEFAULTS.jav.landscape),
    jav_card_portrait_width: normalizeCardWidth(jav.portrait, CARD_WIDTH_DEFAULTS.jav.portrait),
    idol_card_min_width: normalizeCardWidth(idol.portrait, CARD_WIDTH_DEFAULTS.idol.portrait),
    studio_cover_orientation: normalizeOrientation(studio.orientation),
    studio_card_landscape_width: normalizeCardWidth(
      studio.landscape,
      CARD_WIDTH_DEFAULTS.studio.landscape
    ),
    studio_card_portrait_width: normalizeCardWidth(
      studio.portrait,
      CARD_WIDTH_DEFAULTS.studio.portrait
    ),
    series_cover_orientation: normalizeOrientation(series.orientation),
    series_card_landscape_width: normalizeCardWidth(
      series.landscape,
      CARD_WIDTH_DEFAULTS.series.landscape
    ),
    series_card_portrait_width: normalizeCardWidth(
      series.portrait,
      CARD_WIDTH_DEFAULTS.series.portrait
    ),
    video_card_min_width: normalizeCardWidth(video.landscape, CARD_WIDTH_DEFAULTS.video.landscape),
  }
}

function readLandscapeWidth(entity, config) {
  if (entity === 'video') return config?.video_card_min_width
  return config?.[`${entity}_card_landscape_width`]
}

function readPortraitWidth(entity, config) {
  if (entity === 'idol') {
    return config?.idol_card_portrait_width ?? config?.idol_card_min_width
  }
  return config?.[`${entity}_card_portrait_width`]
}
