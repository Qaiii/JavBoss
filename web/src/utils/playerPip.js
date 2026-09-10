export const PIP_DEFAULT_WIDTH = 420
export const PIP_MIN_WIDTH = 280
export const PIP_MAX_WIDTH = 1280
export const PIP_MARGIN = 12
export const PIP_CONTROLS_HEIGHT = 88
export const PIP_SIZE_STORAGE_KEY = 'javboss.player.pipSize'

export function clampPipWidth(width, maxWidth = PIP_MAX_WIDTH) {
  const cap = Math.max(PIP_MIN_WIDTH, Number(maxWidth) || PIP_MAX_WIDTH)
  const next = Math.round(Number(width) || PIP_DEFAULT_WIDTH)
  return Math.min(Math.max(PIP_MIN_WIDTH, next), cap)
}

// Document PiP is a separate OS window: the current innerWidth is the start
// size, not the max. Cap to PIP_MAX_WIDTH (and the screen if smaller).
// Inline PiP stays inside the page, so the page viewport remains the max.
export function pipResizeMaxWidth(kind, viewportWidth, screenWidth) {
  if (kind === 'document') {
    const screenCap = Math.round(Number(screenWidth) || 0)
    if (screenCap > 0) {
      return Math.min(PIP_MAX_WIDTH, Math.max(PIP_MIN_WIDTH, screenCap))
    }
    return PIP_MAX_WIDTH
  }
  const view = Math.round(Number(viewportWidth) || 0)
  if (view > 0) {
    return Math.max(PIP_MIN_WIDTH, view)
  }
  return PIP_MAX_WIDTH
}

export function loadStoredPipSize() {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(PIP_SIZE_STORAGE_KEY) || 'null')
    const width = Number(parsed?.width)
    if (!Number.isFinite(width) || width <= 0) return null
    return { width: clampPipWidth(width) }
  } catch {
    return null
  }
}

export function saveStoredPipSize(size) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      PIP_SIZE_STORAGE_KEY,
      JSON.stringify({ width: clampPipWidth(size?.width) })
    )
  } catch {
    // 忽略配额或隐私模式
  }
}

export function clampPipPosition(
  left,
  top,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = PIP_MARGIN
) {
  const safeWidth = Math.max(1, Number(width) || 0)
  const safeHeight = Math.max(1, Number(height) || 0)
  const viewW = Math.max(0, Number(viewportWidth) || 0)
  const viewH = Math.max(0, Number(viewportHeight) || 0)
  const maxLeft = Math.max(margin, viewW - safeWidth - margin)
  const maxTop = Math.max(margin, viewH - safeHeight - margin)
  return {
    left: Math.min(Math.max(margin, Number(left) || 0), maxLeft),
    top: Math.min(Math.max(margin, Number(top) || 0), maxTop),
  }
}

export function getDocumentPipWindowSize(aspectRatio, width = PIP_DEFAULT_WIDTH) {
  const ar = Number(aspectRatio) > 0 ? Number(aspectRatio) : 16 / 9
  const nextWidth = clampPipWidth(width)
  const height = Math.round(nextWidth / ar) + PIP_CONTROLS_HEIGHT
  return {
    width: nextWidth,
    height: Math.min(Math.max(height, 200), 1600),
  }
}

export function resizeDocumentPipWindow(pipWindow, width, height) {
  if (!pipWindow || typeof pipWindow.resizeTo !== 'function') return false
  const innerW = Number(pipWindow.innerWidth) || width
  const innerH = Number(pipWindow.innerHeight) || height
  const chromeW = Math.max(0, (Number(pipWindow.outerWidth) || innerW) - innerW)
  const chromeH = Math.max(0, (Number(pipWindow.outerHeight) || innerH) - innerH)
  try {
    pipWindow.resizeTo(Math.round(width + chromeW), Math.round(height + chromeH))
    return true
  } catch {
    return false
  }
}

export function isDocumentPictureInPictureSupported() {
  return Boolean(typeof window !== 'undefined' && window.documentPictureInPicture?.requestWindow)
}

export function isVideoPictureInPictureSupported(videoEl) {
  return Boolean(
    typeof document !== 'undefined' &&
      document.pictureInPictureEnabled &&
      videoEl &&
      typeof videoEl.requestPictureInPicture === 'function'
  )
}

export function copyStylesToDocument(targetDoc) {
  if (!targetDoc?.head || typeof document === 'undefined') return
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    if (node.tagName === 'LINK') {
      const link = targetDoc.createElement('link')
      link.rel = 'stylesheet'
      link.href = node.href
      if (node.media) link.media = node.media
      targetDoc.head.appendChild(link)
      return
    }
    targetDoc.head.appendChild(node.cloneNode(true))
  })
}

export function applyPipWindowBaseStyles(targetDoc, { title } = {}) {
  if (!targetDoc) return
  if (typeof document !== 'undefined' && document.documentElement?.lang) {
    targetDoc.documentElement.lang = document.documentElement.lang
  }
  targetDoc.documentElement.style.height = '100%'
  if (title) targetDoc.title = title
  targetDoc.body.style.cssText = 'margin:0;width:100%;height:100%;background:#000;overflow:hidden;'
  targetDoc.body.classList.add('document-pip-body')
}
