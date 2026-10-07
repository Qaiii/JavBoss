import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { useStore } from '@/store'
import { JAV_LIBRARY_SCOPE_OPTIONS, normalizeJavLibraryScope } from '@/utils/javLibrary'
import { zh } from '@/utils/i18n'

/**
 * Library-scope selector shown inside the top navigation's "更多" panel, replacing the
 * former in-page 已入库 / 全部 / 未入库 row on the works list.
 */
export default function JavLibraryScopePanel({ onClose }) {
  const libraryScope = useStore((state) => normalizeJavLibraryScope(state.javLibraryScope))
  const setJavLibraryScope = useStore((state) => state.setJavLibraryScope)

  return (
    <div className="topnav-panel" role="dialog" aria-label={zh('入库', 'Library scope')}>
      <div className="topnav-panel__header">
        <span className="topnav-panel__title">{zh('入库', 'Library scope')}</span>
        <button
          type="button"
          className="topnav-panel__close"
          onClick={onClose}
          aria-label={zh('关闭入库范围', 'Close library scope')}
        >
          <CloseRoundedIcon fontSize="small" />
        </button>
      </div>
      <div className="topnav-panel__body">
        <div
          className="jav-library-scope"
          role="radiogroup"
          aria-label={zh('作品入库范围', 'Library scope')}
        >
          {JAV_LIBRARY_SCOPE_OPTIONS.map((option) => {
            const active = libraryScope === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={active ? 'is-active' : undefined}
                onClick={() => {
                  if (active) return
                  setJavLibraryScope?.(option.value)
                  onClose?.()
                }}
              >
                {zh(option.label[0], option.label[1])}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
