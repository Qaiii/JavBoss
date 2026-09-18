import { useLayoutEffect, useRef } from 'react'
import { popOverlayHistory, pushOverlayHistory } from '@/utils/overlayHistory'

export default function useOverlayHistory(active, onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const wasActiveRef = useRef(false)

  useLayoutEffect(() => {
    if (!active) return undefined
    pushOverlayHistory()
    const handlePopState = () => {
      onCloseRef.current?.()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [active])

  useLayoutEffect(() => {
    if (active) {
      wasActiveRef.current = true
      return
    }
    if (!wasActiveRef.current) return
    wasActiveRef.current = false
    popOverlayHistory()
  }, [active])
}
