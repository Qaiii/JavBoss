import { useEffect, useRef } from 'react'
import { zh } from '@/utils/i18n'

// 本组件按设计承载“点击遮罩关闭”与“面板内点击不冒泡”两类交互，
// 遮罩与面板均为静态容器，故在此整体豁免相关 a11y 规则。
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */

// 与视频窗口（PlayerModal）关闭按钮一致的样式：右上角黑色半透明圆形 × 按钮
const CLOSE_BUTTON_CLASS =
  'rounded-full bg-black/60 px-2 py-1 text-sm text-white transition-colors hover:bg-black/80'

/**
 * 弹窗通用外壳：统一遮罩、标题栏与关闭按钮（样式与视频窗口一致），
 * 并支持 Esc 关闭。嵌套弹窗（如重命名、新增等子对话框）在 Esc 事件上
 * stopPropagation，保证 Esc 只关闭最内层窗口。
 */
export default function ModalShell({
  open = true,
  onClose,
  onBackdropClick,
  title,
  subtitle,
  headerActions,
  children,
  panelClassName = 'w-full max-w-md rounded-lg bg-white p-4 shadow-xl',
  backdropClassName = 'bg-black/30',
  zIndexClassName = 'z-50',
  headerClassName = 'mb-3 flex items-center justify-between gap-4',
  titleClassName = 'text-base font-semibold',
  subtitleClassName = 'mt-0.5 text-xs text-gray-500',
  closeButtonClassName = '',
  closeDisabled = false,
  closeLabel,
  titleId,
  panelRole = false,
}) {
  const panelRef = useRef(null)

  // Esc 关闭。焦点位于其它弹窗面板内时不关闭，保证叠层窗口逐层关闭；
  // 嵌套弹窗（如重命名、新增等子对话框）在 Esc 事件上 stopPropagation，
  // 因此 Esc 只关闭最内层窗口。
  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof Element) {
        const shell = target.closest('[data-modal-shell]')
        if (shell && shell !== panelRef.current) return
      }
      event.preventDefault()
      onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // 打开时聚焦面板，确保随后按 Esc 关闭的是最上层窗口
  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.focus({ preventScroll: true })
    return undefined
  }, [open])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${zIndexClassName} ${backdropClassName}`}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        data-modal-shell
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`outline-none ${panelClassName}`}
        {...(panelRole ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId } : {})}
      >
        <div className={`shrink-0 ${headerClassName}`}>
          <div className="min-w-0">
            <h2 id={titleId} className={`truncate ${titleClassName}`}>
              {title}
            </h2>
            {subtitle ? <div className={`truncate ${subtitleClassName}`}>{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label={closeLabel || zh('关闭', 'Close')}
              className={`${CLOSE_BUTTON_CLASS} ${closeDisabled ? 'opacity-50' : ''} ${closeButtonClassName}`}
            >
              ×
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
