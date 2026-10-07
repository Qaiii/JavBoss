import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import {
  JAV_SORT_OPTIONS,
  findSortOption,
  resolveJavSort,
  reverseSortValue,
  sortLabelParts,
} from '@/constants/jav'
import { useStore } from '@/store'
import { zh } from '@/utils/i18n'

function SortText({ option, value, className = '' }) {
  const parts = sortLabelParts(option, value, zh)

  return (
    <span className={`truncate font-semibold ${className}`}>
      <span>{parts.label}</span>
      <span className="font-normal text-gray-500">{parts.separator}</span>
      <span className="font-normal text-gray-500">{parts.direction}</span>
    </span>
  )
}

/**
 * Works-list sort selector shown inside the top navigation's "更多" panel, replacing the
 * former in-page sort popover.
 */
export default function JavSortPanel({ onClose }) {
  const effectiveSort = useStore((state) => resolveJavSort(state).sort)
  const sortSource = useStore((state) => resolveJavSort(state).source)
  const randomMode = useStore((state) => Boolean(state.javRandomMode))
  const setJavTempSort = useStore((state) => state.setJavTempSort)

  const chooseSort = (value) => {
    setJavTempSort?.(value)
    onClose?.()
  }

  return (
    <div className="topnav-panel" role="dialog" aria-label={zh('排序', 'Sort')}>
      <div className="topnav-panel__header">
        <span className="topnav-panel__title">{zh('排序', 'Sort')}</span>
        <button
          type="button"
          className="topnav-panel__close"
          onClick={onClose}
          aria-label={zh('关闭排序', 'Close sort')}
        >
          <CloseRoundedIcon fontSize="small" />
        </button>
      </div>
      {randomMode ? (
        <p className="topnav-panel__empty">
          {zh('随机模式使用随机顺序', 'Random mode uses a random order')}
        </p>
      ) : (
        <div className="pagination-sort-menu">
          {sortSource === 'temporary' ? (
            <button
              type="button"
              onClick={() => chooseSort('')}
              className="w-full border-b border-slate-100 px-3 py-2 text-left text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              {zh('恢复自动排序', 'Restore automatic sort')}
            </button>
          ) : null}
          {JAV_SORT_OPTIONS.map((option) => {
            const active = findSortOption([option], effectiveSort)
            const displayValue = active ? effectiveSort : option.defaultValue
            return (
              <div
                key={option.base}
                className={`pagination-sort-row ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => chooseSort(displayValue)}
                  className="pagination-sort-option"
                >
                  <SortText option={option} value={displayValue} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    chooseSort(reverseSortValue([option], displayValue, option.defaultValue))
                  }
                  className="pagination-sort-reverse"
                  title={zh('反转排序', 'Reverse sort')}
                  aria-label={zh(`反转${option.label[0]}排序`, `Reverse ${option.label[1]} sort`)}
                >
                  <SwapVertIcon fontSize="inherit" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
