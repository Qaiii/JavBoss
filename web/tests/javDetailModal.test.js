import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const modal = fs.readFileSync(
  new URL('../src/features/jav/components/JavDetailModal.jsx', import.meta.url),
  'utf8'
)

test('detail modal keeps a stable scrollbar gutter', () => {
  assert.match(css, /\.app-modal-body\s*\{[^}]*scrollbar-gutter:\s*stable/s)
  assert.match(
    modal,
    /className="app-modal-body min-h-0 flex-1 overflow-y-auto p-4 \[overflow-anchor:none\] sm:p-6"/
  )
})

test('screenshot polling does not restart when only the videos array identity changes', () => {
  assert.match(modal, /videosRef\.current = videos/)
  assert.match(modal, /},\s*\[videoIdentity\]\)/)
  assert.doesNotMatch(modal, /},\s*\[videoIdentity,\s*videos\]\)/)
})
