"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const sizeMap = {
  sm: "h-8 text-xs px-2.5",
  default: "h-10 text-sm px-4",
  lg: "h-12 text-base px-6",
} as const

type SegmentSize = keyof typeof sizeMap

const variantMap = {
  primary: "skeu-variant-primary",
  secondary: "skeu-variant-secondary",
  accent: "skeu-variant-accent",
} as const

type SegmentVariant = keyof typeof variantMap

interface Segment {
  value: string
  label: string
  icon?: React.ReactNode
}

interface SegmentToggleProps {
  value: string
  onValueChange: (value: string) => void
  segments: Segment[]
  variant?: SegmentVariant
  size?: SegmentSize
  className?: string
  /** Unique layout ID scope — required when multiple SegmentToggles are in the same view */
  layoutId?: string
}

function SegmentToggle({
  value,
  onValueChange,
  segments,
  variant = "primary",
  size = "default",
  className,
  layoutId = "segment-toggle",
}: SegmentToggleProps) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "skeu-segment-rail inline-flex items-center gap-1 p-1",
        variantMap[variant],
        className
      )}
    >
      {segments.map((seg) => {
        const isActive = seg.value === value

        return (
          <button
            key={seg.value}
            role="radio"
            aria-checked={isActive}
            type="button"
            onClick={() => onValueChange(seg.value)}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 font-medium rounded-[calc(var(--radius-lg)-4px)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors cursor-pointer select-none z-[1]",
              sizeMap[size],
              isActive
                ? "text-[var(--skeu-base,var(--primary))]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {/* Animated active pill */}
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="skeu-segment-pill skeu-scanlines absolute inset-0"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}

            {seg.icon && (
              <span className="relative z-[2] [&_svg]:size-4">{seg.icon}</span>
            )}
            <span className="relative z-[2]">{seg.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export { SegmentToggle }
export type { SegmentToggleProps, Segment, SegmentVariant, SegmentSize }
