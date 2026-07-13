import type { PropsWithChildren } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.node';

import RootLayout from '../../layout';
import AuthLayout from '../../auth/layout';
import NotFound from '../../not-found';
import AppLayout from '../AppLayout';

jest.mock('next/font/google', () => ({
  IBM_Plex_Mono: () => ({ variable: 'font-terminal' }),
  Space_Mono: () => ({ variable: 'font-terminal-mono' }),
}));

jest.mock('next/dynamic', () => () => {
  const MockDynamicComponent = () => null;
  MockDynamicComponent.displayName = 'MockDynamicComponent';
  return MockDynamicComponent;
});

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
