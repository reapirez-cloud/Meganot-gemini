import type { CSSProperties, ReactNode } from "react"

import { useCampaignMedia } from "../../hooks/useCampaignMedia"

type Props = {
  value: string | null | undefined
  className?: string
  overlay?: string
  children?: ReactNode
}

export default function CampaignBackground({ value, className, overlay, children }: Props) {
  const url = useCampaignMedia(value)
  const style: CSSProperties | undefined = url
    ? { backgroundImage: `${overlay ? `${overlay}, ` : ""}url("${url.replace(/"/g, "%22")}")` }
    : undefined
  return <div className={className} style={style}>{children}</div>
}
