import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CARD_WIDTH_DEFAULTS,
  CARD_WIDTH_MAX,
  CARD_WIDTH_MIN,
  allCardLayoutsFromConfig,
  cardCoverOrientation,
  cardGridMinmax,
  cardLayoutConfigPayload,
  defaultCardLayout,
  normalizeCardWidth,
} from '../../src/utils/cardLayout.js'

test('clamps card width to the supported rem range', () => {
  assert.equal(normalizeCardWidth(undefined, 14), 14)
  assert.equal(normalizeCardWidth('18', 14), 18)
  assert.equal(normalizeCardWidth(CARD_WIDTH_MIN - 4, 14), CARD_WIDTH_MIN)
  assert.equal(normalizeCardWidth(CARD_WIDTH_MAX + 10, 14), CARD_WIDTH_MAX)
})

test('locks idol covers to portrait and video covers to landscape', () => {
  assert.equal(cardCoverOrientation('idol', { jav_cover_orientation: 'landscape' }), 'portrait')
  assert.equal(cardCoverOrientation('video', { jav_cover_orientation: 'portrait' }), 'landscape')
})

test('lets jav, studio, and series keep independent cover orientations', () => {
  const config = {
    jav_cover_orientation: 'portrait',
    studio_cover_orientation: 'landscape',
    series_cover_orientation: 'portrait',
  }
  assert.equal(cardCoverOrientation('jav', config), 'portrait')
  assert.equal(cardCoverOrientation('studio', config), 'landscape')
  assert.equal(cardCoverOrientation('series', config), 'portrait')
})

test('falls studio and series orientation back to the jav cover mode', () => {
  assert.equal(cardCoverOrientation('studio', { jav_cover_orientation: 'portrait' }), 'portrait')
  assert.equal(cardCoverOrientation('series', { jav_cover_orientation: 'portrait' }), 'portrait')
})

test('uses independent landscape and portrait widths for grid minmax', () => {
  const config = {
    jav_cover_orientation: 'landscape',
    jav_card_landscape_width: 18,
    jav_card_portrait_width: 12,
    idol_card_min_width: 16,
  }
  assert.equal(cardGridMinmax('jav', config), '18rem')
  assert.equal(cardGridMinmax('jav', { ...config, jav_cover_orientation: 'portrait' }), '12rem')
  assert.equal(cardGridMinmax('idol', config), '16rem')
  assert.equal(cardGridMinmax('video', {}), `${CARD_WIDTH_DEFAULTS.video.landscape}rem`)
})

test('serializes card layout settings for config saves', () => {
  const payload = cardLayoutConfigPayload({
    jav: { orientation: 'portrait', landscape: 20, portrait: 11 },
    idol: defaultCardLayout('idol'),
    studio: { orientation: 'landscape', landscape: 17, portrait: 10 },
    series: defaultCardLayout('series'),
    video: { orientation: 'landscape', landscape: 15, portrait: 15 },
  })
  assert.equal(payload.jav_cover_orientation, 'portrait')
  assert.equal(payload.jav_card_landscape_width, 20)
  assert.equal(payload.jav_card_portrait_width, 11)
  assert.equal(payload.studio_cover_orientation, 'landscape')
  assert.equal(payload.studio_card_landscape_width, 17)
  assert.equal(payload.video_card_min_width, 15)
  assert.equal(allCardLayoutsFromConfig(payload).jav.orientation, 'portrait')
})
