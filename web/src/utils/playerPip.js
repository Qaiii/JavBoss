export const PIP_DEFAULT_WIDTH = 420
export const PIP_MARGIN = 12

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
