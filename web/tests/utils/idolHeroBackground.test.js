import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_IDOL_HERO_BACKGROUND,
  averageRgbFromPixels,
  darkenIdolHeroRgb,
  deriveIdolHeroBackground,
  hslToRgb,
  isSampleableIdolHeroSource,
  rgbToHex,
  rgbToHsl,
  sampleIdolHeroBackground,
} from '../../src/utils/idolHeroBackground.js'

function pixels(...rgba) {
  return new Uint8ClampedArray(rgba)
}

test('averages opaque poster pixels and skips transparent ones', () => {
  const average = averageRgbFromPixels(pixels(255, 255, 255, 255, 0, 0, 0, 0))
  assert.ok(average)
  assert.ok(Math.abs(average[0] - 255) < 1)
  assert.ok(Math.abs(average[1] - 255) < 1)
  assert.equal(averageRgbFromPixels(pixels(255, 0, 0, 0)), null)
  assert.equal(averageRgbFromPixels(null), null)
})

test('round-trips rgb through hsl', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), [0, 1, 0.5])
  assert.deepEqual(hslToRgb(0, 1, 0.5), [255, 0, 0])
  assert.equal(rgbToHex(hslToRgb(0, 1, 0.2)), '#660000')
  assert.equal(rgbToHex([255, 128, 0]), '#ff8000')
})

test('darkens any poster colour into a background-safe tone', () => {
  const white = darkenIdolHeroRgb([255, 255, 255])
  assert.ok(rgbToHsl(white[0], white[1], white[2])[2] <= 0.19)
  const orange = darkenIdolHeroRgb([255, 160, 40])
  const [, , orangeLightness] = rgbToHsl(orange[0], orange[1], orange[2])
  assert.ok(orangeLightness <= 0.19)
  // Hue survives, so a warm poster still reads warm.
  assert.ok(orange[0] > orange[2])
  assert.equal(darkenIdolHeroRgb(null), null)
})

test('derives a hex background, or nothing when the poster has no visible pixels', () => {
  const color = deriveIdolHeroBackground(pixels(240, 200, 120, 255, 250, 210, 130, 255))
  assert.match(color, /^#[0-9a-f]{6}$/)
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
  assert.ok(channels.every((channel) => channel < 80))
  assert.ok(channels[0] >= channels[2])
  assert.ok(rgbToHsl(channels[0], channels[1], channels[2])[2] <= 0.19)
  assert.equal(deriveIdolHeroBackground(pixels(0, 0, 0, 0)), '')
  assert.equal(deriveIdolHeroBackground(null), '')
})

test('only same-origin posters are sampleable', () => {
  const origin = 'http://127.0.0.1:19387'
  assert.equal(isSampleableIdolHeroSource('/jav/ABC-123/cover', origin), true)
  assert.equal(isSampleableIdolHeroSource('http://127.0.0.1:19387/jav/x/cover', origin), true)
  assert.equal(isSampleableIdolHeroSource('https://cdn.example.com/a.jpg', origin), false)
  assert.equal(isSampleableIdolHeroSource('data:image/png;base64,AAAA', origin), false)
  assert.equal(isSampleableIdolHeroSource('', origin), false)
})

test('sampling without a DOM keeps the fixed fallback colour', async () => {
  assert.equal(await sampleIdolHeroBackground('/jav/ABC-123/cover'), '')
  assert.equal(DEFAULT_IDOL_HERO_BACKGROUND, '#0b0f16')
})
