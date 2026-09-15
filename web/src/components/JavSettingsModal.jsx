import { useState } from 'react'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import AppModal from '@/components/AppModal'
import {
  IDOL_SORT_OPTIONS,
  JAV_SORT_OPTIONS,
  JAV_SORT_RULE_FILTERS,
  findSortOption,
  isUnorderedSortOption,
  reverseSortValue,
  sortLabel,
  sortLabelParts,
} from '@/constants/jav'
import {
  CARD_ORIENTATION_LOCK,
  CARD_WIDTH_MAX,
  CARD_WIDTH_MIN,
  defaultCardLayout,
  normalizeCardWidth,
} from '@/utils/cardLayout'
import { zh } from '@/utils/i18n'

function SortText({ option, value }) {
  const parts = sortLabelParts(option, value, zh)

  return (
    <span className="truncate text-xs font-semibold sm:text-sm">
      <span>{parts.label}</span>
      <span className="font-normal text-app-muted">{parts.separator}</span>
      <span className="font-normal text-app-muted">{parts.direction}</span>
    </span>
  )
}

function SortOptionRow({ option, name, inputValue, onChange }) {
  const active = findSortOption([option], inputValue)
  const displayValue = active ? inputValue : option.defaultValue
  const id = `${name}-${option.base}`

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-app-surface px-3 py-2 transition ${
        active
          ? 'bg-app-gold-soft/40 ring-app-gold/25 border-app-gold ring-1'
          : 'border-app-border hover:border-app-gold'
      }`}
    >
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          id={id}
          type="radio"
          name={name}
          value={displayValue}
          checked={Boolean(active)}
          onChange={() => onChange?.(displayValue)}
          className="h-4 w-4 accent-app-gold"
        />
        <SortText option={option} value={displayValue} />
      </label>
      {isUnorderedSortOption(option) ? null : (
        <button
          type="button"
          onClick={() => onChange?.(reverseSortValue([option], displayValue, option.defaultValue))}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-app-border bg-app-surface text-app-muted transition hover:border-app-gold hover:bg-app-gold-soft hover:text-app-gold"
          title={zh('反转排序', 'Reverse sort')}
          aria-label={zh(`反转${option.label[0]}排序`, `Reverse ${option.label[1]} sort`)}
        >
          <SwapVertIcon fontSize="inherit" />
        </button>
      )}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-app-text">
      <span className="h-4 w-1 rounded-full bg-app-gold" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function SettingsSection({ title, children }) {
  return (
    <section className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm shadow-black/30">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

function SettingsRow({ label, children }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5 text-sm text-app-text">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  )
}

function SettingsSwitch({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={Boolean(checked)}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg ${
        checked ? 'bg-app-gold' : 'bg-app-hover'
      }`}
    >
      <span
        className={`mt-1 h-4 w-4 rounded-full bg-app-text shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function CardWidthRow({ label, value, fallback, onChange }) {
  const width = normalizeCardWidth(value, fallback)
  return (
    <SettingsRow label={label}>
      <div className="flex w-48 items-center gap-2">
        <input
          type="range"
          min={CARD_WIDTH_MIN}
          max={CARD_WIDTH_MAX}
          step="1"
          value={width}
          onChange={(event) => onChange?.(Number(event.target.value))}
          className="h-1.5 min-w-0 flex-1 accent-app-gold"
          aria-label={label}
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-app-muted">{width}rem</span>
      </div>
    </SettingsRow>
  )
}

function CardLayoutFields({ entity, layout, onChange }) {
  const defaults = defaultCardLayout(entity)
  const lock = CARD_ORIENTATION_LOCK[entity]
  const orientation = lock || (layout?.orientation === 'portrait' ? 'portrait' : 'landscape')
  const update = (patch) => onChange?.({ ...defaults, ...layout, ...patch })

  return (
    <>
      <SettingsRow label={zh('封面方向', 'Cover orientation')}>
        {lock ? (
          <span className="text-sm text-app-muted">
            {lock === 'portrait'
              ? zh('竖版（锁定）', 'Portrait (locked)')
              : zh('横版（锁定）', 'Landscape (locked)')}
          </span>
        ) : (
          <select
            value={orientation}
            onChange={(event) => update({ orientation: event.target.value })}
            className={controlClassName}
            aria-label={zh('封面方向', 'Cover orientation')}
          >
            <option value="landscape">{zh('横版', 'Landscape')}</option>
            <option value="portrait">{zh('竖版', 'Portrait')}</option>
          </select>
        )}
      </SettingsRow>
      {lock === 'portrait' ? null : (
        <CardWidthRow
          label={zh('横版宽度', 'Landscape width')}
          value={layout?.landscape}
          fallback={defaults.landscape}
          onChange={(landscape) => update({ landscape })}
        />
      )}
      {lock === 'landscape' ? null : (
        <CardWidthRow
          label={zh('竖版宽度', 'Portrait width')}
          value={layout?.portrait}
          fallback={defaults.portrait}
          onChange={(portrait) => update({ portrait })}
        />
      )}
    </>
  )
}

const javSortChoices = JAV_SORT_OPTIONS.flatMap((option) => {
  if (isUnorderedSortOption(option) || option.ascValue === option.descValue) {
    return [{ value: option.defaultValue, label: sortLabel(option, option.defaultValue, zh) }]
  }
  return [
    { value: option.ascValue, label: sortLabel(option, option.ascValue, zh) },
    { value: option.descValue, label: sortLabel(option, option.descValue, zh) },
  ]
})

function nextJavSortRuleID(prefix, rules) {
  const existing = new Set((rules || []).map((rule) => rule.id))
  const base = `${prefix}-${Date.now()}`
  let id = base
  let suffix = 2
  while (existing.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

function javSortRuleDescription(rule) {
  const filters = (rule.active || [])
    .map((key) => JAV_SORT_RULE_FILTERS.find((item) => item.key === key))
    .filter(Boolean)
  const filterNames = filters.map((filter) => zh(filter.label[0], filter.label[1]))
  const sortName = javSortChoices.find((choice) => choice.value === rule.sort)?.label || rule.sort

  let effect
  if (filterNames.length === 0) {
    effect = zh(
      '还没选择筛选条件，所以这条规则暂时不会生效。',
      'No filter conditions have been selected, so this rule will not take effect yet.'
    )
  } else if (rule.mode === 'all' && filterNames.length > 1) {
    effect = zh(
      `当筛选条件完整包含 ${filterNames.join('、')} 时，作品会按“${sortName}”排列。`,
      `When the filters fully include ${filterNames.join(', ')}, items are sorted by “${sortName}”.`
    )
  } else if (rule.mode === 'any' && filterNames.length > 1) {
    effect = zh(
      `当筛选条件包含 ${filterNames.join('、')} 中的任意一个选项时，作品会按“${sortName}”排列。`,
      `When the filters include any one option from ${filterNames.join(', ')}, items are sorted by “${sortName}”.`
    )
  } else {
    effect = zh(
      `当筛选条件包含 ${filterNames[0]} 时，作品会按“${sortName}”排列。`,
      `When the filters include ${filterNames[0]}, items are sorted by “${sortName}”.`
    )
  }

  return rule.enabled
    ? effect
    : zh(`这条规则现在已停用。启用后，${effect}`, `This rule is disabled. When enabled, ${effect}`)
}

function JavSortRuleEditor({ rule, index, total, onChange, onMove, onRemove }) {
  const update = (changes) => onChange?.({ ...rule, ...changes })
  const toggleFilter = (key) => {
    const current = new Set(rule.active || [])
    if (current.has(key)) current.delete(key)
    else current.add(key)
    const active = JAV_SORT_RULE_FILTERS.map((item) => item.key).filter((item) => current.has(item))
    update({ active })
  }

  return (
    <div className="bg-app-surface-2/70 rounded-xl border border-app-border p-4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 text-sm font-semibold text-app-text">
          {zh(`规则 ${index + 1}`, `Rule ${index + 1}`)}
        </span>
        <span className="group relative">
          <button
            type="button"
            aria-label={zh(`查看规则 ${index + 1} 的当前效果`, `View rule ${index + 1} effect`)}
            className="inline-flex h-7 w-7 items-center justify-center text-amber-500 transition hover:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <InfoOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-4rem)] rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
          >
            {javSortRuleDescription(rule)}
          </span>
        </span>
        <span className="ml-auto text-xs text-app-muted">{zh('启用', 'Enable')}</span>
        <SettingsSwitch
          label={zh(`启用排序规则 ${index + 1}`, `Enable sort rule ${index + 1}`)}
          checked={rule.enabled}
          onChange={(enabled) => update({ enabled })}
        />
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove?.(-1)}
          className="h-8 w-8 rounded-md border border-app-border bg-app-surface text-app-muted disabled:opacity-30"
          aria-label={zh('上移规则', 'Move rule up')}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index >= total - 1}
          onClick={() => onMove?.(1)}
          className="h-8 w-8 rounded-md border border-app-border bg-app-surface text-app-muted disabled:opacity-30"
          aria-label={zh('下移规则', 'Move rule down')}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="h-8 rounded-md border border-red-200 bg-app-surface px-2 text-xs text-red-600 hover:bg-red-950/40"
        >
          {zh('删除', 'Delete')}
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-app-muted">
          {zh('匹配条件', 'Match condition')}
          <select
            value={rule.mode}
            onChange={(event) => update({ mode: event.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-app-border bg-app-surface px-2 text-sm"
          >
            <option value="all">
              {zh(
                '当筛选条件包含以下所有选中筛选时',
                'When filters include all selected filter types'
              )}
            </option>
            <option value="any">
              {zh(
                '当筛选条件包含以下任意选中筛选时',
                'When filters include any selected filter type'
              )}
            </option>
          </select>
        </label>
        <label className="text-xs font-medium text-app-muted">
          {zh('命中后排序', 'Sort when matched')}
          <select
            value={rule.sort}
            onChange={(event) => update({ sort: event.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-app-border bg-app-surface px-2 text-sm"
          >
            {javSortChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap gap-1.5">
          {JAV_SORT_RULE_FILTERS.map((filter) => {
            const checked = (rule.active || []).includes(filter.key)
            return (
              <label
                key={filter.key}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition ${
                  checked
                    ? 'border-app-gold bg-app-gold-soft text-app-gold'
                    : 'border-app-border bg-app-surface text-app-muted'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFilter(filter.key)}
                  className="sr-only"
                />
                {zh(filter.label[0], filter.label[1])}
              </label>
            )
          })}
        </div>
        {(rule.active || []).length === 0 ? (
          <p className="mt-1.5 text-xs text-amber-600">
            {zh('请选择至少一种筛选', 'Select at least one filter')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

const controlClassName =
  'h-9 w-32 rounded-lg border border-app-border bg-app-surface px-3 text-sm text-app-text outline-none transition hover:border-app-border focus:border-app-gold focus:ring-2 focus:ring-app-gold/25'

function normalizeSettingsTab(tab) {
  return ['jav', 'idol', 'studio', 'series', 'tag'].includes(tab) ? tab : 'jav'
}

export default function JavSettingsModal({
  open,
  initialTab = 'jav',
  onClose,
  javPageSizeInput,
  onJavPageSizeChange,
  javGridColumnsInput,
  onJavGridColumnsChange,
  javTitleMaxRowsInput,
  onJavTitleMaxRowsChange,
  javIdolTagMaxRowsInput,
  onJavIdolTagMaxRowsChange,
  javTagMaxRowsInput,
  onJavTagMaxRowsChange,
  javHideTitleInput = false,
  onJavHideTitleChange,
  javHideMetaInput = false,
  onJavHideMetaChange,
  javHideSeriesInput = false,
  onJavHideSeriesChange,
  javHideIdolsInput = false,
  onJavHideIdolsChange,
  javHideTagsInput = false,
  onJavHideTagsChange,
  javHideActionsInput = false,
  onJavHideActionsChange,
  cardLayoutInput,
  onCardLayoutChange,
  javFavoriteRatingShowFullInput = false,
  onJavFavoriteRatingShowFullChange,
  idolPageSizeInput,
  onIdolPageSizeChange,
  studioPageSizeInput,
  onStudioPageSizeChange,
  seriesPageSizeInput,
  onSeriesPageSizeChange,
  javSortInput,
  onJavSortChange,
  javSortRulesInput = [],
  onJavSortRulesChange,
  idolSortInput,
  onIdolSortChange,
  javIdolPreferChineseNameInput = false,
  onJavIdolPreferChineseNameChange,
  javTitleLanguageInput = 'original',
  onJavTitleLanguageChange,
  javIdolRefreshDaysInput = 7,
  onJavIdolRefreshDaysChange,
  javTagShowSimplifiedInput = false,
  onJavTagShowSimplifiedChange,
  onSave,
}) {
  const [activeTab, setActiveTab] = useState(() => normalizeSettingsTab(initialTab))

  if (!open) return null

  const tabs = [
    { key: 'jav', label: zh('JAV', 'JAV') },
    { key: 'idol', label: zh('女优', 'Idols') },
    { key: 'studio', label: zh('片商', 'Studios') },
    { key: 'series', label: zh('系列', 'Series') },
    { key: 'tag', label: zh('标签', 'Tags') },
  ]

  const resetActiveTab = () => {
    switch (activeTab) {
      case 'idol':
        onIdolPageSizeChange?.(24)
        onCardLayoutChange?.('idol', defaultCardLayout('idol'))
        onIdolSortChange?.(IDOL_SORT_OPTIONS[0]?.defaultValue || 'recent')
        onJavIdolPreferChineseNameChange?.(false)
        break
      case 'studio':
        onStudioPageSizeChange?.(25)
        onCardLayoutChange?.('studio', defaultCardLayout('studio'))
        break
      case 'series':
        onSeriesPageSizeChange?.(25)
        onCardLayoutChange?.('series', defaultCardLayout('series'))
        break
      case 'tag':
        onJavTagShowSimplifiedChange?.(false)
        break
      default:
        onJavPageSizeChange?.(24)
        onJavGridColumnsChange?.(0)
        onJavTitleMaxRowsChange?.(2)
        onJavIdolTagMaxRowsChange?.(2)
        onJavTagMaxRowsChange?.(2)
        onJavHideTitleChange?.(false)
        onJavHideMetaChange?.(false)
        onJavHideSeriesChange?.(false)
        onJavHideIdolsChange?.(false)
        onJavHideTagsChange?.(false)
        onJavHideActionsChange?.(false)
        onCardLayoutChange?.('jav', defaultCardLayout('jav'))
        onJavFavoriteRatingShowFullChange?.(false)
        onJavSortChange?.(JAV_SORT_OPTIONS[0]?.defaultValue || 'recent')
        onJavSortRulesChange?.([])
        onJavTitleLanguageChange?.('original')
        break
    }
  }

  return (
    <AppModal
      ariaLabelledby="jav-display-settings-title"
      className="px-4 py-4"
      contentClassName="flex h-[860px] max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface-2 shadow-2xl shadow-black/50"
      onClose={onClose}
    >
      <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
        <h2
          id="jav-display-settings-title"
          className="text-xl font-bold tracking-tight text-app-text"
        >
          {zh('显示设置', 'Display settings')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition hover:bg-app-hover hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold"
          aria-label={zh('关闭设置', 'Close settings')}
        >
          <CloseRoundedIcon sx={{ fontSize: 22 }} />
        </button>
      </header>

      <div className="flex shrink-0 flex-wrap gap-2 px-5 pb-4" role="tablist">
        {tabs.map((tab) => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold focus-visible:ring-offset-2 ${
                active
                  ? 'shadow-app-gold/25 border-app-gold bg-app-gold text-[#1a1208] shadow-md'
                  : 'hover:border-app-gold/50 border-app-border bg-app-surface text-app-muted hover:bg-app-gold-soft hover:text-app-gold'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {activeTab === 'jav' ? (
          <div className="space-y-3">
            <SettingsSection title={zh('布局设置', 'Layout')}>
              <div className="divide-y divide-app-border px-1">
                <SettingsRow label={zh('每页 JAV 数量', 'JAVs per page')}>
                  <input
                    type="number"
                    min="1"
                    value={javPageSizeInput}
                    onChange={(e) => onJavPageSizeChange?.(e.target.value)}
                    className={controlClassName}
                  />
                </SettingsRow>
                <SettingsRow label={zh('每行 JAV 数量', 'JAVs per row')}>
                  <select
                    value={String(javGridColumnsInput ?? 0)}
                    onChange={(e) => onJavGridColumnsChange?.(e.target.value)}
                    className={controlClassName}
                  >
                    <option value="0">{zh('自适应', 'Auto')}</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={String(count)}>
                        {count}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
              </div>
            </SettingsSection>

            <SettingsSection title={zh('卡片设置', 'Card settings')}>
              <div className="divide-y divide-app-border px-1">
                <CardLayoutFields
                  entity="jav"
                  layout={cardLayoutInput?.jav}
                  onChange={(layout) => onCardLayoutChange?.('jav', layout)}
                />
                <SettingsRow label={zh('标题最多行数', 'Title max rows')}>
                  <select
                    value={String(javTitleMaxRowsInput ?? 2)}
                    onChange={(e) => onJavTitleMaxRowsChange?.(e.target.value)}
                    className={controlClassName}
                  >
                    <option value="0">{zh('完全展开', 'All')}</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={String(count)}>
                        {count}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow label={zh('标题显示语言', 'Title language')}>
                  <select
                    value={javTitleLanguageInput === 'chinese' ? 'chinese' : 'original'}
                    onChange={(e) => onJavTitleLanguageChange?.(e.target.value)}
                    className={controlClassName}
                    aria-label={zh('标题显示语言', 'Title language')}
                  >
                    <option value="original">{zh('原文', 'Original')}</option>
                    <option value="chinese">{zh('中文', 'Chinese')}</option>
                  </select>
                </SettingsRow>
                <SettingsRow label={zh('标签最多行数', 'Tag max rows')}>
                  <select
                    value={String(javTagMaxRowsInput ?? 2)}
                    onChange={(e) => onJavTagMaxRowsChange?.(e.target.value)}
                    className={controlClassName}
                  >
                    <option value="0">{zh('完全展开', 'All')}</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={String(count)}>
                        {count}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow label={zh('演员标签最多行数', 'Actor tag max rows')}>
                  <select
                    value={String(javIdolTagMaxRowsInput ?? 0)}
                    onChange={(e) => onJavIdolTagMaxRowsChange?.(e.target.value)}
                    className={controlClassName}
                  >
                    <option value="0">{zh('完全展开', 'All')}</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={String(count)}>
                        {count}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <SettingsRow label={zh('不显示标题', 'Hide title')}>
                  <SettingsSwitch
                    label={zh('不显示标题', 'Hide title')}
                    checked={javHideTitleInput}
                    onChange={onJavHideTitleChange}
                  />
                </SettingsRow>
                <SettingsRow label={zh('不显示发行信息', 'Hide release info')}>
                  <SettingsSwitch
                    label={zh('不显示发行信息', 'Hide release info')}
                    checked={javHideMetaInput}
                    onChange={onJavHideMetaChange}
                  />
                </SettingsRow>
                <SettingsRow label={zh('不显示系列', 'Hide series')}>
                  <SettingsSwitch
                    label={zh('不显示系列', 'Hide series')}
                    checked={javHideSeriesInput}
                    onChange={onJavHideSeriesChange}
                  />
                </SettingsRow>
                <SettingsRow label={zh('不显示演员', 'Hide actors')}>
                  <SettingsSwitch
                    label={zh('不显示演员', 'Hide actors')}
                    checked={javHideIdolsInput}
                    onChange={onJavHideIdolsChange}
                  />
                </SettingsRow>
                <SettingsRow label={zh('不显示标签', 'Hide tags')}>
                  <SettingsSwitch
                    label={zh('不显示标签', 'Hide tags')}
                    checked={javHideTagsInput}
                    onChange={onJavHideTagsChange}
                  />
                </SettingsRow>
                <SettingsRow label={zh('不显示操作按钮', 'Hide action buttons')}>
                  <SettingsSwitch
                    label={zh('不显示操作按钮', 'Hide action buttons')}
                    checked={javHideActionsInput}
                    onChange={onJavHideActionsChange}
                  />
                </SettingsRow>
                <SettingsRow label={zh('展示完整喜爱度爱心', 'Show full favorite-rating hearts')}>
                  <SettingsSwitch
                    label={zh('展示完整喜爱度爱心', 'Show full favorite-rating hearts')}
                    checked={javFavoriteRatingShowFullInput}
                    onChange={onJavFavoriteRatingShowFullChange}
                  />
                </SettingsRow>
              </div>
            </SettingsSection>

            <SettingsSection title={zh('排序规则', 'Sort rules')}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-5 text-app-muted">
                  {zh(
                    '规则从上到下匹配，第一条命中的规则生效。',
                    'Rules match top to bottom; the first match wins.'
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={(javSortRulesInput || []).length >= 50}
                    onClick={() =>
                      onJavSortRulesChange?.([
                        ...(javSortRulesInput || []),
                        {
                          id: nextJavSortRuleID('rule', javSortRulesInput),
                          enabled: true,
                          mode: 'any',
                          active: [],
                          sort: 'recent',
                        },
                      ])
                    }
                    className="rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-text hover:border-app-gold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {zh('添加规则', 'Add rule')}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {(javSortRulesInput || []).map((rule, index) => (
                  <JavSortRuleEditor
                    key={rule.id}
                    rule={rule}
                    index={index}
                    total={javSortRulesInput.length}
                    onChange={(nextRule) =>
                      onJavSortRulesChange?.(
                        javSortRulesInput.map((item, itemIndex) =>
                          itemIndex === index ? nextRule : item
                        )
                      )
                    }
                    onMove={(direction) => {
                      const target = index + direction
                      if (target < 0 || target >= javSortRulesInput.length) return
                      const next = [...javSortRulesInput]
                      ;[next[index], next[target]] = [next[target], next[index]]
                      onJavSortRulesChange?.(next)
                    }}
                    onRemove={() =>
                      onJavSortRulesChange?.(
                        javSortRulesInput.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  />
                ))}
                {(javSortRulesInput || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-app-border px-3 py-5 text-center text-xs text-app-muted">
                    {zh('暂无排序规则', 'No sort rules')}
                  </div>
                ) : null}
              </div>
              <div className="mt-4 border-t border-app-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-app-text">
                      {zh('默认排序（兜底）', 'Default sort (fallback)')}
                    </div>
                    <div className="mt-1 text-xs font-normal leading-5 text-app-muted">
                      {zh('当所有规则都不满足时使用。', 'Used when none of the rules match.')}
                    </div>
                  </div>
                  <select
                    aria-label={zh('默认排序（兜底）', 'Default sort (fallback)')}
                    value={javSortInput}
                    onChange={(event) => onJavSortChange?.(event.target.value)}
                    className="focus:ring-app-gold/25 h-10 w-full rounded-lg border border-app-border bg-app-surface px-3 text-sm font-normal text-app-text outline-none transition hover:border-app-border focus:border-app-gold focus:ring-2 sm:w-64"
                  >
                    {javSortChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === 'idol' ? (
          <div className="space-y-3">
            <SettingsSection title={zh('布局设置', 'Layout')}>
              <div className="divide-y divide-app-border px-1">
                <SettingsRow label={zh('每页 女优 数量', 'Idols per page')}>
                  <input
                    type="number"
                    min="1"
                    value={idolPageSizeInput}
                    onChange={(e) => onIdolPageSizeChange?.(e.target.value)}
                    className={controlClassName}
                  />
                </SettingsRow>
              </div>
            </SettingsSection>
            <SettingsSection title={zh('卡片设置', 'Card settings')}>
              <div className="divide-y divide-app-border px-1">
                <CardLayoutFields
                  entity="idol"
                  layout={cardLayoutInput?.idol}
                  onChange={(layout) => onCardLayoutChange?.('idol', layout)}
                />
                <SettingsRow label={zh('优先显示中文名', 'Prefer Chinese name')}>
                  <SettingsSwitch
                    label={zh('优先显示中文名', 'Prefer Chinese name')}
                    checked={javIdolPreferChineseNameInput}
                    onChange={onJavIdolPreferChineseNameChange}
                  />
                </SettingsRow>
              </div>
            </SettingsSection>
            <SettingsSection title={zh('作品同步', 'Works sync')}>
              <SettingsRow label={zh('女优新作品刷新间隔（天）', 'Refresh new works every (days)')}>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={javIdolRefreshDaysInput}
                  onChange={(e) => onJavIdolRefreshDaysChange?.(e.target.value)}
                  className={controlClassName}
                />
              </SettingsRow>
            </SettingsSection>
            <SettingsSection title={zh('默认排序', 'Default sort')}>
              <div className="space-y-2">
                {IDOL_SORT_OPTIONS.map((option) => (
                  <SortOptionRow
                    key={option.base}
                    option={option}
                    name="idol-sort"
                    inputValue={idolSortInput}
                    onChange={onIdolSortChange}
                  />
                ))}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === 'studio' ? (
          <div className="space-y-3">
            <SettingsSection title={zh('布局设置', 'Layout')}>
              <div className="divide-y divide-app-border px-1">
                <SettingsRow label={zh('每页 片商 数量', 'Studios per page')}>
                  <input
                    type="number"
                    min="1"
                    value={studioPageSizeInput}
                    onChange={(e) => onStudioPageSizeChange?.(e.target.value)}
                    className={controlClassName}
                  />
                </SettingsRow>
              </div>
            </SettingsSection>
            <SettingsSection title={zh('卡片设置', 'Card settings')}>
              <div className="divide-y divide-app-border px-1">
                <CardLayoutFields
                  entity="studio"
                  layout={cardLayoutInput?.studio}
                  onChange={(layout) => onCardLayoutChange?.('studio', layout)}
                />
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === 'series' ? (
          <div className="space-y-3">
            <SettingsSection title={zh('布局设置', 'Layout')}>
              <div className="divide-y divide-app-border px-1">
                <SettingsRow label={zh('每页 系列 数量', 'Series per page')}>
                  <input
                    type="number"
                    min="1"
                    value={seriesPageSizeInput}
                    onChange={(e) => onSeriesPageSizeChange?.(e.target.value)}
                    className={controlClassName}
                  />
                </SettingsRow>
              </div>
            </SettingsSection>
            <SettingsSection title={zh('卡片设置', 'Card settings')}>
              <div className="divide-y divide-app-border px-1">
                <CardLayoutFields
                  entity="series"
                  layout={cardLayoutInput?.series}
                  onChange={(layout) => onCardLayoutChange?.('series', layout)}
                />
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === 'tag' ? (
          <SettingsSection title={zh('标签设置', 'Tag settings')}>
            <SettingsRow label={zh('刮削标签显示语言', 'Scraped tag display language')}>
              <select
                aria-label={zh('刮削标签显示语言', 'Scraped tag display language')}
                value={javTagShowSimplifiedInput ? 'simplified' : 'traditional'}
                onChange={(event) =>
                  onJavTagShowSimplifiedChange?.(event.target.value === 'simplified')
                }
                className={controlClassName}
              >
                <option value="traditional">{zh('繁体中文', 'Traditional Chinese')}</option>
                <option value="simplified">{zh('简体中文', 'Simplified Chinese')}</option>
              </select>
            </SettingsRow>
          </SettingsSection>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-app-border bg-app-surface px-5 py-4">
        <button
          type="button"
          onClick={resetActiveTab}
          className="rounded-lg px-3 py-2 text-sm font-medium text-app-muted transition hover:bg-app-surface-2 hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold"
        >
          {zh('恢复默认', 'Restore defaults')}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-w-24 rounded-lg border border-app-border bg-app-surface px-5 py-2 text-sm font-medium text-app-text transition hover:bg-app-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold"
          >
            {zh('取消', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="shadow-app-gold/25 min-w-24 rounded-lg bg-app-gold px-5 py-2 text-sm font-medium text-white shadow-md transition hover:bg-app-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-app-gold focus-visible:ring-offset-2"
          >
            {zh('保存', 'Save')}
          </button>
        </div>
      </footer>
    </AppModal>
  )
}
