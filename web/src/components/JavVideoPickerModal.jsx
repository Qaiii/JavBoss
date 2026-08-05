import ModalShell from '@/components/ModalShell'
import { zh } from '@/utils/i18n'
import { getJavDisplayTitle } from '@/utils/jav'

export default function JavVideoPickerModal({
  open,
  title,
  onClose,
  item,
  choices,
  emptyText,
  action,
  buildVideoFullPath,
  isVideoOpenable,
  onSelectVideo,
}) {
  const list = Array.isArray(choices) ? choices : []
  const itemTitle = item ? getJavDisplayTitle(item) : ''

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={zh('关闭选择', 'Close picker')}
      zIndexClassName="z-[1700]"
      panelClassName="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl"
      headerClassName="mb-3 flex items-center justify-between gap-4"
    >
      {item && (
        <div className="mb-2 text-xs text-gray-500">
          {item.code || zh('未知番号', 'Unknown code')}
          {itemTitle && itemTitle !== item.code ? ` · ${itemTitle}` : ''}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto rounded border">
        {list.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">{emptyText}</div>
        ) : (
          list.map((video) => {
            const fullPath = buildVideoFullPath ? buildVideoFullPath(video) : ''
            const label =
              fullPath || video?.filename || video?.path || zh('未命名文件', 'Untitled file')
            const canSelect = action === 'play' ? true : isVideoOpenable?.(video)
            return (
              <button
                key={video?.location_id || video?.id || label}
                type="button"
                onClick={() => onSelectVideo?.(video)}
                disabled={!canSelect}
                className={`flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                  canSelect ? 'hover:bg-gray-50' : 'cursor-not-allowed text-gray-400'
                }`}
                title={label}
              >
                <span className="truncate">{label}</span>
              </button>
            )
          })
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
          {zh('关闭', 'Close')}
        </button>
      </div>
    </ModalShell>
  )
}
