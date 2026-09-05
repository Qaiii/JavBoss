export const SUBTITLE_STYLE_STORAGE_KEY = 'javboss.player.subtitleStyle'

export const SUBTITLE_STYLE_COLORS = [
  { id: 'white', value: '#ffffff' },
  { id: 'yellow', value: '#ffe566' },
  { id: 'cyan', value: '#7ee7ff' },
  { id: 'green', value: '#b6f36a' },
  { id: 'pink', value: '#ffb4d9' },
]

export const SUBTITLE_STYLE_BACKGROUNDS = ['off', 'light', 'medium', 'solid']
export const SUBTITLE_STYLE_EDGES = ['none', 'outline', 'shadow']

export const DEFAULT_SUBTITLE_STYLE = {
  scale: 1.2,
  color: '#ffffff',
  background: 'medium',
  edge: 'outline',
  offset: 12,
}

const BACKGROUND_CSS = {
  off: 'transparent',
  light: 'rgba(0, 0, 0, 0.35)',
  medium: 'rgba(0, 0, 0, 0.6)',
  solid: 'rgba(0, 0, 0, 0.88)',
}

const EDGE_CSS = {
  none: 'none',
  outline:
    '-0.06em -0.06em 0 #000, 0.06em -0.06em 0 #000, -0.06em 0.06em 0 #000, 0.06em 0.06em 0 #000',
  shadow: '0 0.05em 0.16em #000, 0 0 0.28em #000, 0 0 0.08em #000',
}

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function normalizeColor(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw
  const preset = SUBTITLE_STYLE_COLORS.find((item) => item.value === raw || item.id === raw)
  return preset ? preset.value : DEFAULT_SUBTITLE_STYLE.color
}

export function normalizeSubtitleStyle(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const background = SUBTITLE_STYLE_BACKGROUNDS.includes(source.background)
    ? source.background
    : DEFAULT_SUBTITLE_STYLE.background
  const edge = SUBTITLE_STYLE_EDGES.includes(source.edge)
    ? source.edge
    : DEFAULT_SUBTITLE_STYLE.edge
  return {
    scale: clamp(source.scale, 0.8, 2.4, DEFAULT_SUBTITLE_STYLE.scale),
    color: normalizeColor(source.color),
    background,
    edge,
    offset: clamp(source.offset, 4, 28, DEFAULT_SUBTITLE_STYLE.offset),
  }
}

export function loadSubtitleStyle() {
  if (typeof window === 'undefined') return { ...DEFAULT_SUBTITLE_STYLE }
  try {
    const raw = window.localStorage.getItem(SUBTITLE_STYLE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SUBTITLE_STYLE }
    return normalizeSubtitleStyle(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SUBTITLE_STYLE }
  }
}

export function saveSubtitleStyle(style) {
  const next = normalizeSubtitleStyle(style)
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(SUBTITLE_STYLE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
  return next
}

export function subtitleBackgroundCss(background) {
  return BACKGROUND_CSS[background] || BACKGROUND_CSS[DEFAULT_SUBTITLE_STYLE.background]
}

export function subtitleEdgeCss(edge) {
  return EDGE_CSS[edge] || EDGE_CSS[DEFAULT_SUBTITLE_STYLE.edge]
}

export function subtitleStyleCssVars(style) {
  const next = normalizeSubtitleStyle(style)
  return {
    '--jb-sub-scale': String(next.scale),
    '--jb-sub-color': next.color,
    '--jb-sub-bg': subtitleBackgroundCss(next.background),
    '--jb-sub-shadow': subtitleEdgeCss(next.edge),
    '--jb-sub-offset': `${next.offset}%`,
  }
}
