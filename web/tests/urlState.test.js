import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/utils/urlState.js', import.meta.url), 'utf8')

test('page URL state no longer parses or serializes directory_ids', () => {
  assert.doesNotMatch(source, /directory_ids/)
})

// The fork had dropped random/seed from the URL because its views no longer
// exposed random mode. The merged app keeps upstream's search UI, whose random
// toggles still drive the store, so the seed is serialized again.
test('page URL state serializes the random seed', () => {
  assert.match(source, /sp\.set\('random', '1'\)/)
  assert.match(source, /sp\.set\('seed',/)
})
