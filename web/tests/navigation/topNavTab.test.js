import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTopNavTab } from '../../src/navigation/topNavTab.js'

test('section homes keep their own top-nav tab', () => {
  assert.equal(resolveTopNavTab({ isJavMode: false }), 'video')
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list' }), 'list')
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'idol' }), 'idol')
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'studio' }), 'studio')
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'series' }), 'series')
})

test('a single idol works page selects nothing in the top nav', () => {
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list', javIdolIds: [601] }), '')
  assert.equal(
    resolveTopNavTab({ isJavMode: true, javTab: 'list', javIdolIds: [1], javSeriesId: 3 }),
    '',
    'the idol profile wraps the page when exactly one idol is selected'
  )
})

test('drilled-in pages highlight the page they actually show', () => {
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list', javSeriesId: 3 }), 'series')
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list', javStudioId: 4 }), 'studio')
  assert.equal(
    resolveTopNavTab({ isJavMode: true, javTab: 'list', javStudioId: 0 }),
    'studio',
    'unknown studio is still a studio page'
  )
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list', javTags: [9] }), 'tags')
})

test('a filtered JAV list stays on JAV when it is not a single-entity page', () => {
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list', javIdolIds: [1, 2] }), 'list')
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'list', javTags: [1, 2] }), 'list')
})

test('legacy download is not a top-nav destination', () => {
  assert.equal(resolveTopNavTab({ isJavMode: true, javTab: 'download' }), '')
})
