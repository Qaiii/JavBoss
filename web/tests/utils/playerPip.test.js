import assert from 'node:assert/strict'
import test from 'node:test'

import { PIP_MARGIN, clampPipPosition } from '../../src/utils/playerPip.js'

test('keeps a floating player inside the viewport', () => {
  assert.deepEqual(clampPipPosition(80, 40, 420, 236, 1280, 720), { left: 80, top: 40 })
  assert.deepEqual(clampPipPosition(-40, -10, 420, 236, 1280, 720), {
    left: PIP_MARGIN,
    top: PIP_MARGIN,
  })
  assert.deepEqual(clampPipPosition(2000, 2000, 420, 236, 1280, 720), {
    left: 1280 - 420 - PIP_MARGIN,
    top: 720 - 236 - PIP_MARGIN,
  })
})

test('falls back to the margin when the window is smaller than the player', () => {
  assert.deepEqual(clampPipPosition(80, 40, 500, 300, 320, 200), {
    left: PIP_MARGIN,
    top: PIP_MARGIN,
  })
})
