import type { PdfcnTheme } from '@/types/pdf-themes';

import { professionalTheme } from './professional';

/** A light, print-safe theme with PFinance's warm terminal accent. */
export const pfinanceTheme: PdfcnTheme = {
  ...professionalTheme,
  name: 'pfinance',
  colors: {
    ...professionalTheme.colors,
    accent: '#9a3412',
    border: '#e7e5e4',
    info: '#854d0e',
    muted: '#fafaf9',
    mutedForeground: '#57534e',
    primary: '#9a3412',
    primaryForeground: '#ffffff',
  },
  spacing: {
    ...professionalTheme.spacing,
    page: {
      ...professionalTheme.spacing.page,
      marginBottom: 40,
      marginTop: 40,
    },
  },
  typography: {
    ...professionalTheme.typography,
    body: {
      ...professionalTheme.typography.body,
      fontFamily: 'Geist',
    },
    heading: {
      ...professionalTheme.typography.heading,
      fontFamily: 'Geist',
    },
  },
};
