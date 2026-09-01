import { supabase } from "./supabase"

const BUCKET = "campaign-media"
const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024
const MAX_UPLOAD_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_FILE_BYTES = 20 * 1024 * 1024
const RESIZE_THRESHOLD_BYTES = 2.5 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2560

export type UploadImageResult = {
  ok: boolean
  url?: string
  error?: string
}

export type UploadFileResult = UploadImageResult

function extensionFor(file: File) {
  const fromName = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")

  if (fromName && fromName.length <= 5) return fromName

  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  }

  return mimeMap[file.type] || "jpg"
}

function contentTypeForExtension(extension: string) {
  const canonicalByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  }

  return canonicalByExtension[extension] || null
}

async function optimizeCampaignImage(file: File): Promise<File> {
  if (
    typeof createImageBitmap !== "function" ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const largestSide = Math.max(bitmap.width, bitmap.height)
    if (file.size <= RESIZE_THRESHOLD_BYTES && largestSide <= MAX_IMAGE_DIMENSION) {
      return file
    }

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(1, largestSide))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return file

    context.drawImage(bitmap, 0, 0, width, height)
    const outputType = file.type === "image/png" ? "image/webp" : file.type
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, outputType === "image/png" ? undefined : 0.86),
    )

    if (!blob || blob.size >= file.size) return file

    const stem = file.name.replace(/\.[^.]+$/, "") || "image"
    const extension = outputType === "image/webp" ? "webp" : "jpg"
    return new File([blob], `${stem}.${extension}`, {
      type: outputType,
      lastModified: file.lastModified,
    })
  } finally {
    bitmap.close()
  }
}

function cleanupPaths(values: Array<string | null | undefined>) {
  return [...new Set(
    values
      .map((value) => value?.trim() || "")
      .filter((path) => path.length > 0 && !path.includes("://")),
  )]
}

export async function deleteCampaignMediaObjects(
  values: Array<string | null | undefined>,
) {
  const paths = cleanupPaths(values)
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) console.warn("Campaign media cleanup failed:", error.message)
}

export async function deleteCampaignMediaObject(value: string | null | undefined) {
  await deleteCampaignMediaObjects([value])
}

export async function uploadCampaignImage(
  file: File,
  folder: string,
  campaignId: string,
): Promise<UploadImageResult> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Выбери файл изображения." }
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, error: "Исходное изображение слишком большое. Максимум 30 МБ." }
  }

  if (!campaignId) {
    return { ok: false, error: "Кампания ещё не загружена." }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: "Не удалось определить текущего пользователя." }
  }

  const optimized = await optimizeCampaignImage(file)
  if (optimized.size > MAX_UPLOAD_IMAGE_BYTES) {
    return {
      ok: false,
      error: "После обработки изображение всё ещё слишком большое. Максимум 12 МБ.",
    }
  }

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "-") || "misc"
  const id =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const objectPath = `${campaignId}/${userData.user.id}/${safeFolder}/${id}.${extensionFor(optimized)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, optimized, {
      cacheControl: "3600",
      upsert: false,
      contentType: optimized.type || undefined,
    })

  if (uploadError) {
    return { ok: false, error: uploadError.message }
  }

  return { ok: true, url: objectPath }
}

export async function uploadCampaignFile(
  file: File,
  folder: string,
  campaignId: string,
): Promise<UploadFileResult> {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Файл слишком большой. Максимум 20 МБ." }
  }

  if (!campaignId) {
    return { ok: false, error: "Кампания ещё не загружена." }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: "Не удалось определить текущего пользователя." }
  }

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "-") || "files"
  const id =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "bin"
  const contentType = contentTypeForExtension(extension)
  if (!contentType) {
    return { ok: false, error: "Этот формат файла пока не поддерживается." }
  }
  const objectPath = `${campaignId}/${userData.user.id}/${safeFolder}/${id}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    })

  if (uploadError) {
    return { ok: false, error: uploadError.message }
  }

  return { ok: true, url: objectPath }
}
