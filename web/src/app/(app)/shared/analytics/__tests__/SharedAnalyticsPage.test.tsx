import { render, screen } from '@testing-library/react';

import { useMultiUserFinance } from '@/app/context/MultiUserFinanceContext';
import SharedAnalyticsPage from '../page';

import type { AnalyticsViewProps } from '@/app/components/analytics/types';

const mockUseSubscription = jest.fn();
const mockOverview = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="group-overview">Group overview</div>;
});
const mockDataQuality = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="data-quality">Data quality</div>;
});
const mockUpgradePrompt = jest.fn(
  ({ feature }: { feature: string; headingLevel?: 2 | 3 | 4 }) => (
  <div data-testid="upgrade-prompt">Upgrade {feature}</div>
  )
);

jest.mock('@/app/context/MultiUserFinanceContext', () => ({
  useMultiUserFinance: jest.fn(),
}));

jest.mock('@/app/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

jest.mock('@/app/context/FinanceContext', () => ({
  useFinance: () => ({ taxConfig: { country: 'australia' } }),
}));

jest.mock('@/app/components/ProFeatureGate', () => ({
  UpgradePrompt: (props: { feature: string; headingLevel?: 2 | 3 | 4 }) =>
    mockUpgradePrompt(props),
}));

jest.mock('@/app/components/analytics/views/OverviewAnalyticsView', () => ({
  OverviewAnalyticsView: (props: AnalyticsViewProps) => mockOverview(props),
}));

jest.mock('@/app/components/analytics/views/SpendingAnalyticsView', () => ({
  SpendingAnalyticsView: () => <div>Spending</div>,
}));

jest.mock('@/app/components/analytics/views/CategoriesAnalyticsView', () => ({
  CategoriesAnalyticsView: () => <div>Categories</div>,
}));

jest.mock('@/app/components/analytics/views/AttentionAnalyticsView', () => ({
  AttentionAnalyticsView: () => <div>Attention</div>,
}));

jest.mock('@/app/components/analytics/views/ForecastAnalyticsView', () => ({
  ForecastAnalyticsView: () => <div>Forecast</div>,
}));

jest.mock('@/app/components/analytics/views/DataQualityAnalyticsView', () => ({
  DataQualityAnalyticsView: (props: AnalyticsViewProps) => mockDataQuality(props),
}));

const activeGroup = {
  id: 'group-home',
  name: 'Home',
  members: [
    {
      userId: 'member-alex',
      displayName: 'Alex',
      email: 'alex@example.com',
    },
    {
      userId: 'member-sam',
      displayName: '',
      email: 'sam@example.com',
    },
  ],
};

describe('SharedAnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useMultiUserFinance).mockReturnValue({
      activeGroup,
    } as unknown as ReturnType<typeof useMultiUserFinance>);
    mockUseSubscription.mockReturnValue({
      hasProAccess: true,
      loading: false,
    });
  });

  it('guides the user without mounting analytics when no group is active', () => {
    jest.mocked(useMultiUserFinance).mockReturnValue({
      activeGroup: null,
    } as unknown as ReturnType<typeof useMultiUserFinance>);

    render(<SharedAnalyticsPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Choose a group to view analytics',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/group selector above/i)).toBeInTheDocument();
    expect(mockUseSubscription).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
  });

  it('constructs exact active-group scope and exposes only group analytics views', () => {
    render(<SharedAnalyticsPage />);

    expect(
      screen.getByRole('heading', { name: 'Home analytics' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('group-overview')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Data Quality' })).not.toBeInTheDocument();
    expect(mockOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: {
          kind: 'group',
          groupId: 'group-home',
          groupName: 'Home',
          members: [
            {
              userId: 'member-alex',
              displayName: 'Alex',
              email: 'alex@example.com',
            },
            {
              userId: 'member-sam',
              displayName: '',
              email: 'sam@example.com',
            },
          ],
        },
        period: 'month',
      })
    );
    expect(mockDataQuality).not.toHaveBeenCalled();
  });

  it('shows subscription loading without mounting group analytics hooks', () => {
    mockUseSubscription.mockReturnValue({
      hasProAccess: false,
      loading: true,
    });

    render(<SharedAnalyticsPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading analytics workspace'
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Home analytics' })
    ).toBeInTheDocument();
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockUpgradePrompt).not.toHaveBeenCalled();
  });

  it('shows one upgrade prompt without mounting a group view when locked', () => {
    mockUseSubscription.mockReturnValue({
      hasProAccess: false,
      loading: false,
    });

    render(<SharedAnalyticsPage />);

    expect(screen.getAllByTestId('upgrade-prompt')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Home analytics' })
    ).toBeInTheDocument();
    expect(mockUpgradePrompt).toHaveBeenCalledWith({
      feature: 'Advanced Analytics',
      headingLevel: 3,
    });
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockDataQuality).not.toHaveBeenCalled();
  });
});
