import { useEffect, useMemo, useRef, useState } from 'react'
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded'
import { fetchJavIdolPreview } from '@/api'
import JavIdolPosterModal from '@/features/jav/components/JavIdolPosterModal'
import { javCoverSrc } from '@/utils/jav'
import { getIdolDisplayNames } from '@/utils/javIdol'
import { zh } from '@/utils/i18n'
import { DEFAULT_IDOL_HERO_BACKGROUND, sampleIdolHeroBackground } from '@/utils/idolHeroBackground'
import {
  idolPosterImageKey,
  idolPosterImageSrc,
  normalizeIdolPosterImages,
} from '@/utils/idolPoster'
import { useStore } from '@/store'

const DEFAULT_TOPBAR_HEIGHT = 72
const DEFAULT_POSTER_ASPECT = 3 / 2
const MIN_POSTER_ASPECT = 0.4
const MAX_POSTER_ASPECT = 4

function configFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

function readTopbarHeight() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return DEFAULT_TOPBAR_HEIGHT
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOPBAR_HEIGHT
}

function clampPosterAspect(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_POSTER_ASPECT
  return Math.min(MAX_POSTER_ASPECT, Math.max(MIN_POSTER_ASPECT, ratio))
}

export default function JavIdolHero({ idolId }) {
  const preferChineseName = useStore((state) =>
    configFlag(state.config?.jav_idol_prefer_chinese_name)
  )
  const [idol, setIdol] = useState(null)
  const [posterOpen, setPosterOpen] = useState(false)
  const [scrollPast, setScrollPast] = useState(0)
  const [posterAspect, setPosterAspect] = useState(DEFAULT_POSTER_ASPECT)
  const [heroBackground, setHeroBackground] = useState(DEFAULT_IDOL_HERO_BACKGROUND)
  // Margin that lands the info block's bottom edge on the poster's bottom edge. Only
  // needed while the poster is shorter than the first screen (tall viewport).
  const [headBottomMargin, setHeadBottomMargin] = useState(null)
  const posterRef = useRef(null)
  const headRef = useRef(null)

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

  // 0 while the first screen is still in view, 1 once it has been scrolled past.
  // The poster only picks up blur and its tiny shrink after that point.
  useEffect(() => {
    const update = () => {
      const firstScreen = Math.max(1, window.innerHeight - readTopbarHeight())
      const next = Math.min(1, Math.max(0, window.scrollY / firstScreen))
      // Quantised so a scroll gesture does not re-render the hero on every frame.
      setScrollPast((current) => (Math.abs(current - next) < 0.005 ? current : next))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  // Align the info block's bottom edge with the poster's bottom edge whenever the poster
  // is shorter than the first screen (tall viewport). Measured instead of derived: the
  // poster height depends on its own image ratio. Falls back to the width-based position.
  useEffect(() => {
    const measure = () => {
      const poster = posterRef.current
      const head = headRef.current
      if (!poster || !head) return
      const topbarHeight = readTopbarHeight()
      const firstScreen = Math.max(1, window.innerHeight - topbarHeight)
      const posterHeight = poster.offsetHeight
      const headHeight = head.offsetHeight
      if (!(posterHeight > 0) || !(headHeight > 0) || posterHeight >= firstScreen - 1) {
        setHeadBottomMargin(null)
        return
      }
      const next = Math.round(topbarHeight + posterHeight - headHeight - window.innerHeight)
      setHeadBottomMargin((current) => (current === next ? current : next))
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    if (observer) {
      if (posterRef.current) observer.observe(posterRef.current)
      if (headRef.current) observer.observe(headRef.current)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [numericId])

  const posterImages = useMemo(
    () => normalizeIdolPosterImages(idol?.poster_images),
    [idol?.poster_images]
  )
  const { primaryName, secondaryName } = getIdolDisplayNames(idol, preferChineseName)
  const metaItems = useMemo(() => buildIdolMetaItems(idol), [idol])
  const coverSrc = javCoverSrc(idol?.cover_code)
  const posterSource = useMemo(() => {
    if (posterImages.length > 0) return idolPosterImageSrc(numericId, posterImages[0])
    return coverSrc
  }, [posterImages, numericId, coverSrc])

  useEffect(() => {
    let cancelled = false
    setHeroBackground(DEFAULT_IDOL_HERO_BACKGROUND)
    if (!posterSource) return undefined
    sampleIdolHeroBackground(posterSource)
      .then((color) => {
        if (!cancelled && color) setHeroBackground(color)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [posterSource])

  if (!Number.isFinite(numericId) || numericId <= 0) return null

  const customProperties = {
    '--idol-hero-past': String(scrollPast),
    '--idol-hero-bg': heroBackground,
  }
  const headProperties =
    headBottomMargin == null
      ? customProperties
      : { ...customProperties, '--idol-head-margin-portrait': `${headBottomMargin}px` }

  return (
    <>
      <section className="idol-hero" style={customProperties} aria-hidden="true">
        <div className="idol-hero__poster" ref={posterRef}>
          {posterImages.length > 0 ? (
            <div
              className={`idol-hero__collage idol-hero__collage--${Math.min(posterImages.length, 6)}`}
              style={{ '--idol-hero-poster-aspect': String(posterAspect) }}
            >
              {posterImages.map((image, index) => {
                const src = idolPosterImageSrc(numericId, image)
                return (
                  <img
                    key={idolPosterImageKey(image)}
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                    onLoad={(event) => {
                      if (index !== 0) return
                      const { naturalWidth, naturalHeight } = event.currentTarget
                      if (!(naturalWidth > 0) || !(naturalHeight > 0)) return
                      const ratio = clampPosterAspect(naturalWidth / naturalHeight)
                      setPosterAspect((current) => (current === ratio ? current : ratio))
                    }}
                  />
                )
              })}
            </div>
          ) : coverSrc ? (
            <img className="idol-hero__cover" src={coverSrc} alt="" />
          ) : (
            <div className="idol-hero__fallback">{primaryName}</div>
          )}
        </div>
        <div className="idol-hero__veil" />
      </section>
      {/* Line 1: idol name. Line 2: idol info laid out horizontally. */}
      <header className="idol-profile-head" style={headProperties} ref={headRef}>
        <div className="idol-profile-head__scrim" aria-hidden="true" />
        <div className="idol-profile-head__body">
          <h1 className="idol-profile-head__name text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {primaryName || zh('未知女优', 'Unknown idol')}
            {secondaryName ? <span className="idol-profile-head__alt">{secondaryName}</span> : null}
          </h1>
          <div className="idol-profile-head__row">
            {metaItems.length > 0 ? (
              <dl className="idol-profile-head__meta">
                {metaItems.map((item) => (
                  <div key={item.key} className="idol-profile-head__meta-item">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <button
              type="button"
              className="idol-profile-head__edit"
              onClick={() => setPosterOpen(true)}
            >
              <PhotoCameraRoundedIcon sx={{ fontSize: 16 }} />
              {zh('编辑海报', 'Edit poster')}
            </button>
          </div>
        </div>
      </header>
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
