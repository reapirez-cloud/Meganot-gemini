import { useCallback, useEffect, useRef } from "react"
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"

export function useLongPressItem<T>(
  onLongPress: (item: T) => void,
  delay = 480,
) {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const suppressTargetRef = useRef<HTMLElement | null>(null)
  const lastLongPressAtRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  return useCallback(
    (item: T) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return

        clearTimer()
        suppressTargetRef.current = null
        startRef.current = { x: event.clientX, y: event.clientY }
        const target = event.currentTarget

        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          suppressTargetRef.current = target
          lastLongPressAtRef.current = Date.now()
          navigator.vibrate?.(18)
          onLongPress(item)
        }, delay)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const start = startRef.current
        if (!start) return

        if (
          Math.hypot(
            event.clientX - start.x,
            event.clientY - start.y,
          ) > 12
        ) {
          clearTimer()
          startRef.current = null
        }
      },
      onPointerUp: () => {
        clearTimer()
        startRef.current = null
      },
      onPointerCancel: () => {
        clearTimer()
        startRef.current = null
      },
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        event.preventDefault()
        clearTimer()

        if (Date.now() - lastLongPressAtRef.current < 900) return

        suppressTargetRef.current = event.currentTarget
        lastLongPressAtRef.current = Date.now()
        onLongPress(item)
      },
      onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
        if (suppressTargetRef.current !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        suppressTargetRef.current = null
      },
    }),
    [clearTimer, delay, onLongPress],
  )
}
