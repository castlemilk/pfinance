import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AnalyticsWorkspaceShell,
  GROUP_ANALYTICS_VIEWS,
  PERSONAL_ANALYTICS_VIEWS,
} from '../AnalyticsWorkspaceShell';
import {
  AnalyticsChartSkeleton,
  AnalyticsEmptyState,
  AnalyticsErrorState,
  AnalyticsInsufficientState,
} from '../AnalyticsStates';

import type { AnalyticsView } from '../AnalyticsWorkspaceShell';
import type { AnalyticsPeriod, AnalyticsScope } from '../types';

const PERSONAL_SCOPE = { kind: 'personal' } as const satisfies AnalyticsScope;
const GROUP_SCOPE = {
  kind: 'group',
  groupId: 'group-1',
  groupName: 'Merri House',
} as const satisfies AnalyticsScope;

const defaultViews = ['overview', 'spending', 'categories'] as const;

type ShellOverrides = Partial<{
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
  availableViews: readonly AnalyticsView[];
  children: React.ReactNode;
}>;

function shell(overrides: ShellOverrides = {}) {
  return (
    <AnalyticsWorkspaceShell
      scope={overrides.scope ?? PERSONAL_SCOPE}
      period={overrides.period ?? 'month'}
      onPeriodChange={overrides.onPeriodChange ?? jest.fn()}
      activeView={overrides.activeView ?? 'overview'}
      onViewChange={overrides.onViewChange ?? jest.fn()}
      availableViews={overrides.availableViews ?? defaultViews}
    >
      {overrides.children ?? <div data-testid="active-view-content">Decision content</div>}
    </AnalyticsWorkspaceShell>
  );
}

