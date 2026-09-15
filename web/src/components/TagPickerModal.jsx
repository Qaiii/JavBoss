import { useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import { Button } from '@mui/material'
import AppModal from '@/components/AppModal'
import { getErrorMessage } from '@/utils/errors'
import { zh } from '@/utils/i18n'

export default function TagPickerModal({
  open,
  tags,
  selectedIds,
  onToggleChoice,
  onCreateTag,
  onClose,
  onSave,
  saveDisabled,
}) {
  const [newTagName, setNewTagName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    if (open) return
    setNewTagName('')
    setCreating(false)
    setCreateError('')
  }, [open])

  if (!open) return null

  const list = Array.isArray(tags) ? tags : []
  const selected = Array.isArray(selectedIds) ? selectedIds : []

  const handleCreate = async (event) => {
    event.preventDefault()
    const name = newTagName.trim()
    if (!name || creating) return
    setCreating(true)
    setCreateError('')
    try {
      const tag = await onCreateTag?.(name)
      if (tag?.id) onToggleChoice?.(tag.id, true)
      setNewTagName('')
    } catch (error) {
      setCreateError(getErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppModal
      ariaLabel={zh('选择标签', 'Choose Tags')}
      className="px-4"
      closeDisabled={creating}
      contentClassName="w-full max-w-xs rounded-2xl bg-app-surface p-4 shadow-xl"
      onClose={onClose}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{zh('选择标签', 'Choose Tags')}</h2>
        <button
          onClick={onClose}
          disabled={creating}
          className="rounded px-2 py-1 text-app-muted hover:bg-app-surface-2"
          aria-label={zh('关闭标签选择', 'Close Tag Picker')}
        >
          ✕
        </button>
      </div>
      <form onSubmit={handleCreate} className="mb-3 flex gap-2">
        <input
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          placeholder={zh('新建标签', 'New tag')}
          className="focus:ring-app-gold/25 min-w-0 flex-1 rounded border border-app-border px-3 py-2 text-sm outline-none focus:border-app-gold focus:ring-2"
          disabled={creating}
        />
        <Button
          type="submit"
          variant="outlined"
          startIcon={<AddRoundedIcon fontSize="small" />}
          disabled={!newTagName.trim() || creating}
        >
          {zh('新建', 'Create')}
        </Button>
      </form>
      {createError ? <div className="mb-3 text-sm text-red-600">{createError}</div> : null}
      <div className="max-h-64 space-y-1 overflow-y-auto rounded border p-2">
        {list.map((tag) => {
          const checked = selected.includes(String(tag.id))
          return (
            <label
              key={`${tag.id}-${tag.provider || 0}`}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-app-surface-2"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={creating}
                onChange={(e) => onToggleChoice?.(tag.id, e.target.checked)}
              />
              <span className="text-sm text-app-text">{tag.name}</span>
            </label>
          )
        })}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={creating}
          className="rounded border px-3 py-1.5 text-sm hover:bg-app-surface-2 disabled:opacity-50"
        >
          {zh('取消', 'Cancel')}
        </button>
        <button
          onClick={onSave}
          className="rounded bg-app-gold px-3 py-1.5 text-sm text-white hover:bg-app-gold-hover disabled:opacity-50"
          disabled={saveDisabled || creating}
        >
          {zh('保存', 'Save')}
        </button>
      </div>
    </AppModal>
  )
}
