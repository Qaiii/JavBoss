import JavCroppedCover from '@/components/JavCroppedCover'
import JavOrientedCover from '@/components/JavOrientedCover'
import { javCoverAspectClass, javCoverIsPortrait } from '@/utils/javCover'

export default function JavDisplayCover({
  src,
  alt,
  orientation,
  cropLeft,
  className = '',
  imageClassName,
  fallback = null,
  referrerPolicy,
  onDisplayChange,
  children,
}) {
  if (javCoverIsPortrait(orientation)) {
    return (
      <div className={`relative ${className}`}>
        <JavCroppedCover
          src={src}
          alt={alt}
          cropLeft={cropLeft}
          imageClassName={imageClassName}
          fallback={fallback}
          referrerPolicy={referrerPolicy}
          onDisplayChange={onDisplayChange}
        />
        {children}
      </div>
    )
  }

  return (
    <div
      className={`relative w-full overflow-hidden ${javCoverAspectClass('landscape')} ${className}`}
    >
      <JavOrientedCover
        src={src}
        alt={alt}
        imageClassName={imageClassName}
        fallback={fallback}
        referrerPolicy={referrerPolicy}
        onDisplayChange={onDisplayChange}
      />
      {children}
    </div>
  )
}
