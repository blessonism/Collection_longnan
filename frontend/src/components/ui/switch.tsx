import * as React from "react"

import { cn } from "@/lib/utils"

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, checked, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        style={{
          width: 51,
          height: 31,
          backgroundColor: checked ? "#1e293b" : "#e2e8f0",
        }}
      >
        <span
          className="pointer-events-none inline-block rounded-full transition-transform duration-200 ease-in-out"
          style={{
            width: 27,
            height: 27,
            backgroundColor: "#ffffff",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)",
            transform: checked ? "translateX(22px)" : "translateX(2px)",
          }}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
