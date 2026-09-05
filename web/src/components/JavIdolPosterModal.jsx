import { useEffect, useMemo, useRef, useState } from 'react'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import { fetchJavIdolPosterOptions, updateJavIdolPoster, uploadJavIdolPoster } from '@/api'
import AppModal from '@/components/AppModal'
import { getErrorMessage } from '@/utils/errors'
import { zh } from '@/utils/i18n'
import { getJavDisplayTitle, javTitlePrefersChinese } from '@/utils/jav'
import { getIdolDisplayName } from '@/utils/javIdol'
import {
  IDOL_POSTER_KIND_SCREENSHOT,
  IDOL_POSTER_KIND_UPLOAD,
  IDOL_POSTER_MAX_IMAGES,
  idolPosterImageKey,
  idolPosterImageSrc,
  normalizeIdolPosterImages,
} from '@/utils/idolPoster'
import { useStore } from '@/store'

export default function JavIdolPosterModal({
  open,
  item,
  preferChineseName = false,
  onClose,
  onSaved,
}) {
  const fileRef = useRef(null)
  const preferChineseTitle = useStore((state) => javTitlePrefersChinese(state.config))
  const [works, setWorks] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const idolId = Number(item?.id)

  useEffect(() => {
    if (!open || !Number.isFinite(idolId) || idolId <= 0) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    setWorks([])
    setSelected(normalizeIdolPosterImages(item?.poster_images))
    fetchJavIdolPosterOptions(idolId)
      .then((items) => {
        if (!cancelled) setWorks(Array.isArray(items) ? items : [])
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [idolId, item?.poster_images, open])

  const selectedKeys = useMemo(
    () => new Set(selected.map((image) => idolPosterImageKey(image)).filter(Boolean)),
    [selected]
  )

  const toggleImage = (image) => {
    const key = idolPosterImageKey(image)
    if (!key) return
    setSelected((current) => {
      const exists = current.some((item) => idolPosterImageKey(item) === key)
      if (exists) {
        return current.filter((item) => idolPosterImageKey(item) !== key)
      }
      if (current.length >= IDOL_POSTER_MAX_IMAGES) {
        setError(
          zh(
            `最多选择 ${IDOL_POSTER_MAX_IMAGES} 张`,
            `Select up to ${IDOL_POSTER_MAX_IMAGES} images`
          )
        )
        return current
      }
      setError('')
      return [...current, image]
    })
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !Number.isFinite(idolId) || idolId <= 0 || uploading) return
    if (selected.length >= IDOL_POSTER_MAX_IMAGES) {
      setError(
        zh(`最多选择 ${IDOL_POSTER_MAX_IMAGES} 张`, `Select up to ${IDOL_POSTER_MAX_IMAGES} images`)
      )
      return
    }
    setUploading(true)
    setError('')
    try {
      const uploaded = await uploadJavIdolPoster(idolId, file)
      const image = {
        kind: IDOL_POSTER_KIND_UPLOAD,
        name: uploaded?.name,
        url: uploaded?.url,
      }
      setSelected((current) => {
        const key = idolPosterImageKey(image)
        if (!key || current.some((item) => idolPosterImageKey(item) === key)) return current
        return [...current, image]
      })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!Number.isFinite(idolId) || idolId <= 0 || saving) return
    setSaving(true)
    setError('')
    try {
      const updated = await updateJavIdolPoster(idolId, selected)
      onSaved?.(updated)
      onClose?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <AppModal
      ariaLabel={zh('女优海报', 'Idol poster')}
      className="px-4 py-6"
      closeDisabled={saving || uploading}
      contentClassName="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
      onClose={onClose}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-950">
            {getIdolDisplayName(item, preferChineseName)}
          </div>
          <div className="text-xs text-slate-500">
            {zh(
              `海报（已选 ${selected.length}/${IDOL_POSTER_MAX_IMAGES}）`,
              `Poster (${selected.length}/${IDOL_POSTER_MAX_IMAGES} selected)`
            )}
          </div>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          onClick={onClose}
          aria-label={zh('关闭', 'Close')}
        >
          <CloseOutlinedIcon sx={{ fontSize: 18 }} />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="min-h-[12rem] overflow-y-auto border-b border-slate-200 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">
              {zh('已选图片', 'Selected')}
            </span>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={() => setSelected([])}
            >
              {zh('清空', 'Clear')}
            </button>
          </div>
          {selected.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-500">
              {zh('尚未选择海报图片', 'No poster images selected')}
            </div>
          ) : (
            selected.map((image) => {
              const key = idolPosterImageKey(image)
              const src = idolPosterImageSrc(idolId, image)
              return (
                <button
                  key={key}
                  type="button"
                  className="flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => toggleImage(image)}
                >
                  {src ? (
                    <img src={src} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-12 w-16 shrink-0 rounded bg-slate-100" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                    {image.kind === IDOL_POSTER_KIND_UPLOAD
                      ? zh('自定义图片', 'Custom image')
                      : image.name}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">
              {zh(
                '从作品截图中选择，或上传自定义图片',
                'Pick screenshots or upload a custom image'
              )}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={uploading || saving}
              onClick={() => fileRef.current?.click()}
            >
              <CloudUploadOutlinedIcon sx={{ fontSize: 17 }} />
              {uploading ? zh('上传中…', 'Uploading...') : zh('上传图片', 'Upload image')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
          </div>
          {loading ? (
            <div className="text-sm text-slate-500">{zh('加载中…', 'Loading...')}</div>
          ) : works.length === 0 ? (
            <div className="text-sm text-slate-500">
              {zh('暂无可用截图', 'No screenshots available')}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {works.map((work) => {
                const title = getJavDisplayTitle(work, preferChineseTitle)
                return (
                  <section key={work.jav_id || work.code}>
                    <div className="mb-2 min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {work.code}
                      </div>
                      {title && title !== work.code ? (
                        <div className="truncate text-xs text-slate-500">{title}</div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {(work.videos || []).flatMap((video) =>
                        (video.screenshots || []).map((shot) => {
                          const image = {
                            kind: IDOL_POSTER_KIND_SCREENSHOT,
                            video_id: Number(video.video_id || shot.video_id),
                            name: shot.name,
                            url: shot.url,
                          }
                          const key = idolPosterImageKey(image)
                          const active = selectedKeys.has(key)
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`relative overflow-hidden rounded border ${
                                active
                                  ? 'border-slate-900 ring-2 ring-slate-900'
                                  : 'border-slate-200'
                              }`}
                              onClick={() => toggleImage(image)}
                            >
                              <img
                                src={shot.url || idolPosterImageSrc(idolId, image)}
                                alt={shot.name}
                                className="aspect-video w-full object-cover"
                              />
                              {active ? (
                                <span className="absolute right-1 top-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">
                                  {zh('已选', 'Selected')}
                                </span>
                              ) : null}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
          {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          onClick={onClose}
        >
          {zh('取消', 'Cancel')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || loading}
          onClick={handleSave}
        >
          <SaveRoundedIcon sx={{ fontSize: 17 }} />
          {saving ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
        </button>
      </div>
    </AppModal>
  )
}
