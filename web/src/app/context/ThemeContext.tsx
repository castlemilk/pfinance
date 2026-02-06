'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { PaletteId, DEFAULT_PALETTE, isValidPalette } from '../constants/palettes';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  palette: PaletteId;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: PaletteId) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultPalette?: PaletteId;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  defaultPalette = DEFAULT_PALETTE,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');
  const [palette, setPaletteState] = useState<PaletteId>(defaultPalette);

  // Get system preference
  const getSystemTheme = useCallback((): 'light' | 'dark' => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  }, []);

  // Calculate actual theme based on theme setting
  const calculateActualTheme = useCallback((currentTheme: Theme): 'light' | 'dark' => {
    if (currentTheme === 'system') {
      return getSystemTheme();
    }
    return currentTheme;
  }, [getSystemTheme]);

  // Load theme and palette from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('pfinance-theme') as Theme;
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        setTheme(savedTheme);
      }

      const savedPalette = localStorage.getItem('pfinance-palette');
      if (savedPalette && isValidPalette(savedPalette)) {
        setPaletteState(savedPalette);
      }
    }
  }, []);

  // Update actual theme and DOM when theme changes
  useEffect(() => {
    const newActualTheme = calculateActualTheme(theme);
    setActualTheme(newActualTheme);

    // Update DOM
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newActualTheme);

      // Save to localStorage
      localStorage.setItem('pfinance-theme', theme);
    }
  }, [theme, calculateActualTheme]);

  // Update DOM when palette changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;

      // Remove palette attribute for default (amber-terminal)
      // Set data-palette for other palettes
      if (palette === 'amber-terminal') {
        delete root.dataset.palette;
      } else {
        root.dataset.palette = palette;
      }

      // Save to localStorage
      localStorage.setItem('pfinance-palette', palette);
    }
  }, [palette]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window !== 'undefined' && theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = () => {
        setActualTheme(calculateActualTheme(theme));
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme, calculateActualTheme]);

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const handleSetPalette = (newPalette: PaletteId) => {
    setPaletteState(newPalette);
  };

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const value = {
    theme,
    actualTheme,
    palette,
    setTheme: handleSetTheme,
    setPalette: handleSetPalette,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
