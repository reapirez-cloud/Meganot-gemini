import * as React from "react"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
({ className = "", ...props }, ref) => (
  <div
    ref={ref}
    className={"rounded-2xl border border-zinc-800 bg-zinc-900 text-white " + className}
    {...props}
  />
))

Card.displayName = "Card"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
({ className = "", ...props }, ref) => (
  <div ref={ref} className={"p-5 " + className} {...props} />
))

CardContent.displayName = "CardContent"

export { Card, CardContent }
