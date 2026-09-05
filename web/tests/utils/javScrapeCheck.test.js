import assert from 'node:assert/strict'
import test from 'node:test'

import {
  JAV_SCRAPE_CHECK_FIELDS,
  javScrapeCheckFieldCounts,
  javScrapeCheckHasPending,
} from '../../src/utils/javScrapeCheck.js'

test('lists known scrape completeness fields', () => {
  assert.deepEqual(
    JAV_SCRAPE_CHECK_FIELDS.map((field) => field.key),
    [
      'cover_landscape',
      'cover_portrait',
      'title',
      'tags',
      'series',
      'studio',
      'source',
      'idols',
      'release',
      'duration',
      'uncensored',
    ]
  )
})

test('returns only incomplete field counts', () => {
  const counts = javScrapeCheckFieldCounts({
    fields: { title: 3, tags: 0, studio: 2, unknown: 9 },
  })
  assert.deepEqual(
    counts.map((field) => ({ key: field.key, count: field.count })),
    [
      { key: 'title', count: 3 },
      { key: 'studio', count: 2 },
    ]
  )
})

test('treats cover or metadata queues as pending work', () => {
  assert.equal(javScrapeCheckHasPending({ cover_pending: 0, metadata_pending: 0 }), false)
  assert.equal(javScrapeCheckHasPending({ cover_pending: 2, metadata_pending: 0 }), true)
  assert.equal(javScrapeCheckHasPending({ cover_pending: 0, metadata_pending: 1 }), true)
})
