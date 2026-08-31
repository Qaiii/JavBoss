import { useEffect, useRef, useState } from 'react'
import AppModal from '@/components/AppModal'
import {
  CUSTOM_COLOR_FIELDS,
  CUSTOM_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_THEME_ID,
  applyTheme,
  getCurrentThemeId,
  readCustomTheme,
  readThemeColorVar,
  saveCustomTheme,
  setTheme,
  THEMES,
  tripletToHex,
} from '@/theme/themes'
import { zh } from '@/utils/i18n'

const BASE_THEMES = THEMES.filter((theme) => theme.id !== CUSTOM_THEME_ID)

const readBaseDefaults = (baseId) => {
  applyTheme(baseId)
  const defaults = {}
  for (const field of CUSTOM_COLOR_FIELDS) {
    const raw = readThemeColorVar(field.var)
    defaults[field.key] = field.convert === 'triplet' ? tripletToHex(raw) : raw
  }
  return defaults
}

export default function CustomThemeEditor({ open, onClose }) {
  const originalThemeRef = useRef(DEFAULT_THEME_ID)
  const [baseId, setBaseId] = useState(DEFAULT_DARK_THEME_ID)
  const [colors, setColors] = useState({})

  useEffect(() => {
    if (!open) return undefined
    originalThemeRef.current = getCurrentThemeId()
    const saved = readCustomTheme()
    const initialBase = saved?.base || DEFAULT_DARK_THEME_ID
    const defaults = readBaseDefaults(initialBase)
    const initialColors = {}
    for (const field of CUSTOM_COLOR_FIELDS) {
      initialColors[field.key] = saved?.colors?.[field.key] || defaults[field.key]
    }
    setBaseId(initialBase)
    setColors(initialColors)
    applyTheme(CUSTOM_THEME_ID, initialColors)
    return undefined
  }, [open])

  // 草稿变化 → 实时预览（基础主题 + 当前颜色）
  useEffect(() => {
    if (open) applyTheme(CUSTOM_THEME_ID, colors)
  }, [open, colors, baseId])

  const handleColorChange = (key, value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(normalized)) return
    setColors((prev) => ({ ...prev, [key]: normalized }))
  }

  const handleReset = () => {
    setColors(readBaseDefaults(baseId))
  }

  const handleSave = () => {
    saveCustomTheme({ base: baseId, colors })
    setTheme(CUSTOM_THEME_ID)
    onClose?.()
  }

  const handleCancel = () => {
    applyTheme(originalThemeRef.current || DEFAULT_THEME_ID)
    onClose?.()
  }

  return (
    <AppModal
      ariaLabelledby="custom-theme-title"
      className="px-4"
      contentClassName="flex h-[min(84vh,720px)] w-[44rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      onClose={handleCancel}
    >
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white/70 px-6 py-4 backdrop-blur">
        <div>
          <h2 id="custom-theme-title" className="text-lg font-semibold text-zinc-900">
            {zh('自定义配色', 'Custom color scheme')}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {zh(
              '选择一个基础主题，再调整核心颜色。',
              'Pick a base theme, then tune the core colors.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          {zh('关闭', 'Close')}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <section>
          <h4 className="mb-3 text-sm font-semibold text-zinc-800">
            {zh('基础主题', 'Base theme')}
          </h4>
          <div className="flex flex-wrap gap-3">
            {BASE_THEMES.map((theme) => {
              const selected = baseId === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setBaseId(theme.id)}
                  className={`w-36 rounded-2xl border p-3 text-left transition ${
                    selected
                      ? 'border-blue-500 ring-2 ring-blue-100'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex gap-1.5">
                    {theme.preview.map((color) => (
                      <span
                        key={color}
                        className="h-6 w-6 rounded-lg border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-800">{theme.label}</div>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            {zh(
              '切换基础主题会保留当前已调颜色；可随时“恢复默认”回到基础主题的配色。',
              'Switching the base keeps your tuned colors; "Reset" restores the base defaults anytime.'
            )}
          </p>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold text-zinc-800">
            {zh('自定义颜色', 'Custom colors')}
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CUSTOM_COLOR_FIELDS.map((field) => {
              const value = colors[field.key] || '#000000'
              return (
                <label
                  key={field.key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5"
                >
                  <input
                    type="color"
                    value={value}
                    onChange={(event) => handleColorChange(field.key, event.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-white p-0.5"
                    aria-label={zh(field.label.zh, field.label.en)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-zinc-700">
                      {zh(field.label.zh, field.label.en)}
                    </span>
                    <span className="block truncate font-mono text-xs text-zinc-500">{value}</span>
                  </span>
                  <input
                    type="text"
                    value={value}
                    onChange={(event) => handleColorChange(field.key, event.target.value)}
                    spellCheck={false}
                    className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-700 outline-none focus:border-blue-500"
                    aria-label={zh(`${field.label.zh} HEX`, `${field.label.en} HEX`)}
                  />
                </label>
              )
            })}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/60 px-6 py-4">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          {zh('恢复默认', 'Reset to base')}
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {zh('取消', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {zh('保存并应用', 'Save & apply')}
          </button>
        </div>
      </div>
    </AppModal>
  )
}
