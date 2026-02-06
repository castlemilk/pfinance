'use client';

import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { PALETTES, PaletteId } from '../constants/palettes';
import { Button } from '@/components/ui/button';
import { Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
    <div className="flex -space-x-1">
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

  const currentPalette = PALETTES.find((p) => p.id === palette) || PALETTES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-accent/50 transition-all duration-300 group glow-hover"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={palette}
              initial={{ scale: 0.5, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.5, rotate: 90, opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
                duration: 0.3,
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Palette className="h-4 w-4 transition-colors group-hover:text-primary" />
            </motion.div>
          </AnimatePresence>

          {/* Primary color glow effect based on current palette */}
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle, ${currentPalette.preview.primary}20 0%, transparent 70%)`,
            }}
          />

          <span className="sr-only">Change color palette</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[200px] bg-background/95 backdrop-blur-sm border border-border/50"
      >
        {PALETTES.map((paletteOption) => (
          <DropdownMenuItem
            key={paletteOption.id}
            onClick={() => setPalette(paletteOption.id as PaletteId)}
            className="flex items-center gap-3 cursor-pointer py-2.5"
          >
            <ColorSwatch colors={paletteOption.preview} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{paletteOption.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {paletteOption.era} - {paletteOption.description}
              </div>
            </div>
            {palette === paletteOption.id && (
              <motion.div
                layoutId="palette-indicator"
                className="h-2 w-2 rounded-full bg-primary flex-shrink-0"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SimplePaletteSelector() {
  const { palette, setPalette } = useTheme();

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
      className="relative h-9 w-9 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-accent/50 transition-all duration-300 group overflow-hidden glow-hover"
      title={`Current: ${currentPalette.name}. Click to change.`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={palette}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 25,
            duration: 0.3,
          }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <ColorSwatch colors={currentPalette.preview} size="sm" />
        </motion.div>
      </AnimatePresence>

      {/* Palette-specific glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${currentPalette.preview.primary}30 0%, transparent 70%)`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />

      <span className="sr-only">Cycle color palette</span>
    </Button>
  );
}
