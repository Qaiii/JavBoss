export const DEFAULT_IDOL_HERO_BACKGROUND = '#0b0f16'

const SAMPLE_EDGE = 32
const DEFAULT_TARGET_LIGHTNESS = 0.15
const DEFAULT_MIN_SATURATION = 0.16
const NEUTRAL_SATURATION_FLOOR = 0.08

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function saturationOf(red, green, blue) {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  if (max <= 0) return 0
  return (max - min) / max
}

export function rgbToHsl(red, green, blue) {
  const r = clamp(Number(red) || 0, 0, 255) / 255
  const g = clamp(Number(green) || 0, 0, 255) / 255
  const b = clamp(Number(blue) || 0, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness]
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  return [(hue * 60 + 360) % 360, saturation, lightness]
}

export function hslToRgb(hue, saturation, lightness) {
  const h = (((Number(hue) || 0) % 360) + 360) % 360
  const s = clamp(Number(saturation) || 0, 0, 1)
  const l = clamp(Number(lightness) || 0, 0, 1)
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const offset = l - chroma / 2
  let channels
  if (h < 60) channels = [chroma, secondary, 0]
  else if (h < 120) channels = [secondary, chroma, 0]
  else if (h < 180) channels = [0, chroma, secondary]
  else if (h < 240) channels = [0, secondary, chroma]
  else if (h < 300) channels = [secondary, 0, chroma]
  else channels = [chroma, 0, secondary]
  return channels.map((channel) => Math.round((channel + offset) * 255))
}

export function rgbToHex(rgb) {
  const channels = Array.isArray(rgb) ? rgb : []
  const hex = [0, 1, 2]
    .map((index) => clamp(Math.round(Number(channels[index]) || 0), 0, 255).toString(16))
    .map((value) => value.padStart(2, '0'))
    .join('')
  return `#${hex}`
}

/**
 * Weighted average of an RGBA pixel buffer: colourful pixels carry the poster tone
 * better than flat greys, and fully transparent pixels are ignored.
 */
export function averageRgbFromPixels(pixels) {
  if (!pixels || typeof pixels.length !== 'number') return null
  let red = 0
  let green = 0
  let blue = 0
  let weight = 0
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = Number(pixels[index + 3]) / 255
    if (!(alpha >= 0.03)) continue
    const itemWeight =
      (0.25 + saturationOf(pixels[index], pixels[index + 1], pixels[index + 2])) * alpha
    red += Number(pixels[index]) * itemWeight
    green += Number(pixels[index + 1]) * itemWeight
    blue += Number(pixels[index + 2]) * itemWeight
    weight += itemWeight
  }
  if (!(weight > 0)) return null
  return [red / weight, green / weight, blue / weight]
}

/** Keeps the poster hue but pulls the colour down to a dark, background-safe tone. */
export function darkenIdolHeroRgb(rgb, options = {}) {
  if (!Array.isArray(rgb) || rgb.length < 3) return null
  const maxLightness = Number.isFinite(options.maxLightness)
    ? options.maxLightness
    : DEFAULT_TARGET_LIGHTNESS
  const minSaturation = Number.isFinite(options.minSaturation)
    ? options.minSaturation
    : DEFAULT_MIN_SATURATION
  const [hue, saturation, lightness] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  const nextSaturation =
    saturation >= NEUTRAL_SATURATION_FLOOR ? Math.max(saturation, minSaturation) : saturation
  return hslToRgb(hue, nextSaturation, Math.min(lightness, maxLightness))
}

/** Returns a `#rrggbb` background for the poster pixels, or '' when nothing usable exists. */
export function deriveIdolHeroBackground(pixels, options) {
  const average = averageRgbFromPixels(pixels)
  if (!average) return ''
  const darkened = darkenIdolHeroRgb(average, options)
  return darkened ? rgbToHex(darkened) : ''
}

/**
 * Only same-origin posters can be drawn into a canvas: other origins (and data/blob
 * URLs) would either taint the canvas or give nothing to sample.
 */
export function isSampleableIdolHeroSource(src, origin) {
  const value = String(src || '').trim()
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return false
  const base =
    String(origin || '').trim() ||
    (typeof window !== 'undefined' && window.location ? window.location.origin : '')
  if (!base) return false
  try {
    const baseUrl = new URL(base)
    const target = new URL(value, baseUrl)
    return target.protocol === baseUrl.protocol && target.host === baseUrl.host
  } catch {
    return false
  }
}

export function loadIdolHeroImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      reject(new Error('image api unavailable'))
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('idol hero poster failed to load'))
    image.src = src
  })
}

/** Samples the poster for a dark viewport background; '' means "keep the fixed colour". */
export async function sampleIdolHeroBackground(src, options = {}) {
  const value = String(src || '').trim()
  if (!value || typeof document === 'undefined') return ''
  if (!isSampleableIdolHeroSource(value, options.origin)) return ''
  try {
    const image = await loadIdolHeroImage(value)
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_EDGE
    canvas.height = SAMPLE_EDGE
    const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
    if (!context || typeof context.drawImage !== 'function') return ''
    context.drawImage(image, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE)
    const snapshot = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE)
    return deriveIdolHeroBackground(snapshot ? snapshot.data : null, options)
  } catch {
    return ''
  }
}
