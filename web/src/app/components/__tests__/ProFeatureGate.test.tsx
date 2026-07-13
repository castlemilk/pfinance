import { render, screen } from '@testing-library/react';

import { ProFeatureGate, UpgradePrompt } from '../ProFeatureGate';

const mockUseSubscription = jest.fn();

jest.mock('@/app/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

describe('ProFeatureGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubscription.mockReturnValue({
      hasProAccess: false,
      loading: false,
    });
  });

  it('uses palette tokens and one accessible billing link for its full prompt', () => {
    const { container } = render(<UpgradePrompt feature="Advanced Analytics" />);

    const link = screen.getByRole('link', { name: 'Upgrade to Pro' });
    expect(link).toHaveAttribute('href', '/personal/billing');
    expect(link).toHaveClass('min-h-10');
    expect(link.closest('button')).toBeNull();
    expect(container.querySelector('a button, button a')).toBeNull();
    expect(container.innerHTML).not.toMatch(/amber|orange|gradient/i);
    expect(container.querySelector('.text-foreground')).not.toBeNull();
    expect(
      container.querySelector('[class~="bg-primary/10"]')
    ).not.toBeNull();
  });

  it('gives the compact upgrade link a readable 40px target and palette accent', () => {
    render(<UpgradePrompt feature="Analytics" compact />);

    const link = screen.getByRole('link', { name: 'Upgrade to unlock' });
    expect(link).toHaveClass(
      'min-h-10',
      'text-foreground',
      'underline',
      'decoration-primary/50'
    );
    expect(link.className).not.toMatch(/amber|orange/);
  });

  it('renders the prompt heading at the requested semantic level', () => {
    render(
      <UpgradePrompt
        feature="Advanced Analytics"
        headingLevel={2}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Pro feature' })
    ).toBeInTheDocument();
  });

  it('passes a configured heading level through the locked feature gate', () => {
    render(
      <ProFeatureGate feature="Forecast" headingLevel={4}>
        <p>Forecast content</p>
      </ProFeatureGate>
    );

    expect(
      screen.getByRole('heading', { level: 4, name: 'Pro feature' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Forecast content')).not.toBeInTheDocument();
  });
});
