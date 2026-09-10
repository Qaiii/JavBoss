import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PIP_CONTROLS_HEIGHT,
  PIP_MARGIN,
  PIP_MAX_WIDTH,
  PIP_MIN_WIDTH,
  clampPipPosition,
  clampPipWidth,
  getDocumentPipWindowSize,
  pipResizeMaxWidth,
} from '../../src/utils/playerPip.js'

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

test('sizes a document picture-in-picture window from the video aspect ratio', () => {
  assert.deepEqual(getDocumentPipWindowSize(16 / 9, 420), {
    width: 420,
    height: Math.round(420 / (16 / 9)) + PIP_CONTROLS_HEIGHT,
  })
  assert.equal(getDocumentPipWindowSize(0, 420).width, 420)
  assert.ok(getDocumentPipWindowSize(9 / 16, 420).height <= 1600)
})

test('clamps picture-in-picture width for resize', () => {
  assert.equal(clampPipWidth(80), PIP_MIN_WIDTH)
  assert.equal(clampPipWidth(4000), PIP_MAX_WIDTH)
  assert.equal(clampPipWidth(500), 500)
  assert.equal(clampPipWidth(800, 600), 600)
})

test('document picture-in-picture resize max is not the current window width', () => {
  assert.equal(pipResizeMaxWidth('document', 420), PIP_MAX_WIDTH)
  assert.equal(pipResizeMaxWidth('document', 420, 900), 900)
  assert.equal(pipResizeMaxWidth('document', 420, 1920), PIP_MAX_WIDTH)
  assert.ok(clampPipWidth(420 + 200, pipResizeMaxWidth('document', 420)) > 420)
  assert.equal(clampPipWidth(420 + 200, 420), 420)
  assert.equal(pipResizeMaxWidth('inline', 900), 900)
  assert.equal(pipResizeMaxWidth('inline', 1920), 1920)
})
