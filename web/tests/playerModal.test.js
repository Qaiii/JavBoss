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
  assert.match(player, /startBrowserPlayback/)
  assert.match(player, /@\/utils\/browserPlayback/)
  assert.match(player, /kind === 'hls'/)
})

test('player title bar uses filename plus jav title', () => {
  assert.match(player, /getPlayerDisplayName\(video, preferChineseTitle\)/)
  assert.doesNotMatch(player, /getVideoDisplayName\(/)
})

test('seek bar keeps a click guard above the visual track', () => {
  assert.match(
    player,
    /player-seek group\/seek relative cursor-pointer touch-none pt-4 pointer-coarse:pt-6/
  )
  assert.match(player, /<div className="relative h-5 w-full">/)
})

test('player seek and volume handles stay circular and visible', () => {
  const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.match(player, /player-seek-handle[\s\S]*rounded-full/)
  assert.match(player, /player-volume-slider/)
  assert.doesNotMatch(player, /group-hover\/seek:opacity-100/)
  assert.match(css, /\.player-volume-slider::-webkit-slider-thumb\s*\{[^}]*border-radius:\s*50%/)
})

test('player volume slider is visible without hovering', () => {
  assert.match(player, /w-24 pointer-coarse:w-16/)
  assert.doesNotMatch(player, /group-hover\/vol/)
  assert.doesNotMatch(player, /group\/vol/)
})

test('player hotkeys do not show or hide the control bar', () => {
  const configured = player.match(
    /if \(\s*configured &&[\s\S]*?configured\.action === PLAYER_HOTKEY_ACTIONS\.SCREENSHOT[\s\S]*?return/
  )
  assert.ok(configured, 'expected configured hotkey handler')
  assert.doesNotMatch(configured[0], /pokeControls/)

  const arrows = player.match(/case 'ArrowLeft':[\s\S]*?break/)
  assert.ok(arrows, 'expected arrow-key handler')
  assert.doesNotMatch(arrows[0], /pokeControls/)
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
