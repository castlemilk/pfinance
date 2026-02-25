"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const sizeMap = {
  sm: { track: "w-10 h-5", thumb: "size-4", translate: 20 },
  default: { track: "w-14 h-7", thumb: "size-6", translate: 28 },
  lg: { track: "w-18 h-9", thumb: "size-8", translate: 36 },
} as const

type SkeuToggleSize = keyof typeof sizeMap

const variantMap = {
  primary: "skeu-variant-primary",
  secondary: "skeu-variant-secondary",
  accent: "skeu-variant-accent",
} as const

type SkeuToggleVariant = keyof typeof variantMap

interface SkeuToggleProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  variant?: SkeuToggleVariant
  size?: SkeuToggleSize
  disabled?: boolean
  label?: string
  sublabel?: string
  className?: string
}

function SkeuToggle({
  checked = false,
  onCheckedChange,
  variant = "primary",
  size = "default",
  disabled = false,
  label,
  sublabel,
  className,
}: SkeuToggleProps) {
  const s = sizeMap[size]

  const toggle = (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "skeu-toggle-track skeu-scanlines relative inline-flex shrink-0 items-center rounded-full p-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
        variantMap[variant],
        s.track,
        className
      )}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          className={cn("skeu-toggle-thumb block rounded-full", s.thumb)}
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          data-state={checked ? "checked" : "unchecked"}
        >
          <span className="skeu-grip" />
        </motion.span>
      </SwitchPrimitive.Thumb>

      {/* LED indicators — on-dot (left), off-ring (right) */}
      <span
        className="skeu-indicator-on"
        style={{
          left: size === "sm" ? 4 : size === "lg" ? 8 : 6,
        }}
      />
      <span
        className="skeu-indicator-off"
        style={{
          right: size === "sm" ? 4 : size === "lg" ? 8 : 6,
        }}
      />
    </SwitchPrimitive.Root>
  )

  if (!label) return toggle

  return (
    <label
      className={cn(
        "inline-flex items-center gap-3",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {toggle}
      <div className="flex flex-col">
        <span className="text-sm font-medium leading-tight">{label}</span>
        {sublabel && (
          <span className="text-xs text-muted-foreground">{sublabel}</span>
        )}
      </div>
    </label>
  )
}

export { SkeuToggle }
export type { SkeuToggleProps, SkeuToggleVariant, SkeuToggleSize }
