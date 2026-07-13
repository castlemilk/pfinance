import { useEffect, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuth } from '../../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import SidebarNav from '../SidebarNav';

const mockUsePathname = jest.fn(() => '/shared/analytics');
const mockUseSubscription = jest.fn(() => ({
  isPro: true,
  isFree: false,
  loading: false,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
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
    mockUsePathname.mockReturnValue('/shared/analytics');
    mockUseSubscription.mockReturnValue({
      isPro: true,
      isFree: false,
      loading: false,
    });
    jest
      .mocked(financeClient.getMyAdminStatus)
      .mockImplementation(() => new Promise<never>(() => undefined));
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

  it('uses one interactive element for every signed-in sidebar destination', () => {
    mockUsePathname.mockReturnValue('/personal');
    render(<SidebarNav />);

    expect(document.querySelector('a button, button a')).not.toBeInTheDocument();

    const personalTab = screen.getByRole('link', { name: 'Personal' });
    const sharedTab = screen.getByRole('link', { name: 'Shared' });
    const overviewLink = within(screen.getByRole('navigation')).getByRole(
      'link',
      { name: 'Overview' }
    );
    const accountLink = screen.getByRole('link', { name: /^Person Pro$/ });
    const signOut = screen.getByRole('button', { name: 'Sign out' });

    for (const target of [personalTab, sharedTab, overviewLink, accountLink]) {
      expect(target).toHaveClass('min-h-10');
    }
    expect(signOut).toHaveClass('min-h-10', 'min-w-10');
    expect(accountLink.parentElement).toBe(signOut.parentElement);
  });

  it('renders signed-out Shared as a disabled button without a live anchor', () => {
    jest.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      logout: jest.fn(),
      isImpersonating: false,
    } as unknown as ReturnType<typeof useAuth>);

    render(<SidebarNav />);

    const sharedButton = screen.getByRole('button', { name: 'Shared' });
    expect(sharedButton).toBeDisabled();
    expect(sharedButton).toHaveClass('min-h-10');
    expect(screen.queryByRole('link', { name: 'Shared' })).not.toBeInTheDocument();
    expect(document.querySelector('a button, button a')).not.toBeInTheDocument();

    const signIn = screen.getByRole('link', { name: 'Sign In' });
    expect(signIn).toHaveClass('min-h-10');
  });

  it('keeps the resolved admin destination free of nested controls', async () => {
    mockUsePathname.mockReturnValue('/personal');
    jest.mocked(financeClient.getMyAdminStatus).mockResolvedValue({
      isAdmin: true,
    } as Awaited<ReturnType<typeof financeClient.getMyAdminStatus>>);

    render(<SidebarNav />);

    const admin = await screen.findByRole('link', { name: 'Admin' });
    expect(admin).toHaveClass('min-h-10');
    expect(admin.querySelector('button')).not.toBeInTheDocument();
    expect(admin.parentElement?.tagName).not.toBe('BUTTON');
  });

  it('keeps the free-tier upgrade destination free of nested controls', () => {
    mockUsePathname.mockReturnValue('/personal');
    mockUseSubscription.mockReturnValue({
      isPro: false,
      isFree: true,
      loading: false,
    });

    render(<SidebarNav />);

    const upgrade = screen.getByRole('link', { name: 'Upgrade to Pro' });
    expect(upgrade).toHaveClass('min-h-10');
    expect(upgrade).toHaveClass(
      'border-primary/40',
      'bg-primary/15',
      'text-foreground'
    );
    expect(upgrade.className).not.toMatch(/amber|orange|gradient/i);
    expect(upgrade.querySelector('button')).not.toBeInTheDocument();
    expect(upgrade.parentElement?.tagName).not.toBe('BUTTON');
  });

  it('uses palette tokens for Pro and impersonation identity surfaces', () => {
    mockUsePathname.mockReturnValue('/personal');
    jest.mocked(useAuth).mockReturnValue({
      user: {
        uid: 'user-1',
        email: 'person@example.com',
        displayName: 'Person',
        photoURL: null,
      },
      loading: false,
      logout: jest.fn(),
      isImpersonating: true,
    } as unknown as ReturnType<typeof useAuth>);

    render(<SidebarNav />);

    const proBadge = screen.getByText('Pro', {
      selector: '[data-slot="badge"]',
    });
    const testUserBadge = screen.getByText('Test User', {
      selector: '[data-slot="badge"]',
    });
    const account = screen.getByRole('link', {
      name: /^Person Pro Test User$/,
    });
    const avatar = account.querySelector('.ring-primary');

    for (const badge of [proBadge, testUserBadge]) {
      expect(badge).toHaveClass(
        'border-primary/30',
        'bg-primary/10',
        'text-foreground'
      );
      expect(badge.className).not.toMatch(/amber|orange/i);
    }
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveClass('ring-primary');
    expect(avatar?.className).not.toMatch(/amber|orange/i);
  });
});
