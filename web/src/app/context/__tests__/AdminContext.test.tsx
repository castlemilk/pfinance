/* eslint-disable @typescript-eslint/no-require-imports */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

type AdminContextModule = typeof import('../AdminContext');

const mutableProcessEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
mutableProcessEnv.NODE_ENV = 'development';
const { AdminProvider, useAdmin } = require('../AdminContext') as AdminContextModule;
mutableProcessEnv.NODE_ENV = originalNodeEnv;

const impersonatedUser = {
  uid: 'shared-analytics-e2e-user',
  email: 'shared-analytics-e2e-user@debug.local',
  displayName: 'Shared Analytics Tester',
  photoURL: null,
};

function AdminState() {
  const {
    isAdminMode,
    impersonatedUser: currentUser,
    setIsAdminMode,
  } = useAdmin();

  return (
    <>
      <div data-testid="admin-mode">{isAdminMode.toString()}</div>
      <div data-testid="impersonated-user">{currentUser?.uid ?? 'none'}</div>
      <button onClick={() => setIsAdminMode(true)}>Enable admin mode</button>
      <button onClick={() => setIsAdminMode(false)}>Disable admin mode</button>
    </>
  );
}

describe('AdminProvider development persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores seeded admin mode and impersonation without overwriting either value', async () => {
    window.localStorage.setItem('pfinance-admin-mode', 'true');
    window.localStorage.setItem(
      'pfinance-impersonated-user',
      JSON.stringify(impersonatedUser)
    );

    render(
      <AdminProvider>
        <AdminState />
      </AdminProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-mode')).toHaveTextContent('true');
      expect(screen.getByTestId('impersonated-user')).toHaveTextContent(
        impersonatedUser.uid
      );
    });

    expect(window.localStorage.getItem('pfinance-admin-mode')).toBe('true');
    expect(window.localStorage.getItem('pfinance-impersonated-user')).toBe(
      JSON.stringify(impersonatedUser)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disable admin mode' }));

    await waitFor(() => {
      expect(screen.getByTestId('admin-mode')).toHaveTextContent('false');
      expect(screen.getByTestId('impersonated-user')).toHaveTextContent('none');
      expect(window.localStorage.getItem('pfinance-admin-mode')).toBe('false');
      expect(
        window.localStorage.getItem('pfinance-impersonated-user')
      ).toBeNull();
    });
  });

  it('clears stale impersonation only after restoring disabled admin mode', async () => {
    window.localStorage.setItem('pfinance-admin-mode', 'false');
    window.localStorage.setItem(
      'pfinance-impersonated-user',
      JSON.stringify(impersonatedUser)
    );

    render(
      <AdminProvider>
        <AdminState />
      </AdminProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-mode')).toHaveTextContent('false');
      expect(screen.getByTestId('impersonated-user')).toHaveTextContent('none');
      expect(
        window.localStorage.getItem('pfinance-impersonated-user')
      ).toBeNull();
    });

    expect(window.localStorage.getItem('pfinance-admin-mode')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Enable admin mode' }));

    await waitFor(() => {
      expect(screen.getByTestId('admin-mode')).toHaveTextContent('true');
      expect(window.localStorage.getItem('pfinance-admin-mode')).toBe('true');
    });
  });
});
