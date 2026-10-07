// Helpers for driving the persistent top navigation bar (web/src/app/layout/TopNav.jsx).
// Nav elements expose stable data-nav hooks so the tests do not depend on locale labels.
const ROOT = 'header.app-topnav'

export const navItem = (name) => `${ROOT} [data-nav="${name}"]`

export async function clickNavItem(evaluate, waitFor, name) {
  await waitFor(`document.querySelector('${navItem(name)}')`)
  await evaluate(`document.querySelector('${navItem(name)}').click()`)
}

/** Opens the "更多" dropdown and clicks one of its entries (codes/display/download/settings/filters). */
export async function clickMoreItem(evaluate, waitFor, name) {
  await clickNavItem(evaluate, waitFor, 'more')
  await waitFor(`document.querySelector('${navItem(name)}')`)
  await evaluate(`document.querySelector('${navItem(name)}').click()`)
  await waitFor(`!document.querySelector('${navItem('menu')}')`)
}

/** Opens "更多 → 筛选" and waits for the filter panel. */
export async function openFilterPanel(evaluate, waitFor) {
  await clickMoreItem(evaluate, waitFor, 'filters')
  await waitFor(`document.querySelector('.filter-panel')`)
}

/** Expands the collapsed search field and types a query into it. */
export async function enterNavSearch(evaluate, waitFor, value) {
  await clickNavItem(evaluate, waitFor, 'search')
  await waitFor(`document.querySelector('.app-topnav__search-form input')`)
  await evaluate(`{
    const input = document.querySelector('.app-topnav__search-form input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }`)
}

/** Submits the currently expanded search field. */
export async function submitNavSearch(evaluate) {
  await evaluate(`document.querySelector('.app-topnav__search-form').requestSubmit()`)
}
