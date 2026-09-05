import { useEffect, useMemo, useState } from 'react'
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded'
import { fetchJavIdolPreview } from '@/api'
import JavIdolPosterModal from '@/components/JavIdolPosterModal'
import {
  IDOL_COVER_DEFAULT_CROP_LEFT,
  IDOL_COVER_VISIBLE_RATIO,
  normalizeIdolCoverCropLeft,
} from '@/components/JavIdolCoverModal'
import { javCoverSrc } from '@/utils/jav'
import { getIdolDisplayNames } from '@/utils/javIdol'
import { zh } from '@/utils/i18n'
import {
  idolPosterImageKey,
  idolPosterImageSrc,
  normalizeIdolPosterImages,
} from '@/utils/idolPoster'
import { useStore } from '@/store'

function configFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

export default function JavIdolHero({ idolId }) {
  const preferChineseName = useStore((state) =>
    configFlag(state.config?.jav_idol_prefer_chinese_name)
  )
  const [idol, setIdol] = useState(null)
  const [posterOpen, setPosterOpen] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  const numericId = Number(idolId)

  useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setIdol(null)
      return undefined
    }
    let cancelled = false
    fetchJavIdolPreview(numericId)
      .then((item) => {
        if (!cancelled) setIdol(item)
      })
      .catch(() => {
        if (!cancelled) setIdol(null)
      })
    return () => {
      cancelled = true
    }
  }, [numericId])

  useEffect(() => {
    const update = () => {
      const heroHeight = Math.max(1, window.innerHeight - 72)
      setScrollProgress(Math.min(1, Math.max(0, window.scrollY / (heroHeight * 0.72))))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [numericId])

  const posterImages = useMemo(
    () => normalizeIdolPosterImages(idol?.poster_images),
    [idol?.poster_images]
  )
  const { primaryName, secondaryName } = getIdolDisplayNames(idol, preferChineseName)
  const metaItems = useMemo(() => buildIdolMetaItems(idol), [idol])
  const blurPx = 4 + scrollProgress * 22
  const infoOpacity = Math.max(0, 1 - scrollProgress * 1.35)
  const coverSrc = javCoverSrc(idol?.cover_code)
  const cropLeft = normalizeIdolCoverCropLeft(idol?.cover_crop_left ?? IDOL_COVER_DEFAULT_CROP_LEFT)
  const objectPosition = `${Math.min(100, Math.max(0, (cropLeft + IDOL_COVER_VISIBLE_RATIO / 2) * 100))}% center`

  if (!Number.isFinite(numericId) || numericId <= 0) return null

  return (
    <>
      <section className="idol-hero" aria-label={primaryName || zh('女优', 'Idol')}>
        <div
          className="idol-hero__poster"
          style={{ filter: `blur(${blurPx}px)`, transform: `scale(${1 + scrollProgress * 0.04})` }}
        >
          {posterImages.length > 0 ? (
            <div
              className={`idol-hero__collage idol-hero__collage--${Math.min(posterImages.length, 6)}`}
            >
              {posterImages.map((image) => {
                const src = idolPosterImageSrc(numericId, image)
                return (
                  <img
                    key={idolPosterImageKey(image)}
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )
              })}
            </div>
          ) : coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition }}
            />
          ) : (
            <div className="flex h-full w-full items-center bg-slate-900 px-10 text-4xl font-semibold text-white/80">
              {primaryName}
            </div>
          )}
        </div>
        <div className="idol-hero__shade" />
        <div className="idol-hero__info" style={{ opacity: infoOpacity }}>
          <div className="idol-hero__info-fade" />
          <div className="idol-hero__info-body">
            <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow md:text-5xl">
              {primaryName || zh('未知女优', 'Unknown idol')}
            </h1>
            {secondaryName ? (
              <div className="mt-2 text-base text-white/80">{secondaryName}</div>
            ) : null}
            {metaItems.length > 0 ? (
              <dl className="mt-5 grid max-w-sm gap-2 text-sm text-white/90">
                {metaItems.map((item) => (
                  <div key={item.key} className="flex gap-3">
                    <dt className="w-16 shrink-0 text-white/55">{item.label}</dt>
                    <dd className="min-w-0">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <button
              type="button"
              className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-white/25"
              onClick={() => setPosterOpen(true)}
            >
              <PhotoCameraRoundedIcon sx={{ fontSize: 16 }} />
              {zh('编辑海报', 'Edit poster')}
            </button>
          </div>
        </div>
      </section>
      <JavIdolPosterModal
        open={posterOpen}
        item={idol}
        preferChineseName={preferChineseName}
        onClose={() => setPosterOpen(false)}
        onSaved={(updated) => setIdol((current) => ({ ...(current || {}), ...(updated || {}) }))}
      />
    </>
  )
}

function buildIdolMetaItems(item) {
  const rows = []
  const birth = formatBirthDateWithAge(item?.birth_date)
  if (birth) rows.push({ key: 'birth', label: zh('生日', 'Born'), value: birth })
  if (typeof item?.height_cm === 'number') {
    rows.push({ key: 'height', label: zh('身高', 'Height'), value: `${item.height_cm}cm` })
  }
  const bwh = formatBwh(item)
  if (bwh) rows.push({ key: 'bwh', label: zh('三围', 'BWH'), value: bwh })
  const cup = formatCup(item?.cup)
  if (cup) rows.push({ key: 'cup', label: zh('罩杯', 'Cup'), value: cup })
  const workCount = Number(item?.work_count)
  if (Number.isFinite(workCount) && workCount > 0) {
    rows.push({
      key: 'works',
      label: zh('作品', 'Works'),
      value: zh(`${workCount} 部`, `${workCount}`),
    })
  }
  return rows
}

function formatBirthDateWithAge(value) {
  const birthDate = formatBirthDate(value)
  if (!birthDate) return ''
  const age = calculateAge(birthDate)
  if (!Number.isFinite(age) || age < 0) return birthDate
  return zh(`${birthDate}（${age}岁）`, `${birthDate} (${age})`)
}

function formatBirthDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return ''
}

function calculateAge(birthDate) {
  const date = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const monthDiff = now.getMonth() - date.getMonth()
  const dayDiff = now.getDate() - date.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  return age
}

function formatBwh(item) {
  const bust = item?.bust
  const waist = item?.waist
  const hips = item?.hips
  if (typeof bust === 'number' && typeof waist === 'number' && typeof hips === 'number') {
    return zh(`胸${bust}-腰${waist}-臀${hips}`, `B${bust}-W${waist}-H${hips}`)
  }
  return ''
}

function formatCup(value) {
  if (typeof value !== 'number' || value <= 0) return ''
  return zh(`${String.fromCharCode(64 + value)}罩杯`, `${String.fromCharCode(64 + value)} cup`)
}
