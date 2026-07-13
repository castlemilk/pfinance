import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AccessibleDataSummary } from '../AccessibleDataSummary';

describe('AccessibleDataSummary', () => {
  let pointerDescriptors: Record<string, PropertyDescriptor | undefined>;

  beforeEach(() => {
    pointerDescriptors = Object.fromEntries(
      ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
      ])
    );
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
    });
  });

  afterEach(() => {
    for (const [name, descriptor] of Object.entries(pointerDescriptors)) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
      }
    }
  });

  const columns = ['Date', 'Expenses', 'Income'] as const;
  const rows = [
    ['1 Jul 2026', '$48.20', '$0.00'],
    ['8 Jul 2026', '$72.10', '$950.00'],
  ] as const;

  it('starts collapsed with a focusable 40px disclosure', async () => {
    const user = userEvent.setup();
    render(
      <AccessibleDataSummary caption="Weekly cash flow" columns={columns} rows={rows} />
    );

    const disclosure = screen.getByRole('button', { name: 'Show data table' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure).toHaveClass('min-h-10');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.tab();
    expect(disclosure).toHaveFocus();
  });

  it('renders the exact semantic table and closes again by click', async () => {
    const user = userEvent.setup();
    render(
      <AccessibleDataSummary caption="Weekly cash flow" columns={columns} rows={rows} />
    );

    await user.click(screen.getByRole('button', { name: 'Show data table' }));

    const disclosure = screen.getByRole('button', { name: 'Hide data table' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table', { name: 'Weekly cash flow' });
    expect(within(table).getByText('Weekly cash flow', { selector: 'caption' })).toBeInTheDocument();
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(columns);
    headers.forEach((header) => expect(header).toHaveAttribute('scope', 'col'));
    expect(
      within(table)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(rows.flat());
    within(table)
      .getAllByRole('cell')
      .forEach((cell) => expect(cell).toHaveClass('tabular-nums'));

    await user.click(disclosure);
    expect(screen.getByRole('button', { name: 'Show data table' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('opens and closes from the keyboard with reduced-motion-safe chevron feedback', async () => {
    const user = userEvent.setup();
    render(
      <AccessibleDataSummary caption="Weekly cash flow" columns={columns} rows={rows} />
    );

    await user.tab();
    await user.keyboard('{Enter}');
    const disclosure = screen.getByRole('button', { name: 'Hide data table' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const chevron = within(disclosure).getByTestId('data-summary-chevron');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron).toHaveClass(
      'rotate-180',
      'transition-transform',
      'duration-150',
      'ease-out',
      'motion-reduce:transition-none'
    );

    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Show data table' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('never mutates readonly inputs', async () => {
    const user = userEvent.setup();
    const frozenColumns = Object.freeze(['Category', 'Amount']);
    const frozenRows = Object.freeze([
      Object.freeze(['Food', '$12.00']),
      Object.freeze(['Travel', '$35.00']),
    ]);
    const columnsBefore = [...frozenColumns];
    const rowsBefore = frozenRows.map((row) => [...row]);

    render(
      <AccessibleDataSummary
        caption="Category totals"
        columns={frozenColumns}
        rows={frozenRows}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Show data table' }));

    expect(frozenColumns).toEqual(columnsBefore);
    expect(frozenRows).toEqual(rowsBefore);
  });

  it('tolerates duplicate row and cell text without unstable-key warnings', async () => {
    const user = userEvent.setup();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AccessibleDataSummary
        caption="Repeated values"
        columns={['Value', 'Value']}
        rows={[
          ['Same', 'Same'],
          ['Same', 'Same'],
        ]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Show data table' }));

    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === 'string' && value.includes('unique "key" prop')
        )
      )
    ).toBe(false);
    consoleError.mockRestore();
  });

  it('keeps empty and headerless data safe without inventing values', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AccessibleDataSummary caption="No rows yet" columns={[]} rows={[]} />
    );

    await user.click(screen.getByRole('button', { name: 'Show data table' }));
    let table = screen.getByRole('table', { name: 'No rows yet' });
    expect(within(table).queryByRole('columnheader')).not.toBeInTheDocument();
    expect(within(table).queryByRole('cell')).not.toBeInTheDocument();

    rerender(
      <AccessibleDataSummary
        caption="Headerless values"
        columns={[]}
        rows={[['Supplied exactly']]}
      />
    );
    table = screen.getByRole('table', { name: 'Headerless values' });
    expect(within(table).getByRole('cell')).toHaveTextContent('Supplied exactly');
  });
});
