import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SCRAPED_DATA_CLEANUP_FIELDS,
  scrapedDataCleanupCounts,
  scrapedDataCleanupTotal,
} from '../../src/utils/scrapedDataCleanup.js'

test('lists known unused scraped-data fields', () => {
  assert.deepEqual(
    SCRAPED_DATA_CLEANUP_FIELDS.map((field) => field.key),
    ['javs', 'scraped_tags', 'idols', 'studios', 'series', 'covers', 'expired_cache']
  )
})

test('returns only positive unused counts', () => {
  const counts = scrapedDataCleanupCounts({
    javs: 4,
    scraped_tags: 0,
    covers: 2,
    unknown: 9,
  })
  assert.deepEqual(
    counts.map((field) => ({ key: field.key, count: field.count })),
    [
      { key: 'javs', count: 4 },
      { key: 'covers', count: 2 },
    ]
  )
})

test('prefers the server total when present', () => {
  assert.equal(scrapedDataCleanupTotal({ total: 7, javs: 1 }), 7)
  assert.equal(scrapedDataCleanupTotal({ javs: 3, covers: 2 }), 5)
})
