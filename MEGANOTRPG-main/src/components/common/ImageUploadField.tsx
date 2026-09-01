import { useRef, useState } from "react"

import {
  deleteCampaignMediaObject,
  uploadCampaignImage,
} from "../../lib/mediaUpload"
import CampaignImage from "./CampaignImage"
import SquareImageCropper from "./SquareImageCropper"
import WideImageCropper from "./WideImageCropper"

type Props = {
  value: string
  onChange: (value: string) => void
  folder: string
  campaignId: string
  label?: string
  hint?: string
  crop?: "square" | "wide"
}

export default function ImageUploadField({
  value,
  onChange,
  folder,
  campaignId,
  label = "Арт",
  hint = "Можно выбрать изображение прямо из галереи телефона.",
  crop,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [cropFile, setCropFile] = useState<File | null>(null)
  const pendingUploadRef = useRef<string | null>(null)
  const cropMode = crop ?? (folder === "chat-previews" ? "wide" : undefined)

  async function replacePending(nextValue: string) {
    const previousPending = pendingUploadRef.current
    if (previousPending && previousPending !== nextValue) {
      await deleteCampaignMediaObject(previousPending)
    }
    pendingUploadRef.current = nextValue || null
  }

  async function upload(file: File) {
    setUploading(true)
    setError("")
    const result = await uploadCampaignImage(file, folder, campaignId)
    setUploading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    await replacePending(result.url)
    onChange(result.url)
  }

  function choose(file: File | null) {
    if (!file) return
    if (cropMode) {
      setCropFile(file)
      return
    }
    void upload(file)
  }

  async function clearValue() {
    setError("")
    if (pendingUploadRef.current) {
      await deleteCampaignMediaObject(pendingUploadRef.current)
      pendingUploadRef.current = null
    }
    onChange("")
  }

  async function setManualValue(nextValue: string) {
    if (pendingUploadRef.current && nextValue !== pendingUploadRef.current) {
      await deleteCampaignMediaObject(pendingUploadRef.current)
      pendingUploadRef.current = null
    }
    onChange(nextValue)
  }

  const previewClass = cropMode === "square"
    ? "image-upload-preview image-upload-preview--square"
    : cropMode === "wide"
      ? "image-upload-preview image-upload-preview--wide"
      : "image-upload-preview"

  const finishCrop = (croppedFile: File) => {
    setCropFile(null)
    void upload(croppedFile)
  }

  return (
    <div className="image-upload-field">
      <div className="image-upload-field__head">
        <label className="field-label">{label}</label>
        <small>{cropMode === "wide" ? "Выбери изображение и настрой, какая часть попадёт в широкое превью." : hint}</small>
      </div>

      {value && (
        <div className={previewClass}>
          <CampaignImage value={value} alt="" />
        </div>
      )}

      <div className="image-upload-actions">
        <label className={`media-file-button ${uploading ? "media-file-button--disabled" : ""}`}>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] || null
              event.currentTarget.value = ""
              choose(file)
            }}
          />
          {uploading ? "Загружаем…" : value ? "Заменить с телефона" : "Выбрать с телефона"}
        </label>

        {value && (
          <button className="media-clear-button" type="button" onClick={() => void clearValue()} disabled={uploading}>Убрать</button>
        )}
      </div>

      <details className="media-url-details">
        <summary>Или вставить ссылку</summary>
        <input className="app-input" value={value} onChange={(event) => void setManualValue(event.target.value)} placeholder="https://..." />
      </details>

      {error && <div className="auth-error">{error}</div>}

      {cropFile && cropMode === "square" && (
        <SquareImageCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={finishCrop} />
      )}
      {cropFile && cropMode === "wide" && (
        <WideImageCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={finishCrop} />
      )}
    </div>
  )
}
