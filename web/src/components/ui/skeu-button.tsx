"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const skeuButtonVariants = cva(
  "skeu-button skeu-scanlines skeu-top-edge inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: "skeu-variant-primary",
        secondary: "skeu-variant-secondary",
        ghost: "skeu-variant-ghost",
        outline: "skeu-variant-outline",
        destructive: "skeu-variant-destructive",
      },
      size: {
        sm: "h-8 rounded-lg px-4 text-xs gap-1.5",
        default: "h-10 rounded-xl px-5 text-sm",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "size-10 rounded-xl p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

interface SkeuButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof skeuButtonVariants> {
  asChild?: boolean
  loading?: boolean
  icon?: React.ReactNode
}

function SkeuButton({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  icon,
  children,
  disabled,
  ...props
}: SkeuButtonProps) {
  const Comp = asChild ? Slot : "button"
  const isDisabled = disabled || loading

  return (
    <Comp
      data-slot="skeu-button"
      className={cn(skeuButtonVariants({ variant, size, className }))}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin relative z-[2]" />
          <span className="relative z-[2]">{children}</span>
        </>
      ) : (
        <>
          {icon && <span className="relative z-[2]">{icon}</span>}
          {children}
        </>
      )}
    </Comp>
  )
}

export { SkeuButton, skeuButtonVariants }
export type { SkeuButtonProps }
