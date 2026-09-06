import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findVideoSortOption,
  isUnorderedSortOption,
  normalizeVideoSort,
  videoSortLabelParts,
} from '../../src/constants/video.js'

test('accepts random as a video sort value', () => {
  assert.equal(normalizeVideoSort('random'), 'random')
  const option = findVideoSortOption('random')
  assert.equal(option?.base, 'random')
  assert.equal(isUnorderedSortOption(option), true)
})

test('random video sort has no direction label', () => {
  const option = findVideoSortOption('random')
  const parts = videoSortLabelParts(option, 'random', (zh) => zh)
  assert.equal(parts.label, '随机')
  assert.equal(parts.separator, '')
  assert.equal(parts.direction, '')
})
