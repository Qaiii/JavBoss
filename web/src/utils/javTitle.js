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

export function resolveJavMetadataTitle(item, preferChinese = false) {
  const original = String(item?.title || '').trim()
  const chinese = String(item?.title_zh || '').trim()
  return preferChinese ? chinese || original : original || chinese
}

export function resolveJavDisplayTitle(item, preferChinese, fallback) {
  const code = item?.code?.trim()
  return resolveJavMetadataTitle(item, preferChinese) || code || fallback
}
