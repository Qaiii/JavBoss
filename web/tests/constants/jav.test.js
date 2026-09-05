import assert from 'node:assert/strict'
import test from 'node:test'

import {
  IDOL_CARD_MIN_WIDTH_DEFAULT,
  IDOL_CARD_MIN_WIDTH_MAX,
  IDOL_CARD_MIN_WIDTH_MIN,
  normalizeIdolCardMinWidth,
} from '../../src/constants/jav.js'

test('falls back to the default idol card width', () => {
  assert.equal(normalizeIdolCardMinWidth(undefined), IDOL_CARD_MIN_WIDTH_DEFAULT)
  assert.equal(normalizeIdolCardMinWidth(''), IDOL_CARD_MIN_WIDTH_DEFAULT)
  assert.equal(normalizeIdolCardMinWidth('wide'), IDOL_CARD_MIN_WIDTH_DEFAULT)
})

test('clamps idol card width to the supported rem range', () => {
  assert.equal(normalizeIdolCardMinWidth(15), 15)
  assert.equal(normalizeIdolCardMinWidth('18'), 18)
  assert.equal(normalizeIdolCardMinWidth(IDOL_CARD_MIN_WIDTH_MIN - 4), IDOL_CARD_MIN_WIDTH_MIN)
  assert.equal(normalizeIdolCardMinWidth(IDOL_CARD_MIN_WIDTH_MAX + 10), IDOL_CARD_MIN_WIDTH_MAX)
})
