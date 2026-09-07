import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const view = fs.readFileSync(new URL('../src/components/JavView.jsx', import.meta.url), 'utf8')
const header = fs.readFileSync(
  new URL('../src/components/JavSeriesDetailHeader.jsx', import.meta.url),
  'utf8'
)
const grid = fs.readFileSync(new URL('../src/components/JavGrid.jsx', import.meta.url), 'utf8')

test('series detail shows a header above the works list', () => {
  assert.match(view, /JavSeriesDetailHeader/)
  assert.match(view, /showSeriesHeader \?/)
  assert.match(view, /forceHideSeries=\{showSeriesHeader\}/)
})

test('series header lists name, in-library count, and idols', () => {
  assert.match(header, /入库/)
  assert.match(header, /series\?\.idols/)
  assert.match(header, /work_count/)
})

test('series detail cards hide the series field', () => {
  assert.match(grid, /forceHideSeries = false/)
  assert.match(grid, /hideSeriesSetting \|\| forceHideSeries/)
})
