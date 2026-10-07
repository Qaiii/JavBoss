import assert from 'node:assert/strict'
import test from 'node:test'
import { browserUnavailable, openBrowser } from '../../helpers/browser.js'
import { clickMoreItem, clickNavItem, navItem, openFilterPanel } from '../../helpers/nav.js'

// data-nav values are locale independent, so these assertions hold in any language.
const NAV_ORDER = ['search', 'video', 'list', 'idol', 'studio', 'series', 'tags', 'more']
const MORE_ORDER = ['codes', 'display', 'download', 'settings', 'filters']
const MODAL = `document.querySelector('[role="dialog"][aria-modal="true"]')`

test(
  'the persistent top bar holds the brand, section links, a centered search and the 更多 tools',
  { skip: browserUnavailable, timeout: 90000 },
  async (t) => {
    const { origin, command, evaluate, waitFor } = await openBrowser(t)
    const load = async () => {
      await command('Page.navigate', { url: `${origin}/tests/fixtures/app.html?view=video` })
      await waitFor(`document.querySelector('${navItem('more')}')`)
    }

    await load()

    // Brand on the left, every section link on the right; the old left dock is gone.
    assert.equal(
      await evaluate(`document.querySelector('header.app-topnav .app-topnav__brand').textContent`),
      'JavBoss'
    )
    assert.deepEqual(
      await evaluate(
        `Array.from(document.querySelectorAll('header.app-topnav [data-nav]')).map((el) => el.dataset.nav)`
      ),
      NAV_ORDER
    )
    assert.equal(
      await evaluate(`getComputedStyle(document.querySelector('header.app-topnav')).position`),
      'sticky',
      'the bar stays pinned to the top'
    )
    assert.equal(await evaluate(`document.querySelector('aside.side-tabs') === null`), true)
    assert.equal(
      await evaluate(`getComputedStyle(document.querySelector('main')).marginLeft`),
      '0px'
    )

    // The measured bar height drives --topbar-height, which sticky siblings rely on.
    const measured = await evaluate(`(() => {
      const bar = document.querySelector('header.app-topnav').getBoundingClientRect();
      return {
        bar: Math.round(bar.height),
        value: getComputedStyle(document.documentElement).getPropertyValue('--topbar-height').trim(),
      };
    })()`)
    assert.equal(measured.value, `${measured.bar}px`)

    // Clicking the search icon collapses the links and centers the field.
    await clickNavItem(evaluate, waitFor, 'search')
    await waitFor(`document.querySelector('.app-topnav__search-form input')`)
    assert.equal(
      await evaluate(`document.querySelectorAll('header.app-topnav .app-topnav__links').length`),
      0,
      'the right-hand links collapse while searching'
    )
    assert.equal(
      await evaluate(
        `document.activeElement === document.querySelector('.app-topnav__search-form input')`
      ),
      true
    )
    assert.equal(
      await evaluate(`(() => {
        const bar = document.querySelector('.app-topnav__bar').getBoundingClientRect();
        const field = document.querySelector('.app-topnav__search').getBoundingClientRect();
        return Math.abs(field.left + field.width / 2 - (bar.left + bar.width / 2)) < 2;
      })()`),
      true,
      'the search field is horizontally centered'
    )
    await evaluate(`{
      const input = document.querySelector('.app-topnav__search-form input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'movie');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }`)
    await evaluate(`document.querySelector('.app-topnav__search-form').requestSubmit()`)
    await waitFor(`window.testStore.getState().searchTerm === 'movie'`)
    await waitFor(`document.querySelector('${navItem('video')}')`)

    // "更多" opens on hover and contains its tools, filters included. Other
    // entries may be added alongside them, so only order within ours is asserted.
    await evaluate(
      `document.querySelector('${navItem('more')}').dispatchEvent(new MouseEvent('mouseover', {bubbles: true, relatedTarget: document.body}))`
    )
    await waitFor(`document.querySelector('${navItem('menu')}')`)
    assert.deepEqual(
      await evaluate(
        `Array.from(document.querySelectorAll('${navItem('menu')} [data-nav]')).map((el) => el.dataset.nav)`
      ).then((items) => items.filter((item) => MORE_ORDER.includes(item))),
      MORE_ORDER
    )
    await evaluate(
      `document.querySelector('${navItem('more')}').dispatchEvent(new MouseEvent('mouseout', {bubbles: true, relatedTarget: document.body}))`
    )
    await waitFor(`!document.querySelector('${navItem('menu')}')`)

    // 更多 → 筛选 shows the former toolbar as a panel.
    await clickMoreItem(evaluate, waitFor, 'filters')
    await waitFor(`document.querySelector('.filter-panel')`)
    await evaluate(`document.querySelector('.filter-panel__close').click()`)
    await waitFor(`!document.querySelector('.filter-panel')`)

    // 更多 → 番号 / 显示 / 下载 / 设置 each open their dialog.
    for (const tool of ['codes', 'display', 'download', 'settings']) {
      await load()
      await clickMoreItem(evaluate, waitFor, tool)
      await waitFor(MODAL)
    }

    // Section links keep switching JAV tabs.
    await load()
    for (const tab of ['list', 'idol', 'studio', 'series']) {
      await clickNavItem(evaluate, waitFor, tab)
      await waitFor(
        `window.testStore.getState().viewMode === 'jav' && window.testStore.getState().javTab === '${tab}'`
      )
    }
    await clickNavItem(evaluate, waitFor, 'video')
    await waitFor(`window.testStore.getState().viewMode === 'video'`)

    // 标签 still opens the tag manager.
    await clickNavItem(evaluate, waitFor, 'tags')
    await waitFor(MODAL)

    // A selection is surfaced on "更多" and its actions live in the 筛选 panel.
    await load()
    await evaluate(`{
      const state = window.testStore.getState();
      state.toggleSelectVideo({ location_id: 1, id: 1, filename: 'clip-1.mp4' });
    }`)
    await waitFor(`document.querySelector('header.app-topnav .app-topnav__dot')`)
    await openFilterPanel(evaluate, waitFor)
    await waitFor(`document.querySelector('.filter-panel button.topbar-selection-action') !== null`)

    assert.deepEqual(await evaluate('window.appErrors'), [])
  }
)
