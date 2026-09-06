import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isUnimportedJav,
  javCardExternalSourceKeys,
  javExternalSourceKey,
  javLibraryScopeQueryFlags,
  JAV_LIBRARY_SCOPE_ALL,
  JAV_LIBRARY_SCOPE_LIBRARY,
  JAV_LIBRARY_SCOPE_UNIMPORTED,
  JAV_LIBRARY_SCOPE_STORAGE_KEY,
  JAV_SHOW_EXTERNAL_WORKS_STORAGE_KEY,
  loadSavedJavLibraryScope,
  normalizeJavLibraryScope,
  saveJavLibraryScope,
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

test('shows the same catalog sources for unimported works as library works', () => {
  assert.deepEqual(
    javCardExternalSourceKeys({ inLibrary: false, sourceURL: 'https://javdb.com/v/abc' }),
    ['javlibrary', 'javbus', 'javdb', 'javmenu', 'missav']
  )
  assert.deepEqual(javCardExternalSourceKeys({ inLibrary: false, sourceURL: '' }), [
    'javlibrary',
    'javbus',
    'javdb',
    'javmenu',
    'missav',
  ])
  assert.deepEqual(javCardExternalSourceKeys({ inLibrary: true, isUncensored: false }), [
    'javlibrary',
    'javbus',
    'javdb',
    'javmenu',
    'missav',
  ])
  assert.deepEqual(
    javCardExternalSourceKeys({
      inLibrary: false,
      isUncensored: true,
      sourceURL: 'https://javdb.com/v/abc',
    }),
    ['javbus', 'avsox', 'javdb']
  )
  assert.deepEqual(
    javCardExternalSourceKeys({ inLibrary: false, sourceURL: 'https://avsox.click/tw/abc' }),
    ['javbus', 'avsox']
  )
})

test('normalizes jav library scope values', () => {
  assert.equal(normalizeJavLibraryScope('library'), JAV_LIBRARY_SCOPE_LIBRARY)
  assert.equal(normalizeJavLibraryScope('ALL'), JAV_LIBRARY_SCOPE_ALL)
  assert.equal(normalizeJavLibraryScope('unimported'), JAV_LIBRARY_SCOPE_UNIMPORTED)
  assert.equal(normalizeJavLibraryScope('nope'), JAV_LIBRARY_SCOPE_ALL)
  assert.equal(normalizeJavLibraryScope('', JAV_LIBRARY_SCOPE_LIBRARY), JAV_LIBRARY_SCOPE_LIBRARY)
})

test('maps library scope to jav list query flags', () => {
  assert.deepEqual(javLibraryScopeQueryFlags(JAV_LIBRARY_SCOPE_ALL, { idolCount: 1 }), {
    includeExternal: true,
    unimportedOnly: false,
  })
  assert.deepEqual(javLibraryScopeQueryFlags(JAV_LIBRARY_SCOPE_UNIMPORTED, { idolCount: 1 }), {
    includeExternal: false,
    unimportedOnly: true,
  })
  assert.deepEqual(javLibraryScopeQueryFlags(JAV_LIBRARY_SCOPE_LIBRARY, { idolCount: 0 }), {
    includeExternal: false,
    unimportedOnly: false,
  })
  assert.deepEqual(javLibraryScopeQueryFlags(JAV_LIBRARY_SCOPE_ALL, { idolCount: 0 }), {
    includeExternal: true,
    unimportedOnly: false,
  })
  assert.deepEqual(javLibraryScopeQueryFlags(JAV_LIBRARY_SCOPE_ALL, { idolCount: 2 }), {
    includeExternal: false,
    unimportedOnly: false,
  })
  assert.deepEqual(javLibraryScopeQueryFlags(JAV_LIBRARY_SCOPE_ALL, { singleIdol: true }), {
    includeExternal: true,
    unimportedOnly: false,
  })
})

test('loads jav library scope from storage with legacy fallback', () => {
  const storage = new Map()
  const mock = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  }
  assert.equal(loadSavedJavLibraryScope(mock), JAV_LIBRARY_SCOPE_ALL)

  mock.setItem(JAV_SHOW_EXTERNAL_WORKS_STORAGE_KEY, '0')
  assert.equal(loadSavedJavLibraryScope(mock), JAV_LIBRARY_SCOPE_LIBRARY)

  mock.setItem(JAV_LIBRARY_SCOPE_STORAGE_KEY, JAV_LIBRARY_SCOPE_UNIMPORTED)
  assert.equal(loadSavedJavLibraryScope(mock), JAV_LIBRARY_SCOPE_UNIMPORTED)

  saveJavLibraryScope('library', mock)
  assert.equal(mock.getItem(JAV_LIBRARY_SCOPE_STORAGE_KEY), JAV_LIBRARY_SCOPE_LIBRARY)
})
