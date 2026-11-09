import { render, screen, waitFor } from '@testing-library/react';

import AuthPage from '@/app/auth/page';
import { useAuth } from '@/app/context/AuthWithAdminContext';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockReturnUrl: string | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'returnUrl' ? mockReturnUrl : null),
  }),
}));

jest.mock('@/app/context/AuthWithAdminContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/app/components/AuthModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('Authentication return URLs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReturnUrl = null;
    jest.mocked(useAuth).mockReturnValue({
      user: { uid: 'user-1', email: 'person@example.com' },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('continues to a safe internal invite after authentication', async () => {
    mockReturnUrl = '/shared/join?code=HOUSEHOLD%201';
    render(<AuthPage />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/shared/join?code=HOUSEHOLD%201')
    );
  });

  it.each([
    'https://example.com/steal',
    '//example.com/steal',
    '/\\example.com/steal',
  ])('rejects unsafe destination %s', async (destination) => {
    mockReturnUrl = destination;
    render(<AuthPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/shared'));
  });

  it('keeps the sign-in action available while signed out', () => {
    jest.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    render(<AuthPage />);

    expect(screen.getByRole('button', { name: 'Sign In / Sign Up' })).toBeVisible();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
