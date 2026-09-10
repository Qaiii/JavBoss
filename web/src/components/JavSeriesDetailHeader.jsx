import { useEffect, useState } from 'react'

import { fetchJavSeriesPreview, fetchJavStudioPreview, fetchJavTagPreview } from '@/api'
import { useStore } from '@/store'
import { getIdolDisplayName } from '@/utils/javIdol'
import { getJavTagDisplayName } from '@/utils/javTag'
import { zh } from '@/utils/i18n'

function configFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

const KIND_META = {
  series: {
    aria: ['系列信息', 'Series information'],
    unknown: ['未知系列', 'Unknown series'],
    fetch: fetchJavSeriesPreview,
  },
  studio: {
    aria: ['片商信息', 'Studio information'],
    unknown: ['未知片商', 'Unknown studio'],
    fetch: fetchJavStudioPreview,
  },
  tag: {
    aria: ['标签信息', 'Tag information'],
    unknown: ['未知标签', 'Unknown tag'],
    fetch: fetchJavTagPreview,
  },
}

export default function JavSeriesDetailHeader(props) {
  return <JavDetailHeader kind="series" entityId={props.seriesId} {...props} />
}

export function JavDetailHeader({
  kind = 'series',
  entityId,
  seriesId,
  fallbackName = '',
  collapseIdols = false,
  buildIdolUrl,
  onIdolClick,
}) {
  const id = Number(entityId ?? seriesId)
  const preferChineseName = useStore((state) =>
    configFlag(state.config?.jav_idol_prefer_chinese_name)
  )
  const showSimplifiedTags = useStore((state) => configFlag(state.config?.jav_tag_show_simplified))
  const [entity, setEntity] = useState(null)
  const [idolsOpen, setIdolsOpen] = useState(!collapseIdols)
  const meta = KIND_META[kind] || KIND_META.series

  useEffect(() => {
    setIdolsOpen(!collapseIdols)
  }, [collapseIdols, id])

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setEntity(null)
      return undefined
    }
    let cancelled = false
    const fetchEntity = (KIND_META[kind] || KIND_META.series).fetch
    fetchEntity(id)
      .then((item) => {
        if (!cancelled) setEntity(item)
      })
      .catch(() => {
        if (!cancelled) setEntity(null)
      })
    return () => {
      cancelled = true
    }
  }, [id, kind])

  const rawName =
    kind === 'tag'
      ? getJavTagDisplayName(entity, showSimplifiedTags)
      : String(entity?.name || '').trim()
  const name = String(rawName || fallbackName || '').trim()
  const workCount = Number(entity?.work_count)
  const idols = Array.isArray(entity?.idols) ? entity.idols : []

  if (!name && !Number.isFinite(workCount) && idols.length === 0) return null

  return (
    <section className="mb-4" aria-label={zh(meta.aria[0], meta.aria[1])}>
      <h1 className="text-xl font-semibold text-gray-900">
        {name || zh(meta.unknown[0], meta.unknown[1])}
      </h1>
      <div className="mt-1 text-sm text-gray-600">
        {zh(
          `入库 ${Number.isFinite(workCount) ? workCount : 0}`,
          `${Number.isFinite(workCount) ? workCount : 0} in library`
        )}
      </div>
      {idols.length > 0 ? (
        <div className="mt-3" aria-label={zh('女优', 'Actresses')}>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 hover:text-purple-900"
            aria-expanded={idolsOpen}
            onClick={() => setIdolsOpen((open) => !open)}
          >
            {zh(`女优 ${idols.length}`, `Actresses ${idols.length}`)}
            <span aria-hidden="true">{idolsOpen ? '▴' : '▾'}</span>
          </button>
          {idolsOpen ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {idols.map((idol) => {
                const count = Number(idol?.work_count)
                const label = getIdolDisplayName(idol, preferChineseName)
                return (
                  <a
                    key={idol?.id || idol?.name}
                    href={buildIdolUrl?.(idol) || '#'}
                    className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700 transition hover:bg-purple-200"
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                      event.preventDefault()
                      onIdolClick?.(idol)
                    }}
                  >
                    <span>{label}</span>
                    {Number.isFinite(count) && count > 0 ? (
                      <span className="tabular-nums text-purple-500">{count}</span>
                    ) : null}
                  </a>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
