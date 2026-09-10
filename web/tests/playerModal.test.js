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
  assert.match(player, /ownerDoc\.createElement\('video'\)/)
  assert.match(player, /host\.appendChild\(wrapper\)/)
  assert.match(player, /if \(host\.isConnected\) host\.replaceChildren\(\)/)
})

test('browser player prefers native HEVC and falls back to HLS on decode error', () => {
  assert.match(player, /selectPlaybackSource/)
  assert.match(player, /canPlayHEVC/)
  assert.match(player, /setForceHls\(true\)/)
  assert.match(player, /player\.on\('error', handlePlaybackError\)/)
})

test('hover show/hide listens on the player card so the title bar does not flicker', () => {
  assert.match(player, /const card = pipCardRef\.current/)
  assert.match(player, /card\.addEventListener\('mousemove', handleMouseMove\)/)
  assert.match(player, /card\.addEventListener\('mouseleave', handleMouseLeave\)/)
  assert.doesNotMatch(player, /shell\.addEventListener\('mouseleave', handleMouseLeave\)/)
  assert.match(player, /pointerOnChromeRef/)
  assert.match(player, /suppressShowUntilRef/)
  assert.match(player, /data-player-chrome/)
  assert.match(player, /isPlayerChromeTarget/)
})

test('picture-in-picture prefers a system window that can leave the page', () => {
  assert.match(player, /createPortal/)
  assert.match(player, /documentPictureInPicture/)
  assert.match(player, /requestPictureInPicture/)
  assert.match(player, /player-card--document-pip/)
})

test('picture-in-picture window can be resized from the corner handle', () => {
  assert.match(player, /handlePipResizePointerDown/)
  assert.match(player, /resizeDocumentPipWindow/)
  assert.match(player, /player-pip-resize/)
  assert.match(player, /saveStoredPipSize/)
})

test('document picture-in-picture can grow beyond the current window width while dragging', () => {
  assert.match(player, /pipResizeMaxWidth/)
  assert.doesNotMatch(
    player,
    /pipKind === 'document'\s*\?\s*documentPipWindowRef\.current\?\.innerWidth/
  )
  assert.match(player, /if \(pipKind === 'document'\) \{\s*resizeDocumentPipWindow\(/)
  assert.doesNotMatch(
    player,
    /if \(pipKind === 'document'\) \{\s*if \(persist\) \{\s*resizeDocumentPipWindow/
  )
})
