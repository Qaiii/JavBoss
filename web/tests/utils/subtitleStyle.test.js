import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_SUBTITLE_STYLE,
  loadSubtitleStyle,
  normalizeSubtitleStyle,
  saveSubtitleStyle,
  subtitleBackgroundCss,
  subtitleEdgeCss,
  subtitleStyleCssVars,
} from '../../src/utils/subtitleStyle.js'

test('normalizes subtitle style with fallbacks and clamps', () => {
  assert.deepEqual(normalizeSubtitleStyle(null), DEFAULT_SUBTITLE_STYLE)
  assert.equal(normalizeSubtitleStyle({ scale: 9 }).scale, 2.4)
  assert.equal(normalizeSubtitleStyle({ scale: 0.1 }).scale, 0.8)
  assert.equal(normalizeSubtitleStyle({ offset: 99 }).offset, 28)
  assert.equal(normalizeSubtitleStyle({ color: 'yellow' }).color, '#ffe566')
  assert.equal(normalizeSubtitleStyle({ color: 'nope' }).color, DEFAULT_SUBTITLE_STYLE.color)
  assert.equal(normalizeSubtitleStyle({ background: 'glow' }).background, 'medium')
  assert.equal(normalizeSubtitleStyle({ edge: 'neon' }).edge, 'outline')
})

test('builds css variables for the player shell', () => {
  const vars = subtitleStyleCssVars({
    scale: 1.5,
    color: '#ffe566',
    background: 'off',
    edge: 'shadow',
    offset: 18,
  })
  assert.equal(vars['--jb-sub-scale'], '1.5')
  assert.equal(vars['--jb-sub-color'], '#ffe566')
  assert.equal(vars['--jb-sub-bg'], subtitleBackgroundCss('off'))
  assert.equal(vars['--jb-sub-shadow'], subtitleEdgeCss('shadow'))
  assert.equal(vars['--jb-sub-offset'], '18%')
})

test('persists subtitle style in localStorage', () => {
  const memory = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => {
        memory.set(key, String(value))
      },
    },
  }
  const saved = saveSubtitleStyle({ scale: 1.8, color: '#7ee7ff', background: 'solid', offset: 6 })
  assert.equal(saved.scale, 1.8)
  assert.equal(saved.color, '#7ee7ff')
  const loaded = loadSubtitleStyle()
  assert.equal(loaded.background, 'solid')
  assert.equal(loaded.offset, 6)
  delete globalThis.window
})
