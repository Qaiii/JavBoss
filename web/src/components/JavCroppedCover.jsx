import { useEffect, useRef, useState } from 'react'

import {
  IDOL_COVER_DEFAULT_CROP_LEFT,
  IDOL_COVER_VISIBLE_RATIO,
  normalizeIdolCoverCropLeft,
} from '@/components/JavIdolCoverModal'

const COVER_SOURCE_WIDTH = 800
const COVER_SOURCE_HEIGHT = 538

export function getJavCroppedCoverLayoutProps() {
  const visibleRatio = Math.min(Math.max(IDOL_COVER_VISIBLE_RATIO, 0.01), 1)
  const coverAspectPercent = (COVER_SOURCE_HEIGHT / (COVER_SOURCE_WIDTH * visibleRatio)) * 100
  return { coverAspectPercent }
}

function calculateCoverLeft({ cropLeft, frameWidth, renderedWidth }) {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return 0
  if (!Number.isFinite(renderedWidth) || renderedWidth <= 0) return 0
  if (renderedWidth <= frameWidth) {
    return (frameWidth - renderedWidth) / 2
  }
  const maxOffset = renderedWidth - frameWidth
  return -Math.min(Math.max(cropLeft * renderedWidth, 0), maxOffset)
}

export default function JavCroppedCover({
  src,
  alt,
  cropLeft,
  className = '',
  imageClassName = '',
  fallback = null,
  referrerPolicy,
  onDisplayChange,
}) {
  const { coverAspectPercent } = getJavCroppedCoverLayoutProps()
  const normalizedCropLeft = normalizeIdolCoverCropLeft(cropLeft ?? IDOL_COVER_DEFAULT_CROP_LEFT)
  const coverFrameRef = useRef(null)
  const [coverFrame, setCoverFrame] = useState({ width: 0, height: 0 })
  const [coverImageSize, setCoverImageSize] = useState(null)
  const [failed, setFailed] = useState(false)

  const hasCoverImageSize =
    coverImageSize?.src === src &&
    Number.isFinite(coverImageSize.width) &&
    Number.isFinite(coverImageSize.height) &&
    coverImageSize.width > 0 &&
    coverImageSize.height > 0
  const hasMeasuredCoverFrame = coverFrame.width > 0 && coverFrame.height > 0
  const ready = Boolean(src) && !failed && hasCoverImageSize && hasMeasuredCoverFrame
  const renderedCoverWidth = ready
    ? coverFrame.height * (coverImageSize.width / coverImageSize.height)
    : 0
  const coverOffset = calculateCoverLeft({
    cropLeft: normalizedCropLeft,
    frameWidth: coverFrame.width,
    renderedWidth: renderedCoverWidth,
  })

  useEffect(() => {
    setCoverImageSize(null)
    setFailed(false)
    if (!src) return undefined

    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setCoverImageSize({ src, width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (cancelled) return
      setFailed(true)
      setCoverImageSize(null)
    }
    img.referrerPolicy = referrerPolicy || ''
    img.src = src
    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [src, referrerPolicy])

  useEffect(() => {
    const node = coverFrameRef.current
    if (!node) return undefined

    const updateFrame = () => {
      const rect = node.getBoundingClientRect()
      setCoverFrame({ width: rect.width, height: rect.height })
    }
    updateFrame()

    if (!window.ResizeObserver) {
      window.addEventListener('resize', updateFrame)
      return () => window.removeEventListener('resize', updateFrame)
    }
    const observer = new window.ResizeObserver(updateFrame)
    observer.observe(node)
    return () => observer.disconnect()
  }, [src])

  useEffect(() => {
    onDisplayChange?.(ready)
  }, [ready, onDisplayChange])

  return (
    <div
      ref={coverFrameRef}
      className={`relative w-full overflow-hidden bg-gray-100 ${className}`}
      style={{ paddingTop: `${coverAspectPercent}%` }}
    >
      {ready ? (
        <img
          src={src}
          alt={alt}
          className={`absolute top-0 h-full max-w-none select-none ${imageClassName}`}
          style={{
            left: `${coverOffset}px`,
            width: 'auto',
          }}
          draggable={false}
          referrerPolicy={referrerPolicy}
        />
      ) : (
        fallback
      )}
    </div>
  )
}
