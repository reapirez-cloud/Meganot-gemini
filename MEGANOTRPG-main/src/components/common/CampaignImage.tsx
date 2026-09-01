import type { ImgHTMLAttributes, ReactNode } from "react"

import { useCampaignMedia } from "../../hooks/useCampaignMedia"

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  value: string | null | undefined
  fallback?: ReactNode
}

export default function CampaignImage({ value, fallback = null, ...props }: Props) {
  const url = useCampaignMedia(value)
  if (!url) return fallback
  return <img {...props} src={url} />
}
