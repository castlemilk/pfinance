import { render, screen } from '@testing-library/react';

import AnalyticsPage from '../page';

import type { AnalyticsScope } from '@/app/components/analytics/types';

const mockWorkspace = jest.fn(
  ({ scope }: { scope: AnalyticsScope }) => (
    <div data-testid="analytics-workspace">{scope.kind} workspace</div>
  )
);

jest.mock('@/app/components/analytics/AnalyticsWorkspace', () => ({
  AnalyticsWorkspace: (props: { scope: AnalyticsScope }) =>
    mockWorkspace(props),
}));

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mockWorkspace.mockClear();
  });

  it('constructs personal scope and delegates the experience to the workspace', () => {
    render(<AnalyticsPage />);

    expect(screen.getByTestId('analytics-workspace')).toHaveTextContent(
      'personal workspace'
    );
    expect(mockWorkspace).toHaveBeenCalledWith({
      scope: { kind: 'personal' },
    });
  });
});
