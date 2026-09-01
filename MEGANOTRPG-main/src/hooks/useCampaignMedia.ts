import { useEffect, useState } from "react"

import {
  isExternalMedia,
  resolveCampaignMediaUrl,
} from "../lib/campaignMedia"

export function useCampaignMedia(value: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() =>
    isExternalMedia(value) ? value?.trim() || null : null,
  )

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setUrl(isExternalMedia(value) ? value?.trim() || null : null)
    })
    void resolveCampaignMediaUrl(value).then((nextUrl) => {
      if (active) setUrl(nextUrl)
    })
    return () => {
      active = false
    }
  }, [value])

  return url
}
