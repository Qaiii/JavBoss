import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isOverlayHistoryState,
  popOverlayHistory,
  pushOverlayHistory,
  withOverlayHistoryState,
} from '../../src/utils/overlayHistory.js'

function installFakeHistory(
  initialState = { idx: 1, key: 'abc', usr: { __javbossHistoryIndex: 1 } }
) {
  const entries = [{ url: '/?view=video', state: initialState }]
  let index = 0
  const popListeners = new Set()

  const location = {
    pathname: '/',
    search: '?view=video',
    hash: '',
  }

  const history = {
    get state() {
      return entries[index].state
    },
    get length() {
      return entries.length
    },
    pushState(state, _title, url) {
      entries.splice(index + 1)
      entries.push({ state, url: url || entries[index].url })
      index += 1
    },
    back() {
      if (index <= 0) return
      index -= 1
      popListeners.forEach((listener) => listener())
    },
  }

  const previous = {
    window: globalThis.window,
    history: globalThis.history,
    location: globalThis.location,
  }

  const fakeWindow = {
    history,
    location,
    addEventListener(type, listener) {
      if (type === 'popstate') popListeners.add(listener)
    },
    removeEventListener(type, listener) {
      popListeners.delete(listener)
    },
  }

  globalThis.window = fakeWindow
  globalThis.history = history
  globalThis.location = location

  return {
    entries,
    get index() {
      return index
    },
    restore() {
      globalThis.window = previous.window
      globalThis.history = previous.history
      globalThis.location = previous.location
    },
  }
}

test('overlay history state copies router idx and marks both root and usr', () => {
  const next = withOverlayHistoryState(
    { idx: 3, key: 'k1', usr: { __javbossHistoryIndex: 3, __javbossScroll: { x: 0, y: 80 } } },
    true
  )
  assert.equal(next.idx, 3)
  assert.equal(next.key, 'k1')
  assert.equal(next.__javbossOverlay, true)
  assert.equal(next.usr.__javbossOverlay, true)
  assert.equal(next.usr.__javbossHistoryIndex, 3)
  assert.deepEqual(next.usr.__javbossScroll, { x: 0, y: 80 })
  assert.equal(isOverlayHistoryState(next), true)
  assert.equal(isOverlayHistoryState({ usr: { __javbossOverlay: true } }), true)
  assert.equal(isOverlayHistoryState({ idx: 0, usr: {} }), false)
})

test('pushOverlayHistory adds a same-url entry once, then back restores the page', () => {
  const fake = installFakeHistory()
  try {
    assert.equal(pushOverlayHistory(), true)
    assert.equal(fake.entries.length, 2)
    assert.equal(fake.index, 1)
    assert.equal(fake.entries[1].url, '/?view=video')
    assert.equal(isOverlayHistoryState(), true)
    assert.equal(fake.entries[1].state.idx, 1)
    assert.equal(pushOverlayHistory(), false)
    assert.equal(fake.entries.length, 2)

    assert.equal(popOverlayHistory(), true)
    assert.equal(fake.index, 0)
    assert.equal(isOverlayHistoryState(), false)
    assert.equal(popOverlayHistory(), false)
    assert.equal(fake.index, 0)
  } finally {
    fake.restore()
  }
})
