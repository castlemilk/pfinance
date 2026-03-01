'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  const [palette, setPaletteState] = useState<PaletteId>(defaultPalette);

  // Derive actualTheme during render (no extra state, no double-render)
  const actualTheme: 'light' | 'dark' = theme === 'system' ? systemTheme : theme;

  // Load theme and palette from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedTheme = localStorage.getItem('pfinance-theme') as Theme;
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setTheme(savedTheme);
    }
    const savedPalette = localStorage.getItem('pfinance-palette');
    if (savedPalette && isValidPalette(savedPalette)) {
      setPaletteState(savedPalette);
    }
    // Initialize system theme
    setSystemTheme(
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    );
  }, []);

  // Update DOM when actualTheme changes + persist theme preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(actualTheme);
    localStorage.setItem('pfinance-theme', theme);
  }, [theme, actualTheme]);

  // Update DOM when palette changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = window.document.documentElement;
    if (palette === 'amber-terminal') {
      delete root.dataset.palette;
    } else {
      root.dataset.palette = palette;
    }
    localStorage.setItem('pfinance-palette', palette);
  }, [palette]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleSetTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
  }, []);

  const handleSetPalette = useCallback((newPalette: PaletteId) => {
    setPaletteState(newPalette);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light');
  }, []);

  const value = useMemo(() => ({
    theme,
    actualTheme,
    palette,
    setTheme: handleSetTheme,
    setPalette: handleSetPalette,
    toggleTheme,
  }), [theme, actualTheme, palette, handleSetTheme, handleSetPalette, toggleTheme]);

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
