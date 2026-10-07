import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const hero = fs.readFileSync(
  new URL('../src/features/jav/components/JavIdolHero.jsx', import.meta.url),
  'utf8'
)

test('idol info sits above the works and pulls the first cover row into the first screen', () => {
  assert.match(
    css,
    /\.idol-profile\s*\{[^}]*--idol-hero-height:\s*calc\(100dvh - var\(--topbar-height\)\)/s
  )
  assert.match(css, /\.idol-profile\s*\{[^}]*--idol-head-top:\s*60dvh/s)
  assert.match(
    css,
    /\.idol-profile-head\s*\{[^}]*margin-top:\s*calc\(var\(--idol-head-top\) - 100dvh\)/s
  )
  // The info is the only block pulled over the poster; the works list stays in flow below it.
  assert.doesNotMatch(
    css,
    /\.idol-profile-works\s*\{[^}]*margin-top:\s*calc\(var\(--idol-head-top\)/s
  )
  assert.doesNotMatch(css, /\.idol-profile-works\s*\{[^}]*margin-top:\s*calc\(0px - \(100dvh/s)
  assert.match(
    css,
    /\.idol-profile-works-inner\s*\{[^}]*min-height:\s*calc\(100dvh - var\(--topbar-height\)\)/s
  )
})

test('idol info pins to the top-left as the page scrolls: name first, horizontal meta second', () => {
  assert.match(css, /\.idol-profile-head\s*\{[^}]*position:\s*sticky/s)
  assert.match(
    css,
    /\.idol-profile-head\s*\{[^}]*top:\s*calc\(var\(--topbar-height\) \+ 0\.6rem\)/s
  )
  assert.match(css, /\.idol-profile-head__row\s*\{[^}]*display:\s*flex/s)
  assert.match(css, /\.idol-profile-head__meta\s*\{[^}]*display:\s*flex/s)
  assert.match(css, /\.idol-profile-head__meta\s*\{[^}]*flex-wrap:\s*wrap/s)
  assert.doesNotMatch(css, /\.idol-profile-head[^{]*\{[^}]*flex-direction:\s*column/s)
  assert.ok(hero.indexOf('idol-profile-head__name') < hero.indexOf('idol-profile-head__meta'))
})

test('idol info bottom lands on the poster bottom on a tall viewport', () => {
  assert.match(css, /\.idol-profile\s*\{[^}]*--idol-head-top-portrait:\s*60vw/s)
  // Measured first (bottom-aligned with the poster), width-based fallback otherwise.
  assert.match(
    css,
    /@media \(max-aspect-ratio: 1 \/ 1\)\s*\{\s*\.idol-profile-head\s*\{\s*margin-top:\s*var\(\s*--idol-head-margin-portrait,\s*calc\(var\(--idol-head-top-portrait\) - 100dvh\)\s*\)/s
  )
  assert.match(hero, /--idol-head-margin-portrait/)
  assert.match(hero, /poster\.offsetHeight/)
  assert.match(hero, /head\.offsetHeight/)
})

test('idol works cards drop the default grid border', () => {
  assert.match(css, /\.idol-profile-works-inner \.grid > \*\s*\{[^}]*border-width:\s*0/s)
})

test('idol hero poster fills on a wide viewport and is height-clamped on a tall one', () => {
  assert.match(css, /\.idol-hero\s*\{[^}]*height:\s*var\(--idol-hero-height\)/s)
  assert.match(css, /\.idol-hero__poster\s*\{[^}]*top:\s*0/s)
  assert.match(css, /\.idol-hero__poster\s*\{[^}]*right:\s*0/s)
  assert.match(css, /\.idol-hero__poster\s*\{[^}]*justify-content:\s*flex-end/s)
  assert.match(
    css,
    /\.idol-hero__poster\s*\{[^}]*transform:\s*scale\(calc\(1 - var\(--idol-hero-past,\s*0\) \* 0\.015\)\)/s
  )
  // Portrait viewport: height in [100vw, 80vh], width proportional, cover-cropped.
  assert.match(css, /\.idol-hero__cover\s*\{[^}]*width:\s*100%/s)
  assert.match(css, /\.idol-hero__cover\s*\{[^}]*min-height:\s*100vw/s)
  assert.match(css, /\.idol-hero__cover\s*\{[^}]*max-height:\s*80vh/s)
  assert.match(css, /\.idol-hero__cover\s*\{[^}]*object-fit:\s*cover/s)
  // The fill is anchored on the top-right point, so overflow spills left/down.
  assert.match(css, /\.idol-hero__cover\s*\{[^}]*object-position:\s*right top/s)
  // No width cap on the poster media.
  assert.doesNotMatch(css, /\.idol-hero__(cover|collage|fallback)[^{]*\{[^}]*max-width:\s*80vw/s)
  assert.doesNotMatch(css, /\.idol-hero__poster\s*\{[^}]*max-width:/s)
  // Landscape / square viewport: adaptive fill of the whole hero.
  assert.match(css, /@media \(min-aspect-ratio:\s*1 \/ 1\)/)
  const landscape = css.slice(css.indexOf('@media (min-aspect-ratio: 1 / 1)'))
  assert.match(landscape, /\.idol-hero__poster\s*\{[^}]*inset:\s*-1%/s)
  assert.match(landscape, /\.idol-hero__cover,[^{]*\{[^}]*height:\s*100%/s)
  assert.match(landscape, /\.idol-hero__cover,[^{]*\{[^}]*min-height:\s*0/s)
  assert.match(landscape, /\.idol-hero__cover,[^{]*\{[^}]*aspect-ratio:\s*auto/s)
  assert.match(landscape, /\.idol-hero__cover,[^{]*\{[^}]*object-fit:\s*cover/s)
  assert.match(css, /\.idol-hero__collage\s*\{[^}]*aspect-ratio:\s*var\(--idol-hero-poster-aspect/s)
})

test('idol hero background stays crisp on the first screen and blurs only after scrolling past it', () => {
  assert.match(css, /\.idol-hero\s*\{[^}]*background:\s*var\(--idol-hero-bg,\s*#0b0f16\)/s)
  assert.match(
    css,
    /\.idol-hero__poster\s*\{[^}]*filter:\s*blur\(calc\(var\(--idol-hero-past,\s*0\) \* 18px\)\)/s
  )
  assert.match(
    css,
    /\.idol-hero__veil\s*\{[^}]*opacity:\s*calc\(var\(--idol-hero-past,\s*0\) \* 0\.32\)/s
  )
  assert.doesNotMatch(css, /\.idol-hero__blur\s*\{/)
  // The colour is sampled from the poster, with the fixed fallback as the first value.
  assert.match(hero, /sampleIdolHeroBackground\(posterSource\)/)
  assert.match(hero, /DEFAULT_IDOL_HERO_BACKGROUND/)
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
