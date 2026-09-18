import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const hook = fs.readFileSync(new URL('../src/hooks/useOverlayHistory.js', import.meta.url), 'utf8')

test('overlay history closes on popstate and pops the dummy entry when dismissed', () => {
  assert.match(hook, /pushOverlayHistory\(\)/)
  assert.match(hook, /window\.addEventListener\('popstate', handlePopState\)/)
  assert.match(hook, /onCloseRef\.current\?\.\(\)/)
  assert.match(hook, /popOverlayHistory\(\)/)
  assert.match(hook, /wasActiveRef/)
})
