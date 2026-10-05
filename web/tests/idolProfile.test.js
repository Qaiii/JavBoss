import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('idol works sit below the hero instead of overlapping the first screen', () => {
  assert.match(
    css,
    /\.idol-profile-works-inner\s*\{[^}]*min-height:\s*calc\(100dvh - var\(--topbar-height\)\)/s
  )
  assert.doesNotMatch(css, /\.idol-profile-works\s*\{[^}]*margin-top:\s*calc\(0px - \(100dvh/s)
  assert.doesNotMatch(css, /\.idol-profile-works\s*\{[^}]*padding-top:\s*calc\(100dvh/s)
})

test('idol works cards drop the default grid border', () => {
  assert.match(css, /\.idol-profile-works-inner \.grid > \*\s*\{[^}]*border-width:\s*0/s)
})

test('idol hero poster stays larger than the hero while shrinking', () => {
  assert.match(css, /\.idol-hero__poster\s*\{[^}]*inset:\s*-3%/s)
  assert.match(
    css,
    /\.idol-hero__poster\s*\{[^}]*transform:\s*scale\(calc\(1 - var\(--idol-hero-scroll,\s*0\) \* 0\.05\)\)/s
  )
})

// Upstream's navigation stack replaced the fork's `HISTORY_SCROLL_KEY: { x: 0, y: 0 }`
// reset: section navigation now scrolls the new page to the top, and history
// restoration clamps to the recorded position.
test('navigation keeps pages anchored at a sane scroll position', () => {
  const sectionNav = fs.readFileSync(
    new URL('../src/navigation/useSectionNavigation.js', import.meta.url),
    'utf8'
  )
  const history = fs.readFileSync(
    new URL('../src/navigation/useBrowserHistory.js', import.meta.url),
    'utf8'
  )
  assert.match(sectionNav, /window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*'smooth'\s*\}\)/)
  assert.match(
    history,
    /window\.scrollTo\(\{\s*left:\s*targetX,\s*top:\s*nextY,\s*behavior:\s*'auto'\s*\}\)/
  )
})
