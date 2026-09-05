import assert from 'node:assert/strict'
import test from 'node:test'

import {
  JAV_COVER_ORIENTATION_LANDSCAPE,
  JAV_COVER_ORIENTATION_PORTRAIT,
  javCardCoverSrc,
  javCoverAspectClass,
  javCoverGridMinmax,
  javCoverIsPortrait,
  javCoverSrc,
  normalizeJavCoverOrientation,
} from '../../src/utils/javCover.js'

test('normalizes cover orientation to landscape by default', () => {
  assert.equal(normalizeJavCoverOrientation(''), JAV_COVER_ORIENTATION_LANDSCAPE)
  assert.equal(normalizeJavCoverOrientation('sideways'), JAV_COVER_ORIENTATION_LANDSCAPE)
  assert.equal(normalizeJavCoverOrientation('portrait'), JAV_COVER_ORIENTATION_PORTRAIT)
  assert.equal(normalizeJavCoverOrientation('PORTRAIT'), JAV_COVER_ORIENTATION_PORTRAIT)
})

test('builds cover URLs without orientation (always the landscape file)', () => {
  assert.equal(javCoverSrc('ABC-001'), '/jav/ABC-001/cover')
  assert.equal(javCoverSrc('ABC-001', { version: 3 }), '/jav/ABC-001/cover?v=3')
  assert.equal(javCoverSrc(''), '')
})

test('uses cropped portrait geometry for portrait display', () => {
  assert.equal(javCoverAspectClass('portrait'), '')
  assert.equal(javCoverAspectClass('landscape'), 'aspect-[800/538]')
  assert.equal(javCoverGridMinmax('portrait'), '13rem')
  assert.equal(javCoverGridMinmax('landscape'), '21rem')
  assert.equal(javCoverIsPortrait('portrait'), true)
  assert.equal(javCoverIsPortrait('landscape'), false)
})

test('uses remote cover_url for unimported cards', () => {
  assert.equal(
    javCardCoverSrc({
      code: 'EXT-NEW',
      inLibrary: false,
      coverUrl: 'https://cover/ext-new.jpg',
    }),
    'https://cover/ext-new.jpg'
  )
  assert.equal(
    javCardCoverSrc({
      code: 'EXT-NEW',
      inLibrary: false,
      coverUrl: '  ',
    }),
    null
  )
})

test('uses local cover API for in-library cards', () => {
  assert.equal(
    javCardCoverSrc({
      code: 'ABC-001',
      inLibrary: true,
      coverUrl: 'https://cover/ignored.jpg',
      version: 2,
    }),
    '/jav/ABC-001/cover?v=2'
  )
})
