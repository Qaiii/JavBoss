import assert from 'node:assert/strict'
import test from 'node:test'

import { getPlayerDisplayName, getVideoDisplayName } from '../../src/utils/display.js'

test('uses filename as the video display name', () => {
  assert.equal(getVideoDisplayName({ filename: 'SSIS-001.mp4' }), 'SSIS-001.mp4')
  assert.equal(getVideoDisplayName({ path: '/videos/clip.mkv' }), 'clip.mkv')
})

test('player title bar appends jav title when present', () => {
  const video = {
    filename: 'SSIS-001.mp4',
    jav: { title: '中年オヤジ', title_zh: '中年父亲与制服美少女' },
  }
  assert.equal(getPlayerDisplayName(video, false), 'SSIS-001.mp4 · 中年オヤジ')
  assert.equal(getPlayerDisplayName(video, true), 'SSIS-001.mp4 · 中年父亲与制服美少女')
})

test('player title bar stays filename-only without a jav title', () => {
  assert.equal(getPlayerDisplayName({ filename: 'clip.mp4' }), 'clip.mp4')
  assert.equal(
    getPlayerDisplayName({ filename: 'SSIS-001.mp4', jav: { code: 'SSIS-001' } }),
    'SSIS-001.mp4'
  )
  assert.equal(
    getPlayerDisplayName({ filename: '中年オヤジ.mp4', jav: { title: '中年オヤジ' } }),
    '中年オヤジ.mp4'
  )
})
