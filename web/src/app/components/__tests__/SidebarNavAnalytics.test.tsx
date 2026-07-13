import { useEffect, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuth } from '../../context/AuthWithAdminContext';
import SidebarNav from '../SidebarNav';

const mockUseSubscription = jest.fn(() => ({
  isPro: true,
  isFree: false,
  loading: false,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/shared/analytics',
}));

jest.mock('../../context/AuthWithAdminContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getMyAdminStatus: jest.fn(() => new Promise(() => {})),
  },
}));

jest.mock('../notifications/NotificationCenter', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../ThemeToggle', () => ({ ThemeToggle: () => null }));
jest.mock('../PaletteSelector', () => ({ PaletteSelector: () => null }));
jest.mock('../GenerativeAvatar', () => ({ GenerativeAvatar: () => null }));

function SearchFocusProbe() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    document.addEventListener('pfinance:open-search', handleOpen);
    return () => document.removeEventListener('pfinance:open-search', handleOpen);
  }, []);

  return open ? <input aria-label="Search focus target" autoFocus /> : null;
}

describe('Sidebar shared analytics navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue({
      user: {
        uid: 'user-1',
        email: 'person@example.com',
        displayName: 'Person',
        photoURL: null,
      },
      loading: false,
      logout: jest.fn(),
      isImpersonating: false,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('exposes one active 40px Analytics link while the closed drawer is absent', () => {
    render(<SidebarNav />);

    const navigation = screen.getByRole('navigation');
    const link = within(navigation).getByRole('link', { name: 'Analytics' });
    expect(link).toHaveAttribute('href', '/shared/analytics');
    expect(link).toHaveClass(
      'min-h-10',
      'skeu-variant-secondary',
      'transition-[color,background-color,border-color,box-shadow]'
    );
    expect(within(link).queryByRole('button')).not.toBeInTheDocument();

    expect(
      screen.queryByRole('dialog', { name: 'Mobile navigation' })
    ).not.toBeInTheDocument();
  });

  it('traps mobile navigation focus and restores it after Escape', async () => {
    const user = userEvent.setup();
    render(<SidebarNav />);

    const opener = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Mobile navigation' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toHaveClass(
      'motion-reduce:animate-none'
    );

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Mobile navigation' })
      ).not.toBeInTheDocument()
    );
    expect(opener).toHaveFocus();
  });

  it('closes the mobile navigation before following an analytics route', async () => {
    const user = userEvent.setup();
    render(<SidebarNav />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog', { name: 'Mobile navigation' });
    const link = within(dialog).getByRole('link', { name: 'Analytics' });

    expect(link).toHaveClass('min-h-10');
    expect(within(link).queryByRole('button')).not.toBeInTheDocument();
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Mobile navigation' })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('keeps focus in search when it opens from the mobile drawer', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SidebarNav />
        <SearchFocusProbe />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog', { name: 'Mobile navigation' });
    await user.click(within(dialog).getByTestId('app-search-trigger'));

    const searchTarget = await screen.findByRole('textbox', {
      name: 'Search focus target',
    });
    await waitFor(() => expect(searchTarget).toHaveFocus());
    expect(
      screen.queryByRole('dialog', { name: 'Mobile navigation' })
    ).not.toBeInTheDocument();
  });
});
