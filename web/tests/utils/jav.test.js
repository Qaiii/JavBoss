import assert from 'node:assert/strict'
import test from 'node:test'

import {
  javTitlePrefersChinese,
  normalizeJavTitleLanguage,
  resolveJavDisplayTitle,
} from '../../src/utils/javTitle.js'

test('prefers the Chinese title when the setting is enabled', () => {
  const item = { code: 'IPX-228', title: '中年オヤジ', title_zh: '中年父亲与制服美少女' }
  assert.equal(resolveJavDisplayTitle(item, false, 'Untitled'), '中年オヤジ')
  assert.equal(resolveJavDisplayTitle(item, true, 'Untitled'), '中年父亲与制服美少女')
})

test('falls back when the preferred language title is missing', () => {
  assert.equal(
    resolveJavDisplayTitle({ code: 'IPX-228', title: '中年オヤジ' }, true, 'Untitled'),
    '中年オヤジ'
  )
  assert.equal(
    resolveJavDisplayTitle(
      { code: 'IPX-228', title_zh: '中年父亲与制服美少女' },
      false,
      'Untitled'
    ),
    '中年父亲与制服美少女'
  )
  assert.equal(resolveJavDisplayTitle({ code: 'IPX-228' }, true, 'Untitled'), 'IPX-228')
})

test('normalizes the title language setting', () => {
  assert.equal(normalizeJavTitleLanguage('chinese'), 'chinese')
  assert.equal(normalizeJavTitleLanguage('CHINESE'), 'chinese')
  assert.equal(normalizeJavTitleLanguage('original'), 'original')
  assert.equal(normalizeJavTitleLanguage(''), 'original')
  assert.equal(javTitlePrefersChinese({ jav_title_language: 'chinese' }), true)
  assert.equal(javTitlePrefersChinese({ jav_title_language: 'original' }), false)
  assert.equal(javTitlePrefersChinese({}), false)
})
