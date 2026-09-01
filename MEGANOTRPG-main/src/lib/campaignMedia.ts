import { supabase } from "./supabase"
import {
  CAMPAIGN_MEDIA_BUCKET,
  campaignMediaPath,
} from "./mediaPath"
export { campaignMediaPath, isExternalMedia } from "./mediaPath"

const SIGNED_TTL_SECONDS = 60 * 60
const signedUrlCache = new Map<
  string,
  { url: string; refreshAfter: number }
>()

export async function resolveCampaignMediaUrl(
  value: string | null | undefined,
) {
  const cleaned = value?.trim()
  if (!cleaned) return null

  const path = campaignMediaPath(cleaned)
  if (!path) return cleaned

  const cached = signedUrlCache.get(path)
  if (cached && cached.refreshAfter > Date.now()) return cached.url

  const { data, error } = await supabase.storage
    .from(CAMPAIGN_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    // Public URLs remain a valid compatibility fallback until the final
    // private-bucket migration is applied.
    return cleaned.includes("://") ? cleaned : null
  }

  signedUrlCache.set(path, {
    url: data.signedUrl,
    refreshAfter: Date.now() + (SIGNED_TTL_SECONDS - 120) * 1000,
  })
  return data.signedUrl
}
