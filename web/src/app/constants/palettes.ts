/**
 * Palette Configuration for Multi-Palette Theme System
 *
 * Each palette defines a unique retro-inspired color scheme with
 * light and dark mode variants.
 */

export type PaletteId = 'amber-terminal' | 'retro-chic' | 'midcentury' | 'terracotta';

export interface PaletteConfig {
  id: PaletteId;
  name: string;
  description: string;
  era: string;
  preview: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export const PALETTES: PaletteConfig[] = [
  {
    id: 'amber-terminal',
    name: 'Amber Terminal',
    description: 'CRT terminal glow',
    era: '1970s',
    preview: {
      primary: '#FFA94D',
      secondary: '#87A96B',
      accent: '#D16A47',
    },
  },
  {
    id: 'retro-chic',
    name: 'Soft Retro Chic',
    description: 'Pastel diary aesthetic',
    era: '1980s',
    preview: {
      primary: '#D69CAA',
      secondary: '#AEC6CF',
      accent: '#B5A86C',
    },
  },
  {
    id: 'midcentury',
    name: 'Mint & Peach',
    description: 'Kitchen appliance vibes',
    era: '1950s',
    preview: {
      primary: '#72C2A8',
      secondary: '#F5B6A5',
      accent: '#E3C78A',
    },
  },
  {
    id: 'terracotta',
    name: 'Terracotta & Sage',
    description: 'Organic rustic aesthetic',
    era: 'Earthy',
    preview: {
      primary: '#C37A67',
      secondary: '#A0A088',
      accent: '#747C70',
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = 'amber-terminal';

export function getPaletteById(id: PaletteId): PaletteConfig | undefined {
  return PALETTES.find((p) => p.id === id);
}

export function isValidPalette(id: string): id is PaletteId {
  return PALETTES.some((p) => p.id === id);
}
