import { useEffect, useMemo, useState } from 'react'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { Button } from '@mui/material'
import AppModal from '@/components/AppModal'
import { isChineseLocale, zh } from '@/utils/i18n'
import {
  getAvailableJavPrefixInitials,
  JAV_PREFIX_INITIAL_OPTIONS,
  matchesJavPrefixInitial,
  readJavPrefixPreferences,
  writeJavPrefixPreferences,
} from '@/utils/javPrefix'

const isModifiedClick = (event) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0

function censorLabel(value) {
  if (value === 'mixed') return zh('混合', 'Mixed')
  if (value === true) return zh('无码', 'Uncensored')
  if (value === false) return zh('有码', 'Censored')
  return zh('未知', 'Unknown')
}

const unknownStudioLabel = () => zh('未知片商', 'Unknown studio')
const studioListSeparator = () => (isChineseLocale() ? '、' : ', ')
const getBrowserStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export default function JavPrefixModal({
  open,
  items = [],
  loading = false,
  error = '',
  activePrefix = '',
  buildPrefixUrl,
  onClose,
  onSelectPrefix,
}) {
  const [search, setSearch] = useState('')
  const [preferences, setPreferences] = useState(() =>
    readJavPrefixPreferences(getBrowserStorage())
  )
  const [selectedInitial, setSelectedInitial] = useState('')
  const { censorMode, sortMode } = preferences
  const setCensorMode = (censorMode) => setPreferences((current) => ({ ...current, censorMode }))
  const setSortMode = (sortMode) => setPreferences((current) => ({ ...current, sortMode }))
  const normalizedSearch = search.trim().toLowerCase()
  const availableInitials = useMemo(() => new Set(getAvailableJavPrefixInitials(items)), [items])
  const filteredItems = useMemo(() => {
    const merged = new Map()
    ;(items || []).forEach((item) => {
      if (censorMode === 'censored' && item?.is_uncensored !== false) return
      if (censorMode === 'uncensored' && item?.is_uncensored !== true) return
      const prefix = String(item?.prefix || '').trim()
      if (!prefix || !matchesJavPrefixInitial(prefix, selectedInitial)) return
      if (normalizedSearch) {
        const normalizedPrefix = prefix.toLowerCase()
        const studio = String(item?.studio_name || unknownStudioLabel()).toLowerCase()
        if (!normalizedPrefix.includes(normalizedSearch) && !studio.includes(normalizedSearch))
          return
      }

      const key = prefix.toUpperCase()
      const existing = merged.get(key) || {
        ...item,
        prefix,
        studio_name: '',
        work_count: 0,
        is_uncensored: item?.is_uncensored,
        studios: new Map(),
        censorValues: new Set(),
      }
      const studioName = String(item?.studio_name || '').trim() || unknownStudioLabel()
      const studioId = Number(item?.studio_id)
      const hasStudioId = Number.isFinite(studioId) && studioId > 0
      const studioKey = hasStudioId ? `id:${studioId}` : `name:${studioName}`
      const studioItem = existing.studios.get(studioKey) || {
        id: hasStudioId ? studioId : null,
        name: studioName,
        work_count: 0,
      }
      studioItem.work_count += Number(item?.work_count || 0)
      existing.studios.set(studioKey, studioItem)
      if (item?.is_uncensored === true || item?.is_uncensored === false) {
        existing.censorValues.add(item.is_uncensored)
      }
      existing.work_count += Number(item?.work_count || 0)
      merged.set(key, existing)
    })

    const list = Array.from(merged.values()).map((item) => {
      const censorValues = Array.from(item.censorValues)
      const studioItems = Array.from(item.studios.values()).sort(
        (a, b) =>
          Number(b?.work_count || 0) - Number(a?.work_count || 0) ||
          String(a?.name || '').localeCompare(String(b?.name || ''))
      )
      return {
        ...item,
        studioItems,
        studio_name: studioItems.map((studio) => studio.name).join(studioListSeparator()),
        is_uncensored:
          censorValues.length === 1 ? censorValues[0] : censorValues.length > 1 ? 'mixed' : null,
      }
    })
    return [...list].sort((a, b) => {
      const aPrefix = String(a?.prefix || '')
      const bPrefix = String(b?.prefix || '')
      if (sortMode === 'az') {
        return (
          aPrefix.localeCompare(bPrefix, undefined, { numeric: true }) ||
          String(a?.studio_name || '').localeCompare(String(b?.studio_name || ''))
        )
      }
      const countDiff = Number(b?.work_count || 0) - Number(a?.work_count || 0)
      return (
        countDiff ||
        aPrefix.localeCompare(bPrefix, undefined, { numeric: true }) ||
        String(a?.studio_name || '').localeCompare(String(b?.studio_name || ''))
      )
    })
  }, [censorMode, items, normalizedSearch, selectedInitial, sortMode])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedInitial('')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    writeJavPrefixPreferences(getBrowserStorage(), preferences)
  }, [preferences])

  if (!open) return null

  return (
    <AppModal
      ariaLabelledby="jav-prefix-modal-title"
      className="p-4"
      contentClassName="flex h-[86vh] w-full max-w-4xl flex-col rounded-2xl bg-app-surface shadow-xl"
      onClose={onClose}
    >
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 id="jav-prefix-modal-title" className="text-lg font-semibold text-app-text">
            {zh('番号', 'JAV codes')}
          </h2>
          <p className="mt-1 text-xs text-app-muted">
            {zh('点击番号查询对应影片', 'Select a code to filter matching works')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-app-muted hover:bg-app-surface-2 hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold"
          aria-label={zh('关闭', 'Close')}
        >
          <CloseRoundedIcon fontSize="small" />
        </button>
      </div>

      <div className="border-b">
        <div className="flex items-center gap-3 px-5 py-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="focus:ring-app-gold/25 h-9 min-w-0 flex-1 rounded border border-app-border px-3 text-sm outline-none focus:border-app-gold focus:ring-2"
            placeholder={zh('搜索番号或片商', 'Search code or studio')}
            aria-label={zh('搜索番号', 'Search JAV codes')}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs font-semibold text-app-text">{zh('类型', 'Type')}</span>
            <div className="inline-flex overflow-hidden rounded border border-app-border bg-app-surface text-xs">
              <button
                type="button"
                className={`px-3 py-2 font-medium ${
                  censorMode === 'all'
                    ? 'bg-app-gold-soft text-app-gold'
                    : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
                }`}
                onClick={() => setCensorMode('all')}
              >
                {zh('全部', 'All')}
              </button>
              <button
                type="button"
                className={`border-l border-app-border px-3 py-2 font-medium ${
                  censorMode === 'censored'
                    ? 'bg-app-gold-soft text-app-gold'
                    : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
                }`}
                onClick={() => setCensorMode('censored')}
              >
                {zh('有码', 'Censored')}
              </button>
              <button
                type="button"
                className={`border-l border-app-border px-3 py-2 font-medium ${
                  censorMode === 'uncensored'
                    ? 'bg-app-gold-soft text-app-gold'
                    : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
                }`}
                onClick={() => setCensorMode('uncensored')}
              >
                {zh('无码', 'Uncensored')}
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs font-semibold text-app-text">{zh('排序', 'Sort')}</span>
            <div className="inline-flex overflow-hidden rounded border border-app-border bg-app-surface text-xs">
              <button
                type="button"
                className={`px-3 py-2 font-medium ${
                  sortMode === 'count'
                    ? 'bg-app-gold-soft text-app-gold'
                    : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
                }`}
                onClick={() => setSortMode('count')}
              >
                {zh('作品数', 'Works')}
              </button>
              <button
                type="button"
                className={`border-l border-app-border px-3 py-2 font-medium ${
                  sortMode === 'az'
                    ? 'bg-app-gold-soft text-app-gold'
                    : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
                }`}
                onClick={() => setSortMode('az')}
              >
                A-Z
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 pb-3">
          <div
            className="flex gap-0.5"
            role="group"
            aria-label={zh('按番号首字符筛选', 'Filter by first code character')}
          >
            {JAV_PREFIX_INITIAL_OPTIONS.map((initial) => {
              const active = selectedInitial === initial
              const available = availableInitials.has(initial)
              return (
                <button
                  key={initial}
                  type="button"
                  className={`inline-flex h-6 min-w-0 flex-1 items-center justify-center rounded border text-[10px] font-semibold transition-colors ${
                    active
                      ? 'border-app-gold bg-app-gold text-[#1a1208]'
                      : !available
                        ? 'border-app-border bg-app-surface-2 text-app-muted'
                        : 'border-app-border bg-app-surface text-app-muted hover:border-app-gold hover:bg-app-gold-soft hover:text-app-gold'
                  }`}
                  disabled={!available}
                  aria-pressed={active}
                  aria-label={zh(
                    `显示以 ${initial} 开头的番号`,
                    `Show codes starting with ${initial}`
                  )}
                  onClick={() => setSelectedInitial(active ? '' : initial)}
                >
                  {initial}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="min-h-[260px] flex-1 overflow-auto">
        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center text-sm text-app-muted">
            {zh('加载中…', 'Loading...')}
          </div>
        ) : error ? (
          <div className="m-5 rounded border border-red-200 bg-red-950/40 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center text-sm text-app-muted">
            {zh('暂无番号', 'No codes')}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-app-surface-2 text-xs uppercase tracking-wide text-app-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">{zh('番号', 'Code')}</th>
                <th className="px-5 py-3 font-semibold">{zh('片商', 'Studio')}</th>
                <th className="px-5 py-3 font-semibold">{zh('类型', 'Type')}</th>
                <th className="px-5 py-3 text-right font-semibold">{zh('影片数量', 'Works')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item) => {
                const prefix = String(item?.prefix || '').trim()
                const active = prefix && prefix === activePrefix
                const href = buildPrefixUrl?.(item) || '#'
                return (
                  <tr
                    key={`${prefix}-${item?.studio_id || 'none'}-${String(item?.is_uncensored)}`}
                    className={active ? 'bg-app-gold-soft' : 'hover:bg-app-surface-2'}
                  >
                    <td className="px-5 py-3">
                      <a
                        href={href}
                        className="font-semibold text-app-gold hover:text-app-gold hover:underline"
                        onClick={(event) => {
                          if (isModifiedClick(event)) return
                          event.preventDefault()
                          onSelectPrefix?.(item)
                        }}
                      >
                        {prefix}
                      </a>
                    </td>
                    <td className="px-5 py-3 text-app-text">
                      <div className="flex flex-wrap gap-y-1">
                        {(item?.studioItems || []).length > 0 ? (
                          item.studioItems.map((studio, index) => {
                            const studios = item.studioItems || []
                            const studioName = String(studio?.name || '').trim()
                            const studioId = Number(studio?.id)
                            const hasStudio = Number.isFinite(studioId) && studioId > 0
                            const studioFilterItem = {
                              ...item,
                              studio_id: hasStudio ? studioId : null,
                              studio_name: studioName || unknownStudioLabel(),
                              include_studio_filter: true,
                            }
                            return (
                              <span
                                key={`${hasStudio ? studioId : 'unknown'}-${studioName || index}`}
                                className="inline-flex"
                              >
                                <a
                                  href={buildPrefixUrl?.(studioFilterItem) || '#'}
                                  className="text-app-text hover:text-app-text hover:underline"
                                  title={zh(
                                    `搜索 ${prefix} + ${studioFilterItem.studio_name}`,
                                    `Search ${prefix} + ${studioFilterItem.studio_name}`
                                  )}
                                  onClick={(event) => {
                                    if (isModifiedClick(event)) return
                                    event.preventDefault()
                                    onSelectPrefix?.(studioFilterItem)
                                  }}
                                >
                                  {studioFilterItem.studio_name}
                                </a>
                                {index < studios.length - 1 ? (
                                  <span className="text-app-muted">{studioListSeparator()}</span>
                                ) : null}
                              </span>
                            )
                          })
                        ) : (
                          <a
                            href={
                              buildPrefixUrl?.({
                                ...item,
                                studio_id: null,
                                studio_name: unknownStudioLabel(),
                                include_studio_filter: true,
                              }) || '#'
                            }
                            className="text-app-text hover:text-app-text hover:underline"
                            title={zh(
                              `搜索 ${prefix} + ${unknownStudioLabel()}`,
                              `Search ${prefix} + ${unknownStudioLabel()}`
                            )}
                            onClick={(event) => {
                              if (isModifiedClick(event)) return
                              event.preventDefault()
                              onSelectPrefix?.({
                                ...item,
                                studio_id: null,
                                studio_name: unknownStudioLabel(),
                                include_studio_filter: true,
                              })
                            }}
                          >
                            {unknownStudioLabel()}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-app-text">{censorLabel(item?.is_uncensored)}</td>
                    <td className="px-5 py-3 text-right font-medium text-app-text">
                      {Number(item?.work_count || 0).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end border-t px-5 py-3">
        <Button variant="outlined" onClick={onClose}>
          {zh('关闭', 'Close')}
        </Button>
      </div>
    </AppModal>
  )
}
