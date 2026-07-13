import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FinanceGroup } from '../../context/MultiUserFinanceContext';
import { useAuth } from '../../context/AuthWithAdminContext';
import { useFinance } from '../../context/FinanceContext';
import { useMultiUserFinance } from '../../context/MultiUserFinanceContext';
import EnhancedGroupSelector from '../EnhancedGroupSelector';

jest.mock('../../context/AuthWithAdminContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../context/FinanceContext', () => ({
  useFinance: jest.fn(),
}));

jest.mock('../../context/MultiUserFinanceContext', () => ({
  useMultiUserFinance: jest.fn(),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const mockSetActiveGroup = jest.fn();

const members = [
  {
    userId: 'user-1',
    email: 'alex@example.com',
    displayName: 'Alex',
    role: 'owner' as const,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    userId: 'user-2',
    email: 'sam@example.com',
    displayName: 'Sam',
    role: 'member' as const,
    joinedAt: new Date('2026-01-02T00:00:00Z'),
  },
];

const homeGroup: FinanceGroup = {
  id: 'home',
  name: 'Home',
  description: 'Household finances',
  ownerId: 'user-1',
  memberIds: members.map((member) => member.userId),
  members,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const travelGroup: FinanceGroup = {
  ...homeGroup,
  id: 'travel',
  name: 'Travel',
  description: 'Travel finances',
  memberIds: ['user-1'],
  members: [members[0]],
};

type RenderOptions = Readonly<{
  activeGroup?: FinanceGroup | null;
  country?: unknown;
  groups?: FinanceGroup[];
}>;

function renderSelector({
  activeGroup = homeGroup,
  country = 'australia',
  groups = [homeGroup, travelGroup],
}: RenderOptions = {}) {
  jest.mocked(useAuth).mockReturnValue({
    user: {
      uid: 'user-1',
      email: 'alex@example.com',
      displayName: 'Alex',
      photoURL: null,
    },
    loading: false,
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useFinance).mockReturnValue({
    taxConfig: { country },
  } as unknown as ReturnType<typeof useFinance>);
  jest.mocked(useMultiUserFinance).mockReturnValue({
    groups,
    activeGroup,
    setActiveGroup: mockSetActiveGroup,
    createGroup: jest.fn(),
  } as unknown as ReturnType<typeof useMultiUserFinance>);

  return render(<EnhancedGroupSelector />);
}

describe('EnhancedGroupSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owns the shared page heading and labels active and empty triggers', () => {
    const { rerender } = renderSelector();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Shared Finance' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Active finance group: Home' })
    ).toBeInTheDocument();

    jest.mocked(useMultiUserFinance).mockReturnValue({
      groups: [],
      activeGroup: null,
      setActiveGroup: mockSetActiveGroup,
      createGroup: jest.fn(),
    } as unknown as ReturnType<typeof useMultiUserFinance>);
    rerender(<EnhancedGroupSelector />);

    expect(
      screen.getByRole('button', { name: 'Choose active finance group' })
    ).toBeInTheDocument();
  });

  it('exposes one checked group radio item and switches through the context', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(
      screen.getByRole('button', { name: 'Active finance group: Home' })
    );

    const radios = screen.getAllByRole('menuitemradio');
    const home = screen.getByRole('menuitemradio', {
      name: 'Home, 2 members',
    });
    const travel = screen.getByRole('menuitemradio', {
      name: 'Travel, 1 member',
    });
    expect(radios).toHaveLength(2);
    expect(radios.filter((radio) => radio.getAttribute('aria-checked') === 'true')).toEqual([
      home,
    ]);

    await user.click(travel);

    expect(mockSetActiveGroup).toHaveBeenCalledWith(travelGroup);
  });

  it.each([
    ['uk', 'GBP'],
    ['australia', 'AUD'],
    ['unsupported', 'AUD'],
    ['simple', 'USD'],
  ])('shows %s as display currency %s in quick manage', async (country, code) => {
    const user = userEvent.setup();
    renderSelector({ country });

    await user.click(
      screen.getByRole('button', { name: 'Active finance group: Home' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Manage current group' })
    );

    const dialog = screen.getByRole('dialog', { name: 'Home' });
    expect(within(dialog).getByText('Display currency')).toBeInTheDocument();
    expect(within(dialog).getByText(code, { exact: true })).toBeInTheDocument();
  });

  it('uses an ordinary group landmark for wrapping, touch-sized shared controls', () => {
    renderSelector();

    const header = screen.getByRole('banner');
    const controls = screen.getByRole('group', {
      name: 'Shared finance controls',
    });
    const trigger = screen.getByRole('button', {
      name: 'Active finance group: Home',
    });
    const settings = screen.getByRole('button', { name: 'Settings' });
    const memberBadge = screen.getByRole('status', {
      name: '2 members in active group',
    });

    expect(header).toHaveClass('top-14', 'lg:top-0');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(controls).toHaveClass('h-auto', 'min-h-16', 'min-w-0', 'flex-wrap');
    expect(trigger).toHaveClass('min-h-10', 'min-w-0', 'max-w-full');
    expect(settings).toHaveClass('min-h-10', 'min-w-10');
    expect(memberBadge).toHaveClass('min-h-10', 'min-w-10');
  });
});
