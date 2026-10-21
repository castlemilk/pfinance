import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SuperCalculator from '../SuperCalculator';

// JSDOM has no layout. Give the real SVG chart a concrete viewport.
jest.mock('@visx/responsive', () => ({ ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) => children({ width: 640, height: 280 }) }));

function enter(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('SuperCalculator', () => {
  it('updates chart, totals and accessible breakdown from the requested assumptions', () => {
    render(<SuperCalculator />);
    enter(/Starting super balance/, '1000');
    enter(/Average annual contributions/, '100');
    enter(/Assumed annual return/, '5');
    enter(/Years to project/, '2');
    expect(screen.getByTestId('super-projected-balance')).toHaveTextContent('$1,308');
    expect(screen.getByRole('img', { name: /Projected super balance/ })).toBeInTheDocument();
    expect(screen.getByText('Year-by-year breakdown')).toBeInTheDocument();
    expect(screen.getByText(/added at the end of each year/)).toBeInTheDocument();
    expect(screen.getByText(/not a forecast or personal financial advice/)).toBeInTheDocument();
  });
  it('does not silently convert blank input to zero or retain a stale result', () => {
    render(<SuperCalculator />);
    enter(/Starting super balance/, '');
    expect(screen.queryByTestId('super-projected-balance')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Starting super balance/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Enter valid assumptions');
  });
  it('supports losses and resets the complete example', () => {
    render(<SuperCalculator />);
    enter(/Assumed annual return/, '-10');
    expect(screen.getByText('Investment loss')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset example' }));
    expect(screen.getByLabelText(/Assumed annual return/)).toHaveValue(6);
    expect(screen.getByLabelText(/Years to project/)).toHaveValue(25);
    expect(screen.getByText('Investment growth')).toBeInTheDocument();
  });
  it('rejects fractional years and restores results after correction', () => {
    render(<SuperCalculator />);
    enter(/Years to project/, '1.5');
    expect(screen.queryByTestId('super-projected-balance')).not.toBeInTheDocument();
    enter(/Years to project/, '0');
    expect(screen.getByTestId('super-projected-balance')).toHaveTextContent('$100,000');
  });
});
