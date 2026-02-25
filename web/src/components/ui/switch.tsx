"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "skeu-toggle-track skeu-scanlines skeu-variant-primary peer relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-[2px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "skeu-toggle-thumb pointer-events-none flex items-center justify-center size-5 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      >
        <span className="skeu-grip" />
      </SwitchPrimitive.Thumb>
      {/* LED indicators — on-dot (left), off-ring (right) */}
      <span className="skeu-indicator-on" style={{ left: 8 }} />
      <span className="skeu-indicator-off" style={{ right: 8 }} />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
