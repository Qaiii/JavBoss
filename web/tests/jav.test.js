import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isUnimportedJav,
  javCardExternalSourceKeys,
  javExternalSourceKey,
} from '../src/utils/javLibrary.js'

test('treats explicit in_library false as unimported', () => {
  assert.equal(isUnimportedJav({ code: 'ABC-001', in_library: false }), true)
})

test('treats library works and omitted flags as imported', () => {
  assert.equal(isUnimportedJav({ id: 1, code: 'ABC-001' }), false)
  assert.equal(isUnimportedJav({ id: 1, code: 'ABC-001', in_library: true }), false)
  assert.equal(isUnimportedJav(null), false)
})

test('maps known source URLs to their site key', () => {
  assert.equal(javExternalSourceKey('https://javdb.com/v/k4vOWN'), 'javdb')
  assert.equal(
    javExternalSourceKey('https://www.javlibrary.com/cn/vl_searchbyid.php?keyword=ABC'),
    'javlibrary'
  )
  assert.equal(javExternalSourceKey('https://missav.ws/ABC-001'), 'missav')
  assert.equal(javExternalSourceKey('https://example.com/abc'), '')
  assert.equal(javExternalSourceKey(''), '')
})

test('hides missing sources for unimported works', () => {
  assert.deepEqual(
    javCardExternalSourceKeys({ inLibrary: false, sourceURL: 'https://javdb.com/v/abc' }),
    ['javdb']
  )
  assert.deepEqual(javCardExternalSourceKeys({ inLibrary: false, sourceURL: '' }), [])
  assert.deepEqual(javCardExternalSourceKeys({ inLibrary: true, isUncensored: false }), [
    'javlibrary',
    'javbus',
    'javdb',
    'javmenu',
    'missav',
  ])
})
