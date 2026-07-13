import type { PropsWithChildren } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.node';

import RootLayout from '../../layout';
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
