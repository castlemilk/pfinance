import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Navbar from '@/app/(marketing)/components/Navbar';

jest.mock('@/app/components/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

describe('Marketing mobile navigation', () => {
  it('labels the disclosure and connects it to the mobile panel', async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    const openButton = screen.getByRole('button', { name: 'Open menu' });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    expect(openButton).toHaveAttribute('aria-controls', 'mobile-navigation');

    await user.click(openButton);

    const closeButton = screen.getByRole('button', { name: 'Close menu' });
    const panel = document.getElementById('mobile-navigation');
    expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toBeNull();

    await user.click(closeButton);
    await waitFor(() => expect(document.getElementById('mobile-navigation')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
