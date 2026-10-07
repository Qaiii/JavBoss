import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const topNav = read('../src/app/layout/TopNav.jsx')
const app = read('../src/App.jsx')
const javView = read('../src/features/jav/components/JavView.jsx')
const sortPanel = read('../src/features/jav/components/JavSortPanel.jsx')
const scopePanel = read('../src/features/jav/components/JavLibraryScopePanel.jsx')

test('入库 and 排序 are entries of the navigation bar 更多 menu', () => {
  assert.match(topNav, /nav="library-scope"/)
  assert.match(topNav, /nav="sort"/)
  assert.match(
    topNav,
    /const showWorksListControls = Boolean\(isJavMode\) && \(javTab \|\| 'list'\) === 'list'/
  )
  // The two entries are only rendered for the JAV works list.
  assert.ok(topNav.indexOf('showWorksListControls ?') < topNav.indexOf('nav="library-scope"'))
  assert.ok(topNav.indexOf('showWorksListControls ?') < topNav.indexOf('nav="sort"'))
})

test('the 更多 menu opens the 入库 / 排序 panels that the app layout provides', () => {
  assert.match(topNav, /renderLibraryScopePanel\?\.\(\{\s*onClose:/s)
  assert.match(topNav, /renderSortPanel\?\.\(\{\s*onClose:/s)
  assert.match(app, /renderLibraryScopePanel=\{\(\{ onClose \}\) => <JavLibraryScopePanel/)
  assert.match(app, /renderSortPanel=\{\(\{ onClose \}\) => <JavSortPanel/)
  assert.match(topNav, /import JavPrefixModal/)
})

test('the works list no longer renders 入库 / 排序 itself', () => {
  assert.doesNotMatch(javView, /jav-library-scope/)
  assert.doesNotMatch(javView, /pagination-sort-button/)
  assert.doesNotMatch(javView, /jav-library-scope|JAV_LIBRARY_SCOPE_OPTIONS/)
  assert.doesNotMatch(javView, /恢复自动排序/)
  // Bulk actions stay in the page.
  assert.match(javView, /BulkActionsMenu/)
})

test('both panels write through the shared store state', () => {
  assert.match(scopePanel, /state\.setJavLibraryScope/)
  assert.match(scopePanel, /normalizeJavLibraryScope\(state\.javLibraryScope\)/)
  assert.match(scopePanel, /role="radiogroup"/)
  assert.match(sortPanel, /state\.setJavTempSort/)
  assert.match(sortPanel, /resolveJavSort\(state\)/)
  assert.match(sortPanel, /JAV_SORT_OPTIONS/)
})
