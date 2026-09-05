export function javTitlePrefersChinese(config) {
  return (
    String(config?.jav_title_language || '')
      .trim()
      .toLowerCase() === 'chinese'
  )
}

export function normalizeJavTitleLanguage(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'chinese'
    ? 'chinese'
    : 'original'
}

export function resolveJavDisplayTitle(item, preferChinese, fallback) {
  const code = item?.code?.trim()
  const original = String(item?.title || '').trim()
  const chinese = String(item?.title_zh || '').trim()
  const title = preferChinese ? chinese || original : original || chinese
  return title || code || fallback
}
