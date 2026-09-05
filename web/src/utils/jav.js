import { zh } from '@/utils/i18n'

export { isUnimportedJav, javCardExternalSourceKeys } from '@/utils/javLibrary'
export {
  JAV_COVER_ORIENTATION_LANDSCAPE,
  JAV_COVER_ORIENTATION_PORTRAIT,
  javCoverAspectClass,
  javCoverGridMinmax,
  javCoverSrc,
  normalizeJavCoverOrientation,
} from '@/utils/javCover'

export function getJavDisplayTitle(item) {
  const code = item?.code?.trim()
  const title = item?.title
  return title || code || zh('未知标题', 'Untitled')
}
