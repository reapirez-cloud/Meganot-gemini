import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { createPortal } from "react-dom"

type Point = { x: number; y: number }

type Props = {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => void
}

const OUTPUT_SIZE = 1200
const MAX_ZOOM = 3

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function croppedName(name: string) {
  const stem = name.replace(/\.[^.]+$/, "") || "portrait"
  return `${stem}-square.webp`
}

export default function SquareImageCropper({ file, onCancel, onConfirm }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{
    pointerId: number
    origin: Point
    offset: Point
  } | null>(null)
  const [sourceUrl] = useState(() => URL.createObjectURL(file))
  const [frameSize, setFrameSize] = useState(0)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    return () => URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const update = () => setFrameSize(frame.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const baseScale =
    frameSize > 0 && imageSize.width > 0 && imageSize.height > 0
      ? Math.max(frameSize / imageSize.width, frameSize / imageSize.height)
      : 1

  const displayWidth = imageSize.width * baseScale * zoom
  const displayHeight = imageSize.height * baseScale * zoom
  const maxOffsetX = Math.max(0, (displayWidth - frameSize) / 2)
  const maxOffsetY = Math.max(0, (displayHeight - frameSize) / 2)

  const clampOffset = useCallback(
    (point: Point): Point => ({
      x: clamp(point.x, -maxOffsetX, maxOffsetX),
      y: clamp(point.y, -maxOffsetY, maxOffsetY),
    }),
    [maxOffsetX, maxOffsetY],
  )

  const constrainedOffset = clampOffset(offset)

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!imageSize.width) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      offset: constrainedOffset,
    }
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clampOffset({
      x: drag.offset.x + event.clientX - drag.origin.x,
      y: drag.offset.y + event.clientY - drag.origin.y,
    }))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  async function applyCrop() {
    const image = imageRef.current
    if (!image || !frameSize || !imageSize.width) return

    setSaving(true)
    setError("")

    try {
      const renderedScale = baseScale * zoom
      const imageLeft = frameSize / 2 - displayWidth / 2 + constrainedOffset.x
      const imageTop = frameSize / 2 - displayHeight / 2 + constrainedOffset.y
      const sourceX = clamp(-imageLeft / renderedScale, 0, imageSize.width)
      const sourceY = clamp(-imageTop / renderedScale, 0, imageSize.height)
      const sourceSide = Math.min(
        frameSize / renderedScale,
        imageSize.width - sourceX,
        imageSize.height - sourceY,
      )

      const canvas = document.createElement("canvas")
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Браузер не смог подготовить изображение.")

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = "high"
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSide,
        sourceSide,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      )

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      )
      if (!blob) throw new Error("Не удалось сохранить выбранный квадрат.")

      onConfirm(new File([blob], croppedName(file.name), {
        type: "image/webp",
        lastModified: Date.now(),
      }))
    } catch (cropError) {
      setError(
        cropError instanceof Error
          ? cropError.message
          : "Не удалось обработать изображение.",
      )
      setSaving(false)
    }
  }

  return createPortal(
    <div className="portrait-crop-backdrop" role="dialog" aria-modal="true" aria-labelledby="portrait-crop-title">
      <div className="portrait-crop-sheet">
        <header className="portrait-crop-head">
          <div>
            <span>Портрет персонажа</span>
            <h3 id="portrait-crop-title">Выбери квадрат</h3>
            <p>Перемещай изображение внутри рамки и настрой масштаб.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Закрыть кадрирование">×</button>
        </header>

        <div
          className="portrait-crop-frame"
          ref={frameRef}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {sourceUrl && (
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Предпросмотр портрета"
              draggable={false}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
                setOffset({ x: 0, y: 0 })
                setZoom(1)
              }}
              style={{
                width: displayWidth || undefined,
                height: displayHeight || undefined,
                transform: `translate(-50%, -50%) translate(${constrainedOffset.x}px, ${constrainedOffset.y}px)`,
              }}
            />
          )}
          <span className="portrait-crop-frame__shade" aria-hidden="true" />
          <span className="portrait-crop-frame__grid" aria-hidden="true" />
        </div>

        <label className="portrait-crop-zoom">
          <span>Масштаб</span>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <strong>{Math.round(zoom * 100)}%</strong>
        </label>

        {error && <div className="auth-error">{error}</div>}

        <div className="portrait-crop-actions">
          <button type="button" className="portrait-crop-cancel" onClick={onCancel} disabled={saving}>
            Отмена
          </button>
          <button type="button" className="portrait-crop-apply" onClick={() => void applyCrop()} disabled={saving || !imageSize.width}>
            {saving ? "Готовим…" : "Использовать квадрат"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
