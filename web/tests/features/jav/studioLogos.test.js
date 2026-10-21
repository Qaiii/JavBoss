import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeStudioLogoKey, studioLogoFor } from '../../../src/features/jav/studioLogos.js'

test('normalizes studio names before logo lookup', () => {
  assert.equal(normalizeStudioLogoKey(' S1 NO.1 STYLE '), 's1no1style')
  assert.equal(normalizeStudioLogoKey('kira☆kira'), 'kirakira')
  assert.equal(normalizeStudioLogoKey('ダスッ！'), 'ダスッ')
})

test('resolves brand and company logos from the studio name', () => {
  assert.deepEqual(studioLogoFor('MADONNA'), {
    src: '/studio-logos/madonna.png',
    plate: 'plain',
  })
  assert.deepEqual(studioLogoFor('SOD Create'), {
    src: '/studio-logos/sod.png',
    plate: 'light',
  })
  assert.deepEqual(studioLogoFor(['unknown', '溜池ゴロー']), {
    src: '/studio-logos/tameikegoro.png',
    plate: 'plain',
  })
  assert.equal(studioLogoFor('KANBi'), null)
  assert.equal(studioLogoFor(''), null)
})
