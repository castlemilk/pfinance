"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Power } from "lucide-react"

import { cn } from "@/lib/utils"

const sizeMap = {
  sm: { well: "size-8", icon: "size-3.5" },
  default: { well: "size-11", icon: "size-5" },
  lg: { well: "size-14", icon: "size-6" },
} as const

type PowerToggleSize = keyof typeof sizeMap

const variantMap = {
  primary: "skeu-variant-primary",
  secondary: "skeu-variant-secondary",
  accent: "skeu-variant-accent",
  destructive: "skeu-variant-destructive",
} as const

type PowerToggleVariant = keyof typeof variantMap

interface PowerToggleProps {
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  variant?: PowerToggleVariant
  size?: PowerToggleSize
  disabled?: boolean
  className?: string
}

function PowerToggle({
  pressed = false,
  onPressedChange,
  variant = "primary",
  size = "default",
  disabled = false,
  className,
}: PowerToggleProps) {
  const s = sizeMap[size]

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={pressed}
      disabled={disabled}
      onClick={() => onPressedChange?.(!pressed)}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "skeu-power-well skeu-scanlines relative inline-flex items-center justify-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer select-none",
        variantMap[variant],
        s.well,
        className
      )}
    >
      {/* Glow ring when active */}
      {pressed && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow:
              "0 0 10px color-mix(in oklch, var(--skeu-base, var(--primary)) 40%, transparent), 0 0 20px color-mix(in oklch, var(--skeu-base, var(--primary)) 20%, transparent)",
          }}
        />
      )}

      {/* Power icon */}
      <Power
        className={cn(
          s.icon,
          "relative z-[2] transition-colors duration-200",
          pressed
            ? "text-[var(--skeu-base,var(--primary))]"
            : "text-muted-foreground"
        )}
        strokeWidth={2.5}
      />

      {/* Active bottom LED glow */}
      {pressed && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-0.5 w-2 h-0.5 rounded-full"
          style={{
            background: "var(--skeu-base, var(--primary))",
            boxShadow:
              "0 0 4px var(--skeu-base, var(--primary)), 0 0 8px color-mix(in oklch, var(--skeu-base, var(--primary)) 40%, transparent)",
          }}
        />
      )}
    </motion.button>
  )
}

export { PowerToggle }
export type { PowerToggleProps, PowerToggleVariant, PowerToggleSize }
