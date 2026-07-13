import type { PropsWithChildren, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.node';

import RootLayout from '../../layout';
import AuthLayout from '../../auth/layout';
import NotFound from '../../not-found';
import AppLayout from '../AppLayout';
import AppSkeleton from '../skeletons/AppSkeleton';

jest.mock('next/font/google', () => ({
  IBM_Plex_Mono: () => ({ variable: 'font-terminal' }),
  Space_Mono: () => ({ variable: 'font-terminal-mono' }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (
    _loader: unknown,
    options?: { loading?: () => ReactNode }
  ) => {
    const MockDynamicComponent = () => options?.loading?.() ?? null;
    MockDynamicComponent.displayName = 'MockDynamicComponent';
    return MockDynamicComponent;
  },
}));

jest.mock('../../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: PropsWithChildren) => children,
}));

jest.mock('../../context/AdminContext', () => ({
  AdminProvider: ({ children }: PropsWithChildren) => children,
}));

jest.mock('../../context/AuthWithAdminContext', () => ({
  AuthWithAdminProvider: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/lib/chat/ChatHistoryContext', () => ({
  ChatHistoryProvider: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));

jest.mock('../FirebaseInitBanner', () => ({
  FirebaseInitBanner: () => <div data-testid="firebase-banner-owner" />,
}));

jest.mock('../SidebarNav', () => ({
  __esModule: true,
  default: () => <nav aria-label="Primary navigation" />,
}));
jest.mock('../Breadcrumbs', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../DebugPanel', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: PropsWithChildren) => children,
  SheetTrigger: ({ children }: PropsWithChildren) => children,
  SheetClose: ({ children }: PropsWithChildren) => children,
  SheetContent: ({ children }: PropsWithChildren) => children,
  SheetTitle: ({ children }: PropsWithChildren) => children,
  SheetDescription: ({ children }: PropsWithChildren) => children,
}));

describe('Firebase banner ownership', () => {
  it('keeps exactly one owner in the root layout', () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <div>Page</div>
      </RootLayout>
    );

    expect(markup.match(/data-testid="firebase-banner-owner"/g)).toHaveLength(1);
  });

  it('does not mount another banner inside AppLayout', () => {
    render(
      <AppLayout>
        <div>Page</div>
      </AppLayout>
    );

    expect(screen.queryByTestId('firebase-banner-owner')).not.toBeInTheDocument();
  });
});

describe('App shell accessibility', () => {
  it('provides a focusable main-content target and a named assistant trigger', () => {
    render(
      <AppLayout>
        <div>Page</div>
      </AppLayout>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');

    const assistantTrigger = screen.getByRole('button', {
      name: 'Open finance assistant',
    });
    expect(assistantTrigger).toHaveClass('min-h-10', 'min-w-10');
    expect(assistantTrigger).not.toHaveClass('transition-all');
    expect(assistantTrigger).toHaveClass(
      'transition-[transform,box-shadow,background-color,border-color]'
    );
  });

  it('announces a compact status while the assistant chunk loads', () => {
    render(
      <AppLayout>
        <div>Page</div>
      </AppLayout>
    );

    const status = screen.getByRole('status', {
      name: 'Loading finance assistant',
    });
    expect(status).toHaveClass('min-h-20');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('provides a named 40px local close control for the assistant sheet', () => {
    render(
      <AppLayout>
        <div>Page</div>
      </AppLayout>
    );

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('min-h-10', 'min-w-10');
  });

  it('provides the same focusable skip target on the auth surface', () => {
    render(
      <AuthLayout>
        <div>Sign in form</div>
      </AuthLayout>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the Suspense skeleton main target programmatically focusable', () => {
    render(<AppSkeleton />);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the not-found return link valid inside a focusable main target', () => {
    render(<NotFound />);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');

    const returnLink = screen.getByRole('link', {
      name: '> RETURN TO DASHBOARD',
    });
    expect(returnLink).toHaveAttribute('href', '/personal');
    expect(returnLink).toHaveClass('min-h-10');
    expect(returnLink.querySelector('button')).not.toBeInTheDocument();
    expect(document.querySelector('a button, button a')).not.toBeInTheDocument();
  });
});
