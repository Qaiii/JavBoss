import assert from 'node:assert/strict'
import test from 'node:test'
import { canPlayHEVC, isHEVCCodec, selectPlaybackSource } from '../../src/utils/playerSource.js'

const h264Direct = {
  preferred_kind: 'direct',
  video_codec: 'h264',
  sources: [
    { kind: 'direct', src: '/videos/1/stream' },
    { kind: 'hls', src: '/videos/1/stream.m3u8' },
  ],
}

const hevcOptional = {
  preferred_kind: 'hls',
  video_codec: 'hevc',
  sources: [
    { kind: 'direct', src: '/videos/2/stream' },
    { kind: 'hls', src: '/videos/2/stream.m3u8' },
  ],
}

test('isHEVCCodec recognizes common aliases', () => {
  assert.equal(isHEVCCodec('hevc'), true)
  assert.equal(isHEVCCodec('H265'), true)
  assert.equal(isHEVCCodec('h.265'), true)
  assert.equal(isHEVCCodec('h264'), false)
})

test('selectPlaybackSource prefers guaranteed H.264 direct play', () => {
  assert.equal(selectPlaybackSource(h264Direct).kind, 'direct')
})

test('selectPlaybackSource uses native HEVC when the browser can decode it', () => {
  assert.equal(selectPlaybackSource(hevcOptional, { canPlayHEVC: true }).kind, 'direct')
  assert.equal(selectPlaybackSource(hevcOptional, { canPlayHEVC: false }).kind, 'hls')
})

test('selectPlaybackSource can force HLS after a native decode failure', () => {
  assert.equal(
    selectPlaybackSource(hevcOptional, { canPlayHEVC: true, forceHls: true }).kind,
    'hls'
  )
})

test('canPlayHEVC checks hvc1 and hev1 codec strings', () => {
  const video = {
    canPlayType(type) {
      return type.includes('hvc1') ? 'probably' : ''
    },
  }
  assert.equal(canPlayHEVC(video), true)
  assert.equal(canPlayHEVC({ canPlayType: () => '' }), false)
})
