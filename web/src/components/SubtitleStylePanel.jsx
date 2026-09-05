import { zh } from '@/utils/i18n'
import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_STYLE_COLORS,
  subtitleBackgroundCss,
  subtitleEdgeCss,
} from '@/utils/subtitleStyle'

const sliderClass =
  'h-1 w-full cursor-pointer accent-white disabled:cursor-not-allowed disabled:opacity-50'

function chipClass(active) {
  return `rounded px-2 py-1 text-xs transition-colors ${
    active
      ? 'bg-white/20 font-semibold text-white'
      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
  }`
}

export default function SubtitleStylePanel({ style, onChange, onReset }) {
  const previewStyle = {
    color: style.color,
    backgroundColor: subtitleBackgroundCss(style.background),
    textShadow: subtitleEdgeCss(style.edge),
    fontSize: `${17 * style.scale}px`,
    fontWeight: 600,
    lineHeight: 1.35,
    padding: '0.08em 0.32em',
    borderRadius: '0.12em',
  }

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto px-3 py-3">
      <div className="flex min-h-16 items-center justify-center rounded-lg bg-gradient-to-b from-zinc-700 to-zinc-900 px-3 py-4">
        <span style={previewStyle}>{zh('字幕样式预览', 'Subtitle style preview')}</span>
      </div>

      <label className="block">
        <div className="mb-1.5 flex items-center justify-between text-xs text-white/70">
          <span>{zh('字号', 'Size')}</span>
          <span className="tabular-nums text-white/50">{Math.round(style.scale * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.8}
          max={2.4}
          step={0.05}
          value={style.scale}
          aria-label={zh('字幕字号', 'Subtitle size')}
          onChange={(event) => onChange({ scale: Number(event.target.value) })}
          className={sliderClass}
        />
      </label>

      <div>
        <div className="mb-1.5 text-xs text-white/70">{zh('颜色', 'Color')}</div>
        <div className="flex gap-2">
          {SUBTITLE_STYLE_COLORS.map((item) => {
            const active = style.color === item.value
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.id}
                onClick={() => onChange({ color: item.value })}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'
                }`}
                style={{ backgroundColor: item.value }}
              />
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-white/70">{zh('背景', 'Background')}</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['off', zh('无', 'Off')],
            ['light', zh('浅', 'Light')],
            ['medium', zh('中', 'Medium')],
            ['solid', zh('深', 'Solid')],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ background: id })}
              className={chipClass(style.background === id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-white/70">{zh('描边', 'Outline')}</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['none', zh('无', 'Off')],
            ['outline', zh('描边', 'Outline')],
            ['shadow', zh('阴影', 'Shadow')],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ edge: id })}
              className={chipClass(style.edge === id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <div className="mb-1.5 flex items-center justify-between text-xs text-white/70">
          <span>{zh('位置', 'Position')}</span>
          <span className="text-white/50">
            {style.offset <= 8
              ? zh('偏低', 'Lower')
              : style.offset >= 20
                ? zh('偏高', 'Higher')
                : zh('居中偏低', 'Lower-middle')}
          </span>
        </div>
        <input
          type="range"
          min={4}
          max={28}
          step={1}
          value={style.offset}
          aria-label={zh('字幕垂直位置', 'Subtitle vertical position')}
          onChange={(event) => onChange({ offset: Number(event.target.value) })}
          className={sliderClass}
        />
      </label>

      <button
        type="button"
        onClick={onReset}
        disabled={
          style.scale === DEFAULT_SUBTITLE_STYLE.scale &&
          style.color === DEFAULT_SUBTITLE_STYLE.color &&
          style.background === DEFAULT_SUBTITLE_STYLE.background &&
          style.edge === DEFAULT_SUBTITLE_STYLE.edge &&
          style.offset === DEFAULT_SUBTITLE_STYLE.offset
        }
        className="w-full rounded bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40"
      >
        {zh('恢复默认', 'Reset to default')}
      </button>
    </div>
  )
}
