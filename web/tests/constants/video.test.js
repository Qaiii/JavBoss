import assert from 'node:assert/strict'
import test from 'node:test'

import {
  VIDEO_SORT_OPTIONS,
  findVideoSortOption,
  isUnorderedSortOption,
  normalizeVideoSort,
  reverseVideoSortValue,
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

test('video watch time sorting supports both directions and replaces play count', () => {
  assert.equal(
    VIDEO_SORT_OPTIONS.some((option) => option.base === 'play_count'),
    false
  )
  const option = findVideoSortOption('watched')
  assert.ok(option)
  assert.equal(findVideoSortOption('watched_asc'), option)
  assert.equal(reverseVideoSortValue('watched'), 'watched_asc')
  assert.equal(reverseVideoSortValue('watched_asc'), 'watched')
  assert.deepEqual(videoSortLabelParts(option, 'watched', (cn) => cn), {
    label: '观看时长',
    separator: '：',
    direction: '长→短',
  })
})

test('saved video sort preferences and links retain direction when normalized', () => {
  for (const [input, expected] of [
    ['watched', 'watched'],
    ['watched_asc', 'watched_asc'],
    ['watched_desc', 'watched'],
    ['play_count', 'watched'],
    ['play_count_desc', 'watched'],
    [' PLAY_COUNT_ASC ', 'watched_asc'],
  ]) {
    assert.equal(normalizeVideoSort(input), expected)
  }
})
