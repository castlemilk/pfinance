import { render, waitFor } from '@testing-library/react';

import CountUp from '@/components/gamma/CountUp';

describe('CountUp retargeting', () => {
  it('shows the new value after the target changes', async () => {
    const { container, rerender } = render(
      <CountUp to={100} prefix="$" decimals={0} duration={0} trigger="load" />
    );
    const visual = () => container.querySelector('.gamma-count-up__text');

    await waitFor(() => expect(visual()).toHaveTextContent('$100'));

    rerender(<CountUp to={250} prefix="$" decimals={0} duration={0} trigger="load" />);
    await waitFor(() => expect(visual()).toHaveTextContent('$250'));

    rerender(<CountUp to={40} prefix="$" decimals={0} duration={0} trigger="load" />);
    await waitFor(() => expect(visual()).toHaveTextContent('$40'));
  });
});
