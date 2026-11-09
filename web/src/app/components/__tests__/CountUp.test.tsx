import { render } from '@testing-library/react';

import CountUp from '@/components/gamma/CountUp';

describe('CountUp accessible output', () => {
  it('exposes only the final rounded value to assistive technology', () => {
    const { container } = render(
      <CountUp
        to={136908.00410900835}
        prefix="$"
        separator=","
        decimals={0}
        duration={0}
        trigger="load"
      />
    );

    const visualValue = container.querySelector('.gamma-count-up__text');
    const accessibleValue = container.querySelector('.gamma-count-up__sr');

    expect(visualValue).toHaveAttribute('aria-hidden', 'true');
    expect(accessibleValue).toHaveTextContent('$136,908');
    expect(accessibleValue).not.toHaveAttribute('aria-hidden');
  });

  it('hides every animated roll slot from assistive technology', () => {
    const { container } = render(
      <CountUp to={12500} format="compact" mode="roll" trigger="load" />
    );

    expect(container.querySelector('.gamma-count-up__slots')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(container.querySelector('.gamma-count-up__sr')).toHaveTextContent('12.5K');
  });
});
