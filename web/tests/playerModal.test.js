import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const player = fs.readFileSync(
  new URL('../src/components/PlayerModal.jsx', import.meta.url),
  'utf8'
)

test('player host stays mounted while loading or error overlays show', () => {
  assert.match(player, /playerHostRef = useRef\(null\)/)
  assert.match(player, /<div ref=\{playerHostRef\} className="h-full w-full" \/>/)
  assert.match(
    player,
    /loadingPlayback \? \(\s*<div className="absolute inset-0 z-\[5\][\s\S]*playbackError \? \(\s*<div className="absolute inset-0 z-\[5\]/
  )
  assert.doesNotMatch(player, /loadingPlayback \?[\s\S]*<video[\s\S]*: \(\s*<div data-vjs-player/)
})

test('video.js media nodes are created outside React-managed children', () => {
  assert.match(player, /document\.createElement\('video'\)/)
  assert.match(player, /host\.appendChild\(wrapper\)/)
  assert.match(player, /if \(host\.isConnected\) host\.replaceChildren\(\)/)
})

test('hover show/hide listens on the player card so the title bar does not flicker', () => {
  assert.match(player, /const card = pipCardRef\.current/)
  assert.match(player, /card\.addEventListener\('mousemove', handleMouseMove\)/)
  assert.match(player, /card\.addEventListener\('mouseleave', handleMouseLeave\)/)
  assert.doesNotMatch(player, /shell\.addEventListener\('mouseleave', handleMouseLeave\)/)
})
