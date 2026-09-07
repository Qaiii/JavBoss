import { useEffect, useState } from 'react'

import { fetchJavSeriesPreview } from '@/api'
import { useStore } from '@/store'
import { getIdolDisplayName } from '@/utils/javIdol'
import { zh } from '@/utils/i18n'

function configFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

export default function JavSeriesDetailHeader({
  seriesId,
  fallbackName = '',
  buildIdolUrl,
  onIdolClick,
}) {
  const preferChineseName = useStore((state) =>
    configFlag(state.config?.jav_idol_prefer_chinese_name)
  )
  const [series, setSeries] = useState(null)

  useEffect(() => {
    const id = Number(seriesId)
    if (!Number.isFinite(id) || id <= 0) {
      setSeries(null)
      return undefined
    }
    let cancelled = false
    fetchJavSeriesPreview(id)
      .then((item) => {
        if (!cancelled) setSeries(item)
      })
      .catch(() => {
        if (!cancelled) setSeries(null)
      })
    return () => {
      cancelled = true
    }
  }, [seriesId])

  const name = String(series?.name || fallbackName || '').trim()
  const workCount = Number(series?.work_count)
  const idols = Array.isArray(series?.idols) ? series.idols : []

  if (!name && !Number.isFinite(workCount) && idols.length === 0) return null

  return (
    <section className="mb-4" aria-label={zh('系列信息', 'Series information')}>
      <h1 className="text-xl font-semibold text-gray-900">
        {name || zh('未知系列', 'Unknown series')}
      </h1>
      <div className="mt-1 text-sm text-gray-600">
        {zh(
          `入库 ${Number.isFinite(workCount) ? workCount : 0}`,
          `${Number.isFinite(workCount) ? workCount : 0} in library`
        )}
      </div>
      {idols.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={zh('女优', 'Actresses')}>
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
    </section>
  )
}
