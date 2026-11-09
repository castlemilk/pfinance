import { render, screen } from '@testing-library/react';
import SharedLayout from '@/app/(app)/shared/layout';

let mockPathname = '/shared';
let mockAuth: { user: { uid: string } | null; loading: boolean } = {
  user: null,
  loading: false,
};

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@/app/context/AuthWithAdminContext', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/app/components/EnhancedGroupSelector', () => ({
  __esModule: true,
  default: () => <div>Group selector</div>,
}));

describe('SharedLayout', () => {
  beforeEach(() => {
    mockPathname = '/shared';
    mockAuth = { user: null, loading: false };
  });

  it.each(['/shared/join', '/shared/join/'])(
    'allows a signed-out invite preview at %s',
    (pathname) => {
      mockPathname = pathname;
      render(
        <SharedLayout>
          <div>Invite preview</div>
        </SharedLayout>,
      );

      expect(screen.getByText('Invite preview')).toBeInTheDocument();
      expect(screen.queryByText('Sign In Required')).not.toBeInTheDocument();
      expect(screen.queryByText('Group selector')).not.toBeInTheDocument();
    },
  );

  it('keeps other signed-out shared routes behind the auth prompt', () => {
    render(
      <SharedLayout>
        <div>Private shared content</div>
      </SharedLayout>,
    );

    expect(screen.getByText('Sign In Required')).toBeInTheDocument();
    expect(screen.queryByText('Private shared content')).not.toBeInTheDocument();
  });

  it('shows the group selector for authenticated shared routes', () => {
    mockAuth = { user: { uid: 'local-dev-user' }, loading: false };
    render(
      <SharedLayout>
        <div>Private shared content</div>
      </SharedLayout>,
    );

    expect(screen.getByText('Group selector')).toBeInTheDocument();
    expect(screen.getByText('Private shared content')).toBeInTheDocument();
  });
});
