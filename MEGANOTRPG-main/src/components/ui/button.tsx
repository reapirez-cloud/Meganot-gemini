import * as React from "react"

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
({ className = "", ...props }, ref) => (
  <button
    ref={ref}
    className={"rounded-xl bg-violet-600 px-4 py-3 text-white font-medium hover:bg-violet-500 transition " + className}
    {...props}
  />
))

Button.displayName = "Button"

export { Button }
