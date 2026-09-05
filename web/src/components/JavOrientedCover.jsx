import { useEffect, useState } from 'react'

export default function JavOrientedCover({
  src,
  alt,
  className = '',
  imageClassName = 'object-contain object-top',
  fallback = null,
  referrerPolicy,
  onDisplayChange,
}) {
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setFailed(false)
    setReady(false)
  }, [src])

  useEffect(() => {
    onDisplayChange?.(Boolean(src) && ready && !failed)
  }, [src, ready, failed, onDisplayChange])

  if (!src || failed) {
    return fallback
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 h-full w-full ${imageClassName} ${ready ? '' : 'opacity-0'} ${className}`}
      loading="lazy"
      referrerPolicy={referrerPolicy}
      onLoad={() => setReady(true)}
      onError={() => setFailed(true)}
    />
  )
}
