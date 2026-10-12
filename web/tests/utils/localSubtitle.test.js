import assert from 'node:assert/strict'
import test from 'node:test'

import {
  pickDefaultLocalSubtitle,
  resolveAutoLocalSubtitle,
} from '../../src/utils/localSubtitle.js'

const files = [
  { name: 'SSIS-480.srt', label: 'SSIS-480.srt (匹配)' },
  { name: 'SSIS-480.cht.srt', label: 'SSIS-480.cht.srt' },
  { name: 'SSIS-480.eng.srt', label: 'SSIS-480.eng.srt' },
]

test('picks the first local subtitle, which is the closest filename match', () => {
  assert.deepEqual(pickDefaultLocalSubtitle(files), { kind: 'local', name: 'SSIS-480.srt' })
})

test('skips entries without a file name and ignores non-lists', () => {
  assert.deepEqual(
    pickDefaultLocalSubtitle([{ label: 'missing' }, { name: '  ' }, { name: 'a.srt' }]),
    {
      kind: 'local',
      name: 'a.srt',
    }
  )
  assert.equal(pickDefaultLocalSubtitle([]), null)
  assert.equal(pickDefaultLocalSubtitle(null), null)
})

test('auto-enables a local subtitle only when nothing is selected and the user has not turned them off', () => {
  assert.deepEqual(resolveAutoLocalSubtitle(null, files, false), {
    kind: 'local',
    name: 'SSIS-480.srt',
  })
  assert.equal(resolveAutoLocalSubtitle(null, files, true), null)
  assert.equal(resolveAutoLocalSubtitle({ kind: 'online', id: 'remote-1' }, files, false), null)
  assert.equal(resolveAutoLocalSubtitle(null, [], false), null)
})
