import { zh } from '@/utils/i18n'

export default function TagBar({
  tags,
  onToggle,
  multiSelect,
  selectedIds,
  onSelect,
  variant = 'default',
  tagClassName,
}) {
  const neumorphic = variant === 'neumorphic'
  return (
    <div className={`flex flex-wrap gap-2 ${neumorphic ? 'tag-bar-neumorphic' : ''}`}>
      {tags.map((t) => {
        const checked = selectedIds?.includes(t.id)
        const count = Number.isFinite(t.count) ? t.count : null
        const extraClassName = tagClassName?.(t) || ''
        if (multiSelect) {
          return (
            <label
              key={`${t.id}-${t.provider || 0}`}
              className={
                neumorphic
                  ? `skeuo-tag skeuo-tag--toggle ${extraClassName} ${checked ? 'skeuo-tag--selected' : ''}`
                  : 'inline-flex items-center gap-2 rounded px-2 py-1 text-sm text-app-text transition hover:bg-app-surface-2'
              }
            >
              <input
                type="checkbox"
                checked={!!checked}
                onChange={() => onSelect?.(t.id)}
                className={
                  neumorphic
                    ? 'skeuo-tag-check h-3.5 w-3.5 rounded border-app-border text-app-text focus:ring-app-gold'
                    : 'h-3.5 w-3.5 rounded border-app-border text-app-text focus:ring-app-gold'
                }
              />
              <span className={`select-none ${neumorphic ? 'skeuo-tag-label' : ''}`}>{t.name}</span>
              {count !== null && (
                <span
                  className={
                    neumorphic
                      ? 'skeuo-tag-count'
                      : 'rounded-full bg-app-surface-2 px-1.5 text-[10px] text-app-muted'
                  }
                >
                  {count}
                </span>
              )}
            </label>
          )
        }
        return (
          <button
            key={`${t.id}-${t.provider || 0}`}
            type="button"
            className={
              neumorphic
                ? `skeuo-tag skeuo-tag--button ${extraClassName}`
                : 'rounded px-2 py-1 text-sm text-app-text transition hover:bg-app-surface-2'
            }
            onClick={() => onToggle(t.name)}
            title={t.name}
            aria-label={zh(`筛选标签 ${t.name}`, `Filter tag ${t.name}`)}
          >
            <span
              className={`inline-flex items-center gap-1 ${neumorphic ? 'skeuo-tag-label' : ''}`}
            >
              {t.name}
              {count !== null && (
                <span
                  className={
                    neumorphic
                      ? 'skeuo-tag-count'
                      : 'rounded-full bg-app-surface-2 px-1.5 text-[10px] text-app-muted'
                  }
                >
                  {count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