describe('AnalyticsWorkspaceShell', () => {
  let originalMatchMedia: typeof window.matchMedia;
  let pointerDescriptors: Record<string, PropertyDescriptor | undefined>;
  let scrollIntoViewDescriptor: PropertyDescriptor | undefined;
  let scrollIntoView: jest.Mock;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    pointerDescriptors = Object.fromEntries(
      ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
      ])
    );
    scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView'
    );
    scrollIntoView = jest.fn();

    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: {
        configurable: true,
        value: jest.fn(() => false),
      },
      setPointerCapture: {
        configurable: true,
        value: jest.fn(),
      },
      releasePointerCapture: {
        configurable: true,
        value: jest.fn(),
      },
      scrollIntoView: {
        configurable: true,
        value: scrollIntoView,
      },
    });
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;

    for (const [name, descriptor] of Object.entries(pointerDescriptors)) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
      }
    }

    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        scrollIntoViewDescriptor
      );
    } else {
      delete (
        HTMLElement.prototype as unknown as Record<string, unknown>
      ).scrollIntoView;
    }
  });

  it('renders a restrained personal page heading and explicit scope label', () => {
    render(shell());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Personal analytics' })
    ).toBeInTheDocument();
    expect(screen.getByText('Personal scope')).toBeInTheDocument();
  });

  it('names the active group without adding a second page h1', () => {
    render(shell({ scope: GROUP_SCOPE }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Merri House analytics' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText('Group scope')).toBeInTheDocument();
  });

  it('reports period selections through the controlled callback', async () => {
    const user = userEvent.setup();
    const onPeriodChange = jest.fn();
    render(shell({ onPeriodChange }));

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Analytics period' }),
      'quarter'
    );

    expect(onPeriodChange).toHaveBeenCalledWith('quarter');
  });

  it('reports view selections while leaving selection controlled by the caller', async () => {
    const user = userEvent.setup();
    const onViewChange = jest.fn();
    const { rerender } = render(shell({ onViewChange }));

    await user.click(screen.getByRole('tab', { name: 'Spending' }));

    expect(onViewChange).toHaveBeenCalledWith('spending');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    rerender(shell({ activeView: 'spending', onViewChange }));
    expect(screen.getByRole('tab', { name: 'Spending' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('deduplicates views in caller order and renders children in one visible slot', () => {
    render(
      shell({
        availableViews: ['spending', 'overview', 'spending', 'categories'],
        activeView: 'spending',
      })
    );

    expect(screen.getAllByTestId('active-view-content')).toHaveLength(1);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Spending',
      'Overview',
      'Categories',
    ]);
    expect(screen.getByRole('tabpanel')).toHaveClass(
      'fade-in-0',
      'slide-in-from-bottom-2',
      'duration-150',
      'motion-reduce:animate-none'
    );
  });

  it('exports immutable personal and group view sets with personal-only data quality', () => {
    expect(Object.isFrozen(PERSONAL_ANALYTICS_VIEWS)).toBe(true);
    expect(Object.isFrozen(GROUP_ANALYTICS_VIEWS)).toBe(true);
    expect(PERSONAL_ANALYTICS_VIEWS).toEqual([
      'overview',
      'spending',
      'categories',
      'attention',
      'forecast',
      'data-quality',
    ]);
    expect(GROUP_ANALYTICS_VIEWS).toEqual([
      'overview',
      'spending',
      'categories',
      'attention',
      'forecast',
    ]);
  });

  it('withholds rejected group content and normalizes the controlled view at most once', async () => {
    const firstOnViewChange = jest.fn();
    const replacementOnViewChange = jest.fn();
    const { rerender } = render(
      shell({
        scope: GROUP_SCOPE,
        activeView: 'data-quality',
        onViewChange: firstOnViewChange,
        availableViews: ['data-quality', 'overview', 'data-quality', 'forecast'],
        children: <div>Data quality hooks mounted</div>,
      })
    );

    expect(screen.queryByRole('tab', { name: 'Data Quality' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByText('Data quality hooks mounted')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(firstOnViewChange).toHaveBeenCalledWith('overview')
    );
    expect(firstOnViewChange).toHaveBeenCalledTimes(1);

    rerender(
      shell({
        scope: GROUP_SCOPE,
        activeView: 'data-quality',
        onViewChange: replacementOnViewChange,
        availableViews: ['data-quality', 'overview', 'forecast'],
        children: <div>Data quality hooks mounted</div>,
      })
    );
    expect(screen.queryByText('Data quality hooks mounted')).not.toBeInTheDocument();
    expect(firstOnViewChange).toHaveBeenCalledTimes(1);
    expect(replacementOnViewChange).not.toHaveBeenCalled();

    rerender(
      shell({
        scope: GROUP_SCOPE,
        activeView: 'overview',
        onViewChange: replacementOnViewChange,
        availableViews: ['data-quality', 'overview', 'forecast'],
        children: <div>Overview hooks mounted</div>,
      })
    );
    expect(screen.getByText('Overview hooks mounted')).toBeInTheDocument();
    expect(replacementOnViewChange).not.toHaveBeenCalled();
  });

  it('never mounts rejected content when no valid views remain', () => {
    const onViewChange = jest.fn();
    render(
      shell({
        scope: GROUP_SCOPE,
        activeView: 'data-quality',
        onViewChange,
        availableViews: ['data-quality'],
        children: <div>Data quality hooks mounted</div>,
      })
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Data quality hooks mounted')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Analytics content' })).toHaveTextContent(
      /no analytics view is available/i
    );
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('labels the navigation, selects the active tab, and contains horizontal overflow', () => {
    render(shell({ activeView: 'categories' }));

    const navigation = screen.getByRole('navigation', {
      name: 'Analytics views',
    });
    const rail = within(navigation).getByRole('tablist');
    const selected = within(navigation).getByRole('tab', { name: 'Categories' });

    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveClass('min-h-10');
    expect(rail).toHaveClass('overflow-x-auto', 'overscroll-x-contain');
    expect(navigation).toHaveClass('max-w-full', 'overflow-hidden');
    expect(selected).toHaveClass(
      'transition-[color,background-color,border-color,box-shadow]'
    );
    expect(selected).not.toHaveClass('transition-all');
  });

  it('scrolls a newly active view into sight with smooth nearest behavior', async () => {
    const { rerender } = render(shell());
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollIntoView.mockClear();

    rerender(shell({ activeView: 'spending' }));

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      })
    );
    expect(screen.getByRole('tab', { name: 'Spending' })).not.toHaveFocus();
  });

  it('uses instant active-view scrolling when reduced motion is requested', async () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { rerender } = render(shell());
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollIntoView.mockClear();

    rerender(shell({ activeView: 'categories' }));

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'auto',
      })
    );
  });

  it('guards missing browser motion and scrolling APIs', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    delete (
      HTMLElement.prototype as unknown as Record<string, unknown>
    ).scrollIntoView;

    expect(() => render(shell())).not.toThrow();
  });
});

