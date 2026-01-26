'use client';

import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Button } from '@/components/ui/button';
import { 
  Sun, 
  Moon, 
  Monitor, 
  SunMoon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return Sun;
      case 'dark':
        return Moon;
      case 'system':
        return Monitor;
      default:
        return SunMoon;
    }
  };

  const ThemeIcon = getThemeIcon();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-accent/50 transition-all duration-300 group"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={theme}
              initial={{ scale: 0.5, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.5, rotate: 90, opacity: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 20,
                duration: 0.3 
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <ThemeIcon className="h-4 w-4 transition-colors group-hover:text-accent-foreground" />
            </motion.div>
          </AnimatePresence>
          
          {/* Subtle glow effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className="min-w-[140px] bg-background/95 backdrop-blur-sm border border-border/50"
      >
        <DropdownMenuItem 
          onClick={() => setTheme('light')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Sun className="h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && (
            <motion.div
              layoutId="theme-indicator"
              className="ml-auto h-2 w-2 rounded-full bg-primary"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => setTheme('dark')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Moon className="h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && (
            <motion.div
              layoutId="theme-indicator"
              className="ml-auto h-2 w-2 rounded-full bg-primary"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => setTheme('system')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Monitor className="h-4 w-4" />
          <span>System</span>
          {theme === 'system' && (
            <motion.div
              layoutId="theme-indicator"
              className="ml-auto h-2 w-2 rounded-full bg-primary"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simple toggle version (for compact spaces)
export function SimpleThemeToggle() {
  const { actualTheme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="relative h-9 w-9 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-accent/50 transition-all duration-300 group overflow-hidden"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={actualTheme}
          initial={{ y: actualTheme === 'dark' ? -20 : 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: actualTheme === 'dark' ? 20 : -20, opacity: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 25,
            duration: 0.3 
          }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {actualTheme === 'dark' ? (
            <Moon className="h-4 w-4 transition-colors group-hover:text-accent-foreground" />
          ) : (
            <Sun className="h-4 w-4 transition-colors group-hover:text-accent-foreground" />
          )}
        </motion.div>
      </AnimatePresence>
      
      {/* Rotating background gradient */}
      <motion.div 
        className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-blue-500/20"
        animate={{ rotate: actualTheme === 'dark' ? 180 : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
      
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}