import assert from 'node:assert/strict'
import test from 'node:test'

import {
  IDOL_POSTER_KIND_SCREENSHOT,
  IDOL_POSTER_KIND_UPLOAD,
  IDOL_POSTER_MAX_IMAGES,
  idolPosterImageKey,
  idolPosterImageSrc,
  normalizeIdolPosterImages,
} from '../../src/utils/idolPoster.js'

test('builds poster keys and sources', () => {
  assert.equal(
    idolPosterImageKey({ kind: IDOL_POSTER_KIND_UPLOAD, name: 'upload_0123456789abcdef.jpg' }),
    'upload:upload_0123456789abcdef.jpg'
  )
  assert.equal(
    idolPosterImageKey({
      kind: IDOL_POSTER_KIND_SCREENSHOT,
      video_id: 9,
      name: 'mpv_00-00-12.jpg',
    }),
    'screenshot:9:mpv_00-00-12.jpg'
  )
  assert.equal(
    idolPosterImageSrc(4, { kind: IDOL_POSTER_KIND_UPLOAD, name: 'upload_0123456789abcdef.jpg' }),
    '/jav/idols/4/poster/upload_0123456789abcdef.jpg'
  )
  assert.equal(
    idolPosterImageSrc(4, {
      kind: IDOL_POSTER_KIND_SCREENSHOT,
      video_id: 9,
      name: 'mpv_00-00-12.jpg',
    }),
    '/videos/9/screenshots/mpv_00-00-12.jpg'
  )
  assert.equal(
    idolPosterImageSrc(4, { url: '/custom.png', kind: IDOL_POSTER_KIND_UPLOAD, name: 'x.jpg' }),
    '/custom.png'
  )
})

test('normalizes poster images and caps the collage', () => {
  const images = normalizeIdolPosterImages([
    { kind: IDOL_POSTER_KIND_SCREENSHOT, video_id: 1, name: 'mpv_00-00-01.jpg' },
    { kind: 'nope', name: 'x.jpg' },
    { kind: IDOL_POSTER_KIND_SCREENSHOT, video_id: 1, name: 'mpv_00-00-01.jpg' },
    { kind: IDOL_POSTER_KIND_UPLOAD, name: 'upload_0123456789abcdef.jpg' },
    ...Array.from({ length: 20 }, (_, index) => ({
      kind: IDOL_POSTER_KIND_SCREENSHOT,
      video_id: index + 2,
      name: `mpv_00-00-${String(index).padStart(2, '0')}.jpg`,
    })),
  ])
  assert.equal(images.length, IDOL_POSTER_MAX_IMAGES)
  assert.equal(images[0].kind, IDOL_POSTER_KIND_SCREENSHOT)
  assert.equal(images[1].kind, IDOL_POSTER_KIND_UPLOAD)
  assert.equal(normalizeIdolPosterImages(null).length, 0)
})
