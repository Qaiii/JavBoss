import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findSortOption,
  isUnorderedSortOption,
  JAV_SORT_OPTIONS,
  normalizeJavSort,
  resolveJavSort,
  sortLabel,
} from '../../src/constants/jav.js'

test('accepts random as a jav sort value', () => {
  assert.equal(normalizeJavSort('random'), 'random')
  const option = findSortOption(JAV_SORT_OPTIONS, 'random')
  assert.equal(option?.base, 'random')
  assert.equal(isUnorderedSortOption(option), true)
  assert.equal(
    sortLabel(option, 'random', (zh) => zh),
    '随机'
  )
})

test('resolveJavSort uses default random without a special random mode', () => {
  const resolved = resolveJavSort({ javSort: 'random', javTempSort: '', javSortRules: [] })
  assert.equal(resolved.sort, 'random')
  assert.equal(resolved.source, 'default')
})
