import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useTheme } from '../../context/ThemeContext';
import {
  SimpleThemeToggle,
  ThemeToggle,
} from '../ThemeToggle';
import {
  PaletteSelector,
  SimplePaletteSelector,
} from '../PaletteSelector';

const mockUseReducedMotion = jest.fn(() => false);

jest.mock('../../context/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('framer-motion', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');

  const MotionDiv = ReactModule.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      exit?: unknown;
      initial?: unknown;
      layoutId?: string;
      transition?: unknown;
    }
  >(
    (
      {
        animate,
        exit,
        initial,
        layoutId,
        transition,
        ...props
      },
      ref
    ) => {
      void exit;
      void layoutId;
      return (
        <div
          ref={ref}
          data-motion-animate={JSON.stringify(animate)}
          data-motion-initial={JSON.stringify(initial)}
          data-motion-transition={JSON.stringify(transition)}
          {...props}
        />
      );
    }
  );
  MotionDiv.displayName = 'MotionDiv';

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

const mockSetTheme = jest.fn();
const mockSetPalette = jest.fn();
const mockToggleTheme = jest.fn();

function setThemeContext({
  actualTheme = 'light',
  palette = 'amber-terminal',
  theme = 'light',
}: {
  actualTheme?: 'light' | 'dark';
  palette?: 'amber-terminal' | 'retro-chic' | 'midcentury' | 'terracotta';
  theme?: 'light' | 'dark' | 'system';
} = {}) {
  jest.mocked(useTheme).mockReturnValue({
    actualTheme,
    palette,
    setPalette: mockSetPalette,
    setTheme: mockSetTheme,
    theme,
    toggleTheme: mockToggleTheme,
  });
}

describe('theme and palette controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
    setThemeContext();
  });

  it('exposes a stateful, touch-sized theme radio menu', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const trigger = screen.getByRole('button', {
      name: 'Current theme: Light. Change theme',
    });
    expect(trigger).toHaveClass(
      'min-h-10',
      'min-w-10',
      'transition-[color,background-color,border-color,box-shadow,transform]'
    );

    await user.click(trigger);

    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option).toHaveClass('min-h-10');
    }
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('exposes a stateful, touch-sized palette radio menu', async () => {
    const user = userEvent.setup();
    setThemeContext({ palette: 'retro-chic' });
    render(<PaletteSelector />);

    const trigger = screen.getByRole('button', {
      name: 'Current color palette: Soft Retro Chic. Change palette',
    });
    expect(trigger).toHaveClass(
      'min-h-10',
      'min-w-10',
      'transition-[color,background-color,border-color,box-shadow,transform]'
    );

    await user.click(trigger);

    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(4);
    for (const option of options) {
      expect(option).toHaveClass('min-h-10');
    }
    expect(
      screen.getByRole('menuitemradio', { name: 'Soft Retro Chic' })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', { name: 'Mint & Peach' })
    ).toHaveAttribute('aria-checked', 'false');

    await user.click(
      screen.getByRole('menuitemradio', { name: 'Mint & Peach' })
    );
    expect(mockSetPalette).toHaveBeenCalledWith('midcentury');
  });

  it('keeps compact triggers stateful and at least 40px square', () => {
    setThemeContext({ actualTheme: 'dark', palette: 'terracotta', theme: 'dark' });
    render(
      <>
        <SimpleThemeToggle />
        <SimplePaletteSelector />
      </>
    );

    expect(
      screen.getByRole('button', {
        name: 'Current theme: Dark. Switch theme',
      })
    ).toHaveClass('min-h-10', 'min-w-10');
    expect(
      screen.getByRole('button', {
        name: 'Current color palette: Terracotta & Sage. Cycle palette',
      })
    ).toHaveClass('min-h-10', 'min-w-10');
  });

  it('uses the active palette glow token instead of amber or preview hex values', () => {
    setThemeContext({ palette: 'retro-chic' });
    const { container } = render(
      <>
        <ThemeToggle />
        <PaletteSelector />
      </>
    );

    const glowClasses = Array.from(
      container.querySelectorAll('.palette-control-glow')
    ).map((element) => element.className);

    expect(glowClasses).toHaveLength(2);
    for (const className of glowClasses) {
      expect(className).toContain('var(--glow-color)');
      expect(className).not.toMatch(/#(?:ffa94d|d69caa)|amber|orange/i);
    }
  });

  it('collapses decorative control motion when reduced motion is requested', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { container } = render(
      <>
        <ThemeToggle />
        <PaletteSelector />
      </>
    );

    expect(mockUseReducedMotion).toHaveBeenCalledTimes(2);
    const animatedIcons = container.querySelectorAll('[data-motion-initial]');
    expect(animatedIcons).toHaveLength(2);
    for (const icon of animatedIcons) {
      expect(icon).toHaveAttribute('data-motion-initial', 'false');
      expect(icon).toHaveAttribute(
        'data-motion-transition',
        JSON.stringify({ duration: 0 })
      );
    }
  });
});
