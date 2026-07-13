import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AnalyticsWorkspace } from '../AnalyticsWorkspace';

import type { AnalyticsViewProps } from '../types';

const mockUseSubscription = jest.fn();
const mockOverview = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="overview-view">Overview view</div>;
});
const mockSpending = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="spending-view">Spending view</div>;
});
const mockCategories = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="categories-view">Categories view</div>;
});
const mockAttention = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="attention-view">Attention view</div>;
});
const mockForecast = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="forecast-view">Forecast view</div>;
});
const mockDataQuality = jest.fn((props: AnalyticsViewProps) => {
  void props;
  return <div data-testid="data-quality-view">Data quality view</div>;
});
const mockUpgradePrompt = jest.fn(({ feature }: { feature: string }) => (
  <div data-testid="upgrade-prompt">Upgrade {feature}</div>
));

function StatefulOverviewMock({ scope, period }: AnalyticsViewProps) {
  const [mountedRequest] = useState(() =>
    `${scope.kind === 'group' ? `group:${scope.groupId}` : 'personal'}:${period}`
  );
  return <div data-testid="stateful-overview">{mountedRequest}</div>;
}

jest.mock('@/app/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

jest.mock('@/app/context/FinanceContext', () => ({
  useFinance: () => ({ taxConfig: { country: 'uk' } }),
}));

jest.mock('@/app/components/ProFeatureGate', () => ({
  UpgradePrompt: (props: { feature: string }) => mockUpgradePrompt(props),
}));

jest.mock('../views/OverviewAnalyticsView', () => ({
  OverviewAnalyticsView: (props: AnalyticsViewProps) => mockOverview(props),
}));

jest.mock('../views/SpendingAnalyticsView', () => ({
  SpendingAnalyticsView: (props: AnalyticsViewProps) => mockSpending(props),
}));

jest.mock('../views/CategoriesAnalyticsView', () => ({
  CategoriesAnalyticsView: (props: AnalyticsViewProps) => mockCategories(props),
}));

jest.mock('../views/AttentionAnalyticsView', () => ({
  AttentionAnalyticsView: (props: AnalyticsViewProps) => mockAttention(props),
}));

jest.mock('../views/ForecastAnalyticsView', () => ({
  ForecastAnalyticsView: (props: AnalyticsViewProps) => mockForecast(props),
}));

jest.mock('../views/DataQualityAnalyticsView', () => ({
  DataQualityAnalyticsView: (props: AnalyticsViewProps) => mockDataQuality(props),
}));

const personalScope = { kind: 'personal' } as const;
const groupScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
} as const;

describe('AnalyticsWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOverview.mockImplementation((props: AnalyticsViewProps) => {
      void props;
      return <div data-testid="overview-view">Overview view</div>;
    });
    mockUseSubscription.mockReturnValue({
      hasProAccess: true,
      loading: false,
    });
  });

  it('opens personal analytics on the monthly Overview with locale currency', () => {
    render(<AnalyticsWorkspace scope={personalScope} />);

    expect(screen.getByTestId('overview-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('combobox', { name: 'Analytics period' })).toHaveValue(
      'month'
    );
    expect(mockOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: personalScope,
        period: 'month',
        currency: expect.objectContaining({ locale: 'en-GB', currency: 'GBP' }),
      })
    );
    expect(
      screen.getByRole('tab', { name: 'Data Quality' })
    ).toBeInTheDocument();
  });

  it('changes the global period and mounts only the selected completed view', async () => {
    const user = userEvent.setup();
    render(<AnalyticsWorkspace scope={personalScope} />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Analytics period' }),
      'quarter'
    );
    expect(mockOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({ period: 'quarter' })
    );

    await user.click(screen.getByRole('tab', { name: 'Spending' }));
    expect(screen.queryByTestId('overview-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('spending-view')).toBeInTheDocument();
    expect(mockSpending).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: personalScope, period: 'quarter' })
    );
    expect(mockCategories).not.toHaveBeenCalled();
    expect(mockAttention).not.toHaveBeenCalled();
    expect(mockForecast).not.toHaveBeenCalled();
    expect(mockDataQuality).not.toHaveBeenCalled();
  });

  it('uses the group-only view list and never exposes personal data quality', () => {
    render(<AnalyticsWorkspace scope={groupScope} />);

    expect(
      screen.getByRole('heading', { name: 'Home analytics' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Data Quality' })).not.toBeInTheDocument();
    expect(mockOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: groupScope })
    );
    expect(mockDataQuality).not.toHaveBeenCalled();
  });

  it('remounts active evidence before a new scope can paint stale values', () => {
    mockOverview.mockImplementation((props) => (
      <StatefulOverviewMock {...props} />
    ));
    const firstGroup = {
      kind: 'group',
      groupId: 'group-first',
      groupName: 'First',
    } as const;
    const secondGroup = {
      kind: 'group',
      groupId: 'group-second',
      groupName: 'Second',
    } as const;
    const rendered = render(<AnalyticsWorkspace scope={firstGroup} />);
    expect(screen.getByTestId('stateful-overview')).toHaveTextContent(
      'group:group-first:month'
    );

    rendered.rerender(<AnalyticsWorkspace scope={secondGroup} />);

    expect(screen.getByTestId('stateful-overview')).toHaveTextContent(
      'group:group-second:month'
    );
    expect(screen.queryByText('group:group-first:month')).not.toBeInTheDocument();
  });

  it('renders a workspace-shaped loading state without mounting a view', () => {
    mockUseSubscription.mockReturnValue({
      hasProAccess: false,
      loading: true,
    });

    render(<AnalyticsWorkspace scope={personalScope} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading analytics workspace'
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Personal analytics' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('analytics-skeleton-geometry')).toBeInTheDocument();
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockUpgradePrompt).not.toHaveBeenCalled();
  });

  it('renders one upgrade prompt and mounts no analytics view when locked', () => {
    mockUseSubscription.mockReturnValue({
      hasProAccess: false,
      loading: false,
    });

    render(<AnalyticsWorkspace scope={personalScope} />);

    expect(screen.getAllByTestId('upgrade-prompt')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Personal analytics' })
    ).toBeInTheDocument();
    expect(mockUpgradePrompt).toHaveBeenCalledWith({
      feature: 'Advanced Analytics',
    });
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockSpending).not.toHaveBeenCalled();
    expect(mockCategories).not.toHaveBeenCalled();
    expect(mockAttention).not.toHaveBeenCalled();
    expect(mockForecast).not.toHaveBeenCalled();
    expect(mockDataQuality).not.toHaveBeenCalled();
  });
});
