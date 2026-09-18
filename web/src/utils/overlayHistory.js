export const OVERLAY_HISTORY_KEY = '__javbossOverlay'

const getHistoryUserState = (state) =>
  state?.usr && typeof state.usr === 'object' ? state.usr : {}

export function isOverlayHistoryState(state) {
  const current =
    state === undefined ? (typeof window === 'undefined' ? null : window.history?.state) : state
  if (!current || typeof current !== 'object') return false
  return Boolean(current[OVERLAY_HISTORY_KEY] ?? getHistoryUserState(current)[OVERLAY_HISTORY_KEY])
}

export function withOverlayHistoryState(state, enabled = true) {
  const entries = { [OVERLAY_HISTORY_KEY]: enabled }
  return {
    ...(state || {}),
    ...entries,
    usr: {
      ...getHistoryUserState(state),
      ...entries,
    },
  }
}

const currentLocationUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`

export function pushOverlayHistory() {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') {
    return false
  }
  if (isOverlayHistoryState()) return false
  try {
    window.history.pushState(
      withOverlayHistoryState(window.history.state, true),
      '',
      currentLocationUrl()
    )
    return true
  } catch {
    return false
  }
}

export function popOverlayHistory() {
  if (typeof window === 'undefined' || typeof window.history?.back !== 'function') {
    return false
  }
  if (!isOverlayHistoryState()) return false
  window.history.back()
  return true
}
