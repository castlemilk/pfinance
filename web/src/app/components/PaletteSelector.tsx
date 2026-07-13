'use client';

import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { PALETTES, PaletteId } from '../constants/palettes';
import { Button } from '@/components/ui/button';
import { Palette } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ColorSwatchProps {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  size?: 'sm' | 'md';
}

function ColorSwatch({ colors, size = 'md' }: ColorSwatchProps) {
  const sizeClasses = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div aria-hidden="true" className="flex -space-x-1">
      <div
        className={`${sizeClasses} rounded-full border border-background`}
        style={{ backgroundColor: colors.primary }}
      />
      <div
        className={`${sizeClasses} rounded-full border border-background`}
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        className={`${sizeClasses} rounded-full border border-background`}
        style={{ backgroundColor: colors.accent }}
      />
    </div>
  );
}

export function PaletteSelector() {
  const { palette, setPalette } = useTheme();
  const reduceMotion = useReducedMotion();

  const currentPalette = PALETTES.find((p) => p.id === palette) || PALETTES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Current color palette: ${currentPalette.name}. Change palette`}
          className="group relative h-10 w-10 min-h-10 min-w-10 rounded-full border border-border/50 bg-background/50 backdrop-blur-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-accent/50 glow-hover motion-reduce:transition-none"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={palette}
              initial={reduceMotion
                ? false
                : { scale: 0.25, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={reduceMotion
                ? undefined
                : { scale: 0.25, rotate: 90, opacity: 0 }}
              transition={reduceMotion
                ? { duration: 0 }
                : { type: 'spring', duration: 0.3, bounce: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Palette className="h-4 w-4 transition-colors group-hover:text-primary" />
            </motion.div>
          </AnimatePresence>

          <div
            aria-hidden="true"
            className="palette-control-glow pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--glow-color)_0%,transparent_70%)] opacity-0 transition-opacity duration-150 group-hover:opacity-20 motion-reduce:transition-none"
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[200px] bg-background/95 backdrop-blur-sm border border-border/50"
      >
        <DropdownMenuRadioGroup
          value={palette}
          onValueChange={(value) => setPalette(value as PaletteId)}
        >
          {PALETTES.map((paletteOption) => (
            <DropdownMenuRadioItem
              key={paletteOption.id}
              value={paletteOption.id}
              aria-label={paletteOption.name}
              className="min-h-10 cursor-pointer gap-3 py-2.5"
            >
              <ColorSwatch colors={paletteOption.preview} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{paletteOption.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {paletteOption.era} - {paletteOption.description}
                </div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SimplePaletteSelector() {
  const { palette, setPalette } = useTheme();
  const reduceMotion = useReducedMotion();

  const currentIndex = PALETTES.findIndex((p) => p.id === palette);
  const currentPalette = PALETTES[currentIndex] || PALETTES[0];

  const cyclePalette = () => {
    const nextIndex = (currentIndex + 1) % PALETTES.length;
    setPalette(PALETTES[nextIndex].id as PaletteId);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cyclePalette}
      aria-label={`Current color palette: ${currentPalette.name}. Cycle palette`}
      className="group relative h-10 w-10 min-h-10 min-w-10 overflow-hidden rounded-full border border-border/50 bg-background/50 backdrop-blur-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-accent/50 glow-hover motion-reduce:transition-none"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={palette}
          initial={reduceMotion ? false : { y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: 20, opacity: 0 }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', duration: 0.3, bounce: 0 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <ColorSwatch colors={currentPalette.preview} size="sm" />
        </motion.div>
      </AnimatePresence>

      <motion.div
        aria-hidden="true"
        className="palette-control-glow pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--glow-color)_0%,transparent_70%)] opacity-20"
        animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
        transition={reduceMotion
          ? { duration: 0 }
          : { duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </Button>
  );
}
