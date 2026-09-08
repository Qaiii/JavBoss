export const PIP_DEFAULT_WIDTH = 420
export const PIP_MARGIN = 12
export const PIP_CONTROLS_HEIGHT = 88

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
  const height = Math.round(width / ar) + PIP_CONTROLS_HEIGHT
  return {
    width,
    height: Math.min(Math.max(height, 240), 800),
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
