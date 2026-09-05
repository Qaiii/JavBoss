import assert from 'node:assert/strict'
import test from 'node:test'

import {
  JAV_COVER_ORIENTATION_LANDSCAPE,
  JAV_COVER_ORIENTATION_PORTRAIT,
  javCoverAspectClass,
  javCoverGridMinmax,
  javCoverSrc,
  normalizeJavCoverOrientation,
} from '../../src/utils/javCover.js'

test('normalizes cover orientation to landscape by default', () => {
  assert.equal(normalizeJavCoverOrientation(''), JAV_COVER_ORIENTATION_LANDSCAPE)
  assert.equal(normalizeJavCoverOrientation('sideways'), JAV_COVER_ORIENTATION_LANDSCAPE)
  assert.equal(normalizeJavCoverOrientation('portrait'), JAV_COVER_ORIENTATION_PORTRAIT)
  assert.equal(normalizeJavCoverOrientation('PORTRAIT'), JAV_COVER_ORIENTATION_PORTRAIT)
})

test('builds cover URLs with orientation and cache-busting', () => {
  assert.equal(javCoverSrc('ABC-001'), '/jav/ABC-001/cover?orientation=landscape')
  assert.equal(
    javCoverSrc('ABC-001', { orientation: 'portrait', version: 3 }),
    '/jav/ABC-001/cover?orientation=portrait&v=3'
  )
  assert.equal(javCoverSrc(''), '')
})

test('uses portrait card geometry for portrait covers', () => {
  assert.equal(javCoverAspectClass('portrait'), 'aspect-[2/3]')
  assert.equal(javCoverAspectClass('landscape'), 'aspect-[800/538]')
  assert.equal(javCoverGridMinmax('portrait'), '12rem')
  assert.equal(javCoverGridMinmax('landscape'), '21rem')
})
