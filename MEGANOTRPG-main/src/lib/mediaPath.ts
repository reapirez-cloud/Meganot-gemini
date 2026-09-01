export const CAMPAIGN_MEDIA_BUCKET = "campaign-media"

export function campaignMediaPath(value: string | null | undefined) {
  const cleaned = value?.trim()
  if (!cleaned) return null

  if (!cleaned.includes("://") && !cleaned.startsWith("data:")) {
    return cleaned.replace(/^\/+/, "")
  }

  try {
    const url = new URL(cleaned)
    const markers = [
      `/storage/v1/object/public/${CAMPAIGN_MEDIA_BUCKET}/`,
      `/storage/v1/object/sign/${CAMPAIGN_MEDIA_BUCKET}/`,
      `/storage/v1/object/authenticated/${CAMPAIGN_MEDIA_BUCKET}/`,
    ]
    const marker = markers.find((candidate) => url.pathname.includes(candidate))
    if (!marker) return null
    const encodedPath = url.pathname.split(marker)[1]
    return encodedPath ? decodeURIComponent(encodedPath) : null
  } catch {
    return null
  }
}

export function isExternalMedia(value: string | null | undefined) {
  const cleaned = value?.trim() || ""
  return Boolean(cleaned && !campaignMediaPath(cleaned))
}
