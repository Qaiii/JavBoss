import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatScrapeIntervalMs,
  javScrapeDataLabels,
  javScrapePendingTotal,
  javScrapeQueues,
  javScrapeSourceName,
} from '../../src/utils/javScrapeStatus.js'

test('maps known scrape source names', () => {
  assert.deepEqual(javScrapeSourceName({ id: 'javbus' }), ['JavBus', 'JavBus'])
  assert.deepEqual(javScrapeSourceName({ id: 'unknown-site' }), ['unknown-site', 'unknown-site'])
})

test('maps scrape data keys to labels', () => {
  const labels = javScrapeDataLabels(['title', 'title_zh', 'nope'])
  assert.deepEqual(
    labels.map((field) => field.key),
    ['title', 'title_zh']
  )
})

test('sums pending scrape queues', () => {
  const status = {
    queues: [
      { id: 'covers', pending: 2 },
      { id: 'metadata_repair', pending: 0 },
      { id: 'idol_works', pending: 4 },
      { id: 'idol_work_metadata', pending: 1 },
    ],
  }
  const queues = javScrapeQueues(status)
  assert.equal(queues.length, 4)
  assert.equal(queues[0].pending, 2)
  assert.deepEqual(queues[0].name, ['封面下载', 'Cover downloads'])
  assert.equal(javScrapePendingTotal(status), 7)
  assert.equal(javScrapePendingTotal({}), 0)
})

test('formats scrape intervals', () => {
  assert.deepEqual(formatScrapeIntervalMs(3000), { value: 3, unit: 'second' })
  assert.deepEqual(formatScrapeIntervalMs(60000), { value: 1, unit: 'minute' })
  assert.deepEqual(formatScrapeIntervalMs(750), { value: 750, unit: 'ms' })
})
