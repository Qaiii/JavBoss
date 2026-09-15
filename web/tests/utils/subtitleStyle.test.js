import assert from 'node:assert/strict'
import test from 'node:test'

import fs from 'node:fs'

import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_STYLE_BASE_FONT_REM,
  SUBTITLE_STYLE_STORAGE_KEY,
  loadSubtitleStyle,
  normalizeSubtitleStyle,
  saveSubtitleStyle,
  subtitleBackgroundCss,
  subtitleEdgeCss,
  subtitleStyleCssVars,
} from '../../src/utils/subtitleStyle.js'

test('defaults subtitle size to 2rem at 100% scale', () => {
  assert.equal(SUBTITLE_STYLE_BASE_FONT_REM, 2)
  assert.equal(DEFAULT_SUBTITLE_STYLE.scale, 1)
  const css = fs.readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')
  assert.match(css, /font-size:\s*calc\(2rem \* var\(--jb-sub-scale,\s*1\)\)/)
})

test('defaults subtitle position to 92% from the top of the player', () => {
  assert.equal(DEFAULT_SUBTITLE_STYLE.offset, 92)
  const css = fs.readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')
  assert.match(css, /top:\s*var\(--jb-sub-offset,\s*92%\)/)
  assert.match(css, /transform:\s*translateY\(calc\(-1 \* var\(--jb-sub-offset,\s*92%\)\)\)/)
  assert.doesNotMatch(css, /padding-bottom:\s*var\(--jb-sub-offset/)
})

test('normalizes subtitle style with fallbacks and clamps', () => {
  assert.deepEqual(normalizeSubtitleStyle(null), DEFAULT_SUBTITLE_STYLE)
  assert.equal(normalizeSubtitleStyle({ scale: 9 }).scale, 2.4)
  assert.equal(normalizeSubtitleStyle({ scale: 0.1 }).scale, 0.8)
  assert.equal(normalizeSubtitleStyle({ offset: 99 }).offset, 99)
  assert.equal(normalizeSubtitleStyle({ offset: -4 }).offset, 0)
  assert.equal(normalizeSubtitleStyle({ offset: 140 }).offset, 100)
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
    offset: 80,
  })
  assert.equal(vars['--jb-sub-scale'], '1.5')
  assert.equal(vars['--jb-sub-color'], '#ffe566')
  assert.equal(vars['--jb-sub-bg'], subtitleBackgroundCss('off'))
  assert.equal(vars['--jb-sub-shadow'], subtitleEdgeCss('shadow'))
  assert.equal(vars['--jb-sub-offset'], '80%')
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
  const saved = saveSubtitleStyle({ scale: 1.8, color: '#7ee7ff', background: 'solid', offset: 80 })
  assert.equal(saved.scale, 1.8)
  assert.equal(saved.color, '#7ee7ff')
  const loaded = loadSubtitleStyle()
  assert.equal(loaded.background, 'solid')
  assert.equal(loaded.offset, 80)
  assert.equal(loaded.v, 2)

  memory.set(
    SUBTITLE_STYLE_STORAGE_KEY,
    JSON.stringify({
      scale: 1.2,
      color: '#ffffff',
      background: 'medium',
      edge: 'outline',
      offset: 12,
    })
  )
  const migrated = loadSubtitleStyle()
  assert.equal(migrated.offset, 92)
  assert.equal(migrated.scale, 1.2)
  assert.equal(migrated.v, 2)
  delete globalThis.window
})
