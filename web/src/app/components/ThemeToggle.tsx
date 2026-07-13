'use client';

import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

const themeLabels = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
} as const;

function ThemeGlyph({
  className,
  theme,
}: {
  className?: string;
  theme: keyof typeof themeLabels;
}) {
  if (theme === 'light') return <Sun className={className} />;
  if (theme === 'dark') return <Moon className={className} />;
  return <Monitor className={className} />;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Current theme: ${themeLabels[theme]}. Change theme`}
          className="group relative h-10 w-10 min-h-10 min-w-10 rounded-full border border-border/50 bg-background/50 backdrop-blur-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-accent/50 glow-hover motion-reduce:transition-none"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={theme}
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
              <ThemeGlyph
                theme={theme}
                className="h-4 w-4 transition-colors group-hover:text-primary"
              />
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
        className="min-w-[140px] bg-background/95 backdrop-blur-sm border border-border/50"
      >
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) =>
            setTheme(value as (typeof themeOptions)[number]['value'])
          }
        >
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              aria-label={label}
              className="min-h-10 cursor-pointer gap-2"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simple toggle version (for compact spaces)
export function SimpleThemeToggle() {
  const { actualTheme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Current theme: ${actualTheme === 'dark' ? 'Dark' : 'Light'}. Switch theme`}
      className="group relative h-10 w-10 min-h-10 min-w-10 overflow-hidden rounded-full border border-border/50 bg-background/50 backdrop-blur-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-accent/50 glow-hover motion-reduce:transition-none"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={actualTheme}
          initial={reduceMotion
            ? false
            : { y: actualTheme === 'dark' ? -20 : 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion
            ? undefined
            : { y: actualTheme === 'dark' ? 20 : -20, opacity: 0 }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', duration: 0.3, bounce: 0 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {actualTheme === 'dark' ? (
            <Moon className="h-4 w-4 transition-colors group-hover:text-primary" />
          ) : (
            <Sun className="h-4 w-4 transition-colors group-hover:text-primary" />
          )}
        </motion.div>
      </AnimatePresence>

      <motion.div
        aria-hidden="true"
        className="palette-control-glow pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--glow-color)_0%,transparent_70%)] opacity-20"
        animate={reduceMotion
          ? { rotate: 0 }
          : { rotate: actualTheme === 'dark' ? 180 : 0 }}
        transition={reduceMotion
          ? { duration: 0 }
          : { duration: 0.5, ease: 'easeInOut' }}
      />
    </Button>
  );
}