describe('analytics states', () => {
  it('announces a geometry-matched chart and metric skeleton without repeated noise', () => {
    render(<AnalyticsChartSkeleton />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading analytics');
    expect(
      within(status).getAllByTestId('analytics-metric-skeleton')
    ).toHaveLength(4);
    expect(
      within(status).getByTestId('analytics-chart-skeleton')
    ).toBeInTheDocument();
    expect(within(status).getByTestId('analytics-skeleton-geometry')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('renders the exact error and a real retry control', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    render(<AnalyticsErrorState message="Forecast service is unavailable." onRetry={onRetry} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Forecast service is unavailable.');
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    expect(retry).toHaveClass('min-h-10');

    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      PERSONAL_SCOPE,
      'expenses',
      '/personal/expenses',
      'Add an expense',
      'No expenses are available for this analytics period.',
    ],
    [
      PERSONAL_SCOPE,
      'income',
      '/personal/income',
      'Add income',
      'No income is available for this analytics period.',
    ],
    [
      PERSONAL_SCOPE,
      'both',
      '/personal/expenses',
      'Add an expense',
      'No income or expenses are available for this analytics period.',
    ],
    [
      GROUP_SCOPE,
      'expenses',
      '/shared/expenses',
      'Add a group expense',
      'No expenses are available for Merri House during this analytics period.',
    ],
    [
      GROUP_SCOPE,
      'income',
      '/shared/income',
      'Add group income',
      'No income is available for Merri House during this analytics period.',
    ],
    [
      GROUP_SCOPE,
      'both',
      '/shared/expenses',
      'Add a group expense',
      'No income or expenses are available for Merri House during this analytics period.',
    ],
  ] as const)(
    'uses the scope-aware default action for %o missing %s',
    (scope, missing, href, label, expectedCopy) => {
      render(<AnalyticsEmptyState scope={scope} missing={missing} />);

      const action = screen.getByRole('link', { name: label });
      expect(action).toHaveAttribute('href', href);
      expect(action).toHaveClass('min-h-10');
      const state = action.closest('section');
      expect(state).toHaveTextContent(expectedCopy);
      expect(state).toHaveTextContent(/analytics period/i);
      expect(state).not.toHaveTextContent(/recorded/i);
      expect(state).not.toHaveTextContent(/\byet\b/i);
    }
  );

  it('uses a custom empty action exactly without leaking the default action', () => {
    render(
      <AnalyticsEmptyState
        scope={PERSONAL_SCOPE}
        missing="expenses"
        action={{ href: '/personal/import', label: 'Review imports' }}
      />
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/personal/import');
    expect(links[0]).toHaveTextContent('Review imports');
    expect(screen.queryByText('Add an expense')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/personal/expenses"]')).not.toBeInTheDocument();
    expect(links[0].closest('section')).toHaveTextContent(
      'No expenses are available for this analytics period.'
    );
    expect(links[0].closest('section')).not.toHaveTextContent(/recorded|\byet\b/i);
  });

  it('reports covered and uncovered categories without claiming a false all-clear', () => {
    const covered = Object.freeze(['Food', 'Housing']);
    const uncovered = Object.freeze(['Travel', 'Healthcare']);
    const coveredBefore = [...covered];
    const uncoveredBefore = [...uncovered];

    render(
      <AnalyticsInsufficientState
        title="More history needed"
        coveredCategories={covered}
        uncoveredCategories={uncovered}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'More history needed' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Covered categories' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Food', 'Housing']);
    expect(
      within(screen.getByRole('list', { name: 'Categories needing history' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Travel', 'Healthcare']);
    expect(screen.queryByText(/all categories have enough history/i)).not.toBeInTheDocument();
    expect(covered).toEqual(coveredBefore);
    expect(uncovered).toEqual(uncoveredBefore);
  });

  it('keeps covered-only and empty coverage qualified rather than implying all-clear', () => {
    const { rerender } = render(
      <AnalyticsInsufficientState
        title="Coverage status"
        coveredCategories={['Food']}
        uncoveredCategories={[]}
      />
    );

    let state = screen.getByRole('heading', { name: 'Coverage status' }).closest('section');
    expect(state).toHaveTextContent(/coverage details are incomplete/i);
    expect(state).toHaveTextContent(/more history is needed before drawing conclusions/i);
    expect(state).not.toHaveTextContent(/\ball\b/i);
    expect(state).not.toHaveTextContent(/all[- ]clear/i);
    expect(state).not.toHaveTextContent(/enough history for analysis/i);
    expect(
      within(screen.getByRole('list', { name: 'Covered categories' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Food']);
    expect(
      within(screen.getByRole('list', { name: 'Categories needing history' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['None reported']);

    rerender(
      <AnalyticsInsufficientState
        title="Coverage status"
        coveredCategories={[]}
        uncoveredCategories={[]}
      />
    );
    state = screen.getByRole('heading', { name: 'Coverage status' }).closest('section');
    expect(state).toHaveTextContent(/coverage details are incomplete/i);
    expect(state).toHaveTextContent(/more history is needed before drawing conclusions/i);
    expect(state).not.toHaveTextContent(/\ball\b/i);
    expect(state).not.toHaveTextContent(/all[- ]clear/i);
    expect(state).not.toHaveTextContent(/enough history for analysis/i);
  });
});
