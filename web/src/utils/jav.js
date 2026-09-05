import { zh } from '@/utils/i18n'
import { resolveJavDisplayTitle } from '@/utils/javTitle'

export {
  isUnimportedJav,
  javCardExternalSourceKeys,
  javExternalSourceKey,
} from '@/utils/javLibrary'
export {
  JAV_COVER_ORIENTATION_LANDSCAPE,
  JAV_COVER_ORIENTATION_PORTRAIT,
  javCoverAspectClass,
  javCoverGridMinmax,
  javCardCoverSrc,
  javCoverSrc,
  normalizeJavCoverOrientation,
} from '@/utils/javCover'
export { javTitlePrefersChinese, normalizeJavTitleLanguage } from '@/utils/javTitle'

export function getJavDisplayTitle(item, preferChinese = false) {
  return resolveJavDisplayTitle(item, preferChinese, zh('未知标题', 'Untitled'))
}
