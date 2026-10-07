import assert from 'node:assert/strict'
import test from 'node:test'
import { browserUnavailable, openBrowser } from '../helpers/browser.js'
import {
  clickMoreItem,
  clickNavItem,
  enterNavSearch,
  openFilterPanel,
  submitNavSearch,
} from '../helpers/nav.js'

test(
  'titles follow submitted searches, favorites, detail updates and history',
  { skip: browserUnavailable, timeout: 60000 },
  async (t) => {
    const { origin, command, evaluate, waitFor } = await openBrowser(t)
    await command('Page.navigate', { url: `${origin}/tests/fixtures/app.html?view=video` })
    await waitFor(`window.requests?.some(r => r.url.startsWith('/videos?'))`)
    await waitFor(`document.title === 'Videos'`)
    await enterNavSearch(evaluate, waitFor, 'movie')
    assert.equal(await evaluate('document.title'), 'Videos')
    await submitNavSearch(evaluate)
    await waitFor(`document.title === 'Search: movie - Videos'`)

    await evaluate(`{
      const originalFetch = window.fetch;
      window.fetch = (input, init) => new URL(input, location.origin).pathname === '/jav/jav-favorite-groups'
        ? Promise.resolve(Response.json({items: [{id: 7, name: 'Watch later', count: 1}]}))
        : originalFetch(input, init);
    }`)
    await clickNavItem(evaluate, waitFor, 'list')
    await waitFor(`document.title === 'JAV'`)
    await openFilterPanel(evaluate, waitFor)
    await evaluate(`document.querySelector('.favorite-menu-trigger').click()`)
    const favorite = `Array.from(document.querySelectorAll('[role="dialog"] a')).find(a => a.textContent.trim() === 'Watch later')`
    await waitFor(favorite)
    await evaluate(`${favorite}.click()`)
    await waitFor(`document.title === 'Watch later - JAV'`)
    await waitFor(`document.querySelector('.jav-card button')`)
    await evaluate(`document.querySelector('.jav-card button').click()`)
    await waitFor(`document.title === 'ABC-001 Test JAV'`)

    // Background data updates must not overwrite the visible detail's title.
    await evaluate(`window.testStore.setState(state => ({
      favoriteGroupsByType: {...state.favoriteGroupsByType, jav: [{id: 7, name: 'Renamed', count: 1}]},
      javItems: state.javItems.map(item => ({...item, title: 'Updated title'}))
    }))`)
    await waitFor(`document.title === 'ABC-001 Updated title'`)
    await evaluate('history.back()')
    await waitFor(`document.title === 'Renamed - JAV'`)
    await evaluate('history.forward()')
    await waitFor(`document.title === 'ABC-001 Updated title'`)
    await evaluate('history.back()')
    await waitFor(`document.title === 'Renamed - JAV'`)

    await clickNavItem(evaluate, waitFor, 'idol')
    await waitFor(`document.title === 'Idols'`)
    await enterNavSearch(evaluate, waitFor, 'Test actress')
    await submitNavSearch(evaluate)
    await waitFor(`document.title === 'Search: Test actress - Idols'`)
    for (const [nav, title, closeLabel] of [
      ['download', 'Downloads', 'Close downloads dialog'],
      ['settings', 'Settings', 'Close global settings'],
    ]) {
      await clickMoreItem(evaluate, waitFor, nav)
      await waitFor(`document.title === '${title}'`)
      await evaluate(`document.querySelector('button[aria-label="${closeLabel}"]').click()`)
      await waitFor(`document.title === 'Search: Test actress - Idols'`)
    }
    assert.deepEqual(await evaluate('window.appErrors'), [])
  }
)
