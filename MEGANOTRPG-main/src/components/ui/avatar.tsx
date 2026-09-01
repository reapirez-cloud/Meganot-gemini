import React from "react"

export function Avatar({children}:{children:React.ReactNode}) {
  return (
    <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
      {children}
    </div>
  )
}

export function AvatarFallback({children}:{children:React.ReactNode}) {
  return <span className="text-sm font-bold">{children}</span>
}
