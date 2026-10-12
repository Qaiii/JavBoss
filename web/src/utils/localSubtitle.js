// Local subtitle lists arrive pre-sorted by filename match: exact name, then
// prefix, then alphabetical. That order is the selection priority. Online
// search results are not part of this list and must not be chosen here.
export function pickDefaultLocalSubtitle(items) {
  if (!Array.isArray(items)) return null
  for (const item of items) {
    const name = String(item?.name || '').trim()
    if (!name) continue
    return { kind: 'local', name }
  }
  return null
}

// Returns the local track to enable, or null when playback should keep its
// current choice. A manual off or an existing selection (including online)
// blocks auto-enable until the caller clears that state for a new video.
export function resolveAutoLocalSubtitle(current, items, dismissed) {
  if (dismissed || current) return null
  return pickDefaultLocalSubtitle(items)
}
