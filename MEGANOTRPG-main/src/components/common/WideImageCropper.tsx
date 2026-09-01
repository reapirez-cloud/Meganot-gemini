import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { createPortal } from "react-dom"
import "./WideImageCropper.css"

type Point = { x: number; y: number }
type Props = { file: File; onCancel: () => void; onConfirm: (file: File) => void }

const OUTPUT_WIDTH = 1600
const OUTPUT_HEIGHT = 900
const MAX_ZOOM = 3

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function croppedName(name: string) {
  const stem = name.replace(/\.[^.]+$/, "") || "preview"
  return `${stem}-preview.webp`
}

export default function WideImageCropper({ file, onCancel, onConfirm }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ pointerId: number; origin: Point; offset: Point } | null>(null)
  const [sourceUrl] = useState(() => URL.createObjectURL(file))
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl])

  useLayoutEffect(() => {
    const node = frameRef.current
    if (!node) return
    const update = () => {
      const rect = node.getBoundingClientRect()
      setFrame({ width: rect.width, height: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const baseScale = frame.width > 0 && frame.height > 0 && imageSize.width > 0 && imageSize.height > 0
    ? Math.max(frame.width / imageSize.width, frame.height / imageSize.height)
    : 1
  const displayWidth = imageSize.width * baseScale * zoom
  const displayHeight = imageSize.height * baseScale * zoom
  const maxOffsetX = Math.max(0, (displayWidth - frame.width) / 2)
  const maxOffsetY = Math.max(0, (displayHeight - frame.height) / 2)

  const clampOffset = useCallback((point: Point): Point => ({
    x: clamp(point.x, -maxOffsetX, maxOffsetX),
    y: clamp(point.y, -maxOffsetY, maxOffsetY),
  }), [maxOffsetX, maxOffsetY])

  const constrainedOffset = clampOffset(offset)

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!imageSize.width) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, origin: { x: event.clientX, y: event.clientY }, offset: constrainedOffset }
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clampOffset({ x: drag.offset.x + event.clientX - drag.origin.x, y: drag.offset.y + event.clientY - drag.origin.y }))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  async function applyCrop() {
    const image = imageRef.current
    if (!image || !frame.width || !frame.height || !imageSize.width) return
    setSaving(true)
    setError("")

    try {
      const renderedScale = baseScale * zoom
      const imageLeft = frame.width / 2 - displayWidth / 2 + constrainedOffset.x
      const imageTop = frame.height / 2 - displayHeight / 2 + constrainedOffset.y
      const sourceX = clamp(-imageLeft / renderedScale, 0, imageSize.width)
      const sourceY = clamp(-imageTop / renderedScale, 0, imageSize.height)
      const sourceWidth = Math.min(frame.width / renderedScale, imageSize.width - sourceX)
      const sourceHeight = Math.min(frame.height / renderedScale, imageSize.height - sourceY)

      const canvas = document.createElement("canvas")
      canvas.width = OUTPUT_WIDTH
      canvas.height = OUTPUT_HEIGHT
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Браузер не смог подготовить изображение.")
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = "high"
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .9))
      if (!blob) throw new Error("Не удалось сохранить выбранное превью.")
      onConfirm(new File([blob], croppedName(file.name), { type: "image/webp", lastModified: Date.now() }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось обработать изображение.")
      setSaving(false)
    }
  }

  return createPortal(
    <div className="wide-crop__backdrop" role="dialog" aria-modal="true" aria-labelledby="wide-crop-title">
      <section className="wide-crop__sheet">
        <header className="wide-crop__head">
          <div><span>Превью чата</span><h3 id="wide-crop-title">Выбери кадр</h3><p>Перемещай изображение внутри широкой рамки и настрой масштаб.</p></div>
          <button type="button" onClick={onCancel} aria-label="Закрыть кадрирование">×</button>
        </header>

        <div className="wide-crop__frame" ref={frameRef} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <img
            ref={imageRef}
            src={sourceUrl}
            alt="Предпросмотр кадра"
            draggable={false}
            onLoad={(event) => {
              setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
              setOffset({ x: 0, y: 0 })
              setZoom(1)
            }}
            style={{ width: displayWidth || undefined, height: displayHeight || undefined, transform: `translate(-50%, -50%) translate(${constrainedOffset.x}px, ${constrainedOffset.y}px)` }}
          />
          <span className="wide-crop__shade" aria-hidden="true" />
          <span className="wide-crop__grid" aria-hidden="true" />
        </div>

        <label className="wide-crop__zoom"><span>Масштаб</span><input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><strong>{Math.round(zoom * 100)}%</strong></label>
        {error && <div className="auth-error">{error}</div>}
        <footer className="wide-crop__actions"><button type="button" onClick={onCancel} disabled={saving}>Отмена</button><button type="button" className="is-primary" onClick={() => void applyCrop()} disabled={saving || !imageSize.width}>{saving ? "Готовим…" : "Использовать превью"}</button></footer>
      </section>
    </div>,
    document.body,
  )
}
