import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const view = fs.readFileSync(new URL('../src/components/JavView.jsx', import.meta.url), 'utf8')
const header = fs.readFileSync(
  new URL('../src/components/JavSeriesDetailHeader.jsx', import.meta.url),
  'utf8'
)
const grid = fs.readFileSync(new URL('../src/components/JavGrid.jsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')

test('series detail shows a header above the works list', () => {
  assert.match(view, /JavDetailHeader/)
  assert.match(view, /showDetailHeader \?/)
  assert.match(view, /forceHideSeries=\{showSeriesHeader\}/)
})

test('tag and studio details reuse the same header', () => {
  assert.match(view, /seriesId > 0 \? 'series' : studioId > 0 \? 'studio' : tagId > 0 \? 'tag'/)
  assert.match(view, /collapseIdols=\{headerKind !== 'series'\}/)
  assert.match(view, /activeStudioId/)
  assert.match(view, /activeTagId/)
})

test('series header lists name, in-library count, and idols', () => {
  assert.match(header, /入库/)
  assert.match(header, /entity\?\.idols/)
  assert.match(header, /work_count/)
  assert.match(header, /fetchJavStudioPreview/)
  assert.match(header, /fetchJavTagPreview/)
  assert.match(header, /aria-expanded/)
})

test('series detail cards hide the series field', () => {
  assert.match(grid, /forceHideSeries = false/)
  assert.match(grid, /hideSeriesSetting \|\| forceHideSeries/)
})

test('tag preview loads a single tag with idols', () => {
  assert.match(api, /export async function fetchJavTagPreview/)
  assert.match(api, /\/jav\/tags\/\$\{encodeURIComponent\(id\)\}/)
})
