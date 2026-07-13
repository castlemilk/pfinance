import { fireEvent, render, screen, within } from '@testing-library/react';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';

import { useExtractionMetrics } from '@/app/metrics/hooks/useExtractionMetrics';
import {
  DocumentType,
  ExtractionMethod,
} from '@/gen/pfinance/v1/types_pb';

import { DataQualityAnalyticsView } from '../DataQualityAnalyticsView';

import type { ExtractionEvent } from '@/gen/pfinance/v1/types_pb';
import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsScope,
} from '../../types';

jest.mock('@/app/metrics/hooks/useExtractionMetrics', () => ({
  useExtractionMetrics: jest.fn(),
}));

const personalScope = { kind: 'personal' } as const satisfies AnalyticsScope;
const groupScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
} as const satisfies AnalyticsScope;

const formatMoney = jest.fn((amount: number) => `AUD ${amount.toFixed(2)}`);
const formatDate = jest.fn((value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `date ${date.toISOString().slice(0, 10)}`;
});
const currency: AnalyticsCurrencyContext = {
  locale: 'en-AU',
  currency: 'AUD',
  formatMoney,
  formatDate,
};

const refetch = jest.fn();
const mockedMetrics = useExtractionMetrics as jest.Mock;

function extractionEvent(
  id: string,
  overrides: Partial<ExtractionEvent> = {}
): ExtractionEvent {
  return {
    $typeName: 'pfinance.v1.ExtractionEvent',
    id,
    userId: 'person-1',
    method: ExtractionMethod.GEMINI,
    transactionCount: 5,
    acceptedCount: 3,
    rejectedCount: 1,
    correctedCount: 1,
    overallConfidence: 0.82,
    processingTimeMs: 1_250,
    documentType: DocumentType.RECEIPT,
    createdAt: timestampFromDate(new Date('2026-07-12T03:00:00.000Z')),
    ...overrides,
  };
}

function metricsData(overrides: Record<string, unknown> = {}) {
  return {
    totalExtractions: 4,
    totalTransactions: 12,
    totalCorrections: 3,
    correctionRate: 0.25,
    averageConfidence: 0.875,
    correctionsByField: {
      CORRECTION_FIELD_TYPE_CATEGORY: 2,
      CORRECTION_FIELD_TYPE_DESCRIPTION: 1,
    },
    correctionsByCategory: {
      EXPENSE_CATEGORY_FOOD: 2,
    },
    recentEvents: [
      extractionEvent('event-stable'),
      extractionEvent('   ', {
        documentType: DocumentType.BANK_STATEMENT,
        transactionCount: 2,
        acceptedCount: 2,
        rejectedCount: 0,
        correctedCount: 0,
        overallConfidence: 0.94,
        processingTimeMs: 930,
        createdAt: timestampFromDate(new Date('2026-07-10T03:00:00.000Z')),
      }),
    ],
    ...overrides,
  };
}

function metricsResult(overrides: Record<string, unknown> = {}) {
  return {
    data: metricsData(),
    loading: false,
    error: null,
    refetch,
    ...overrides,
  };
}

function renderView(
  period: AnalyticsPeriod = 'month',
  scope: AnalyticsScope = personalScope
) {
  return render(
    <DataQualityAnalyticsView
      scope={scope}
      period={period}
      currency={currency}
    />
  );
}

describe('DataQualityAnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMetrics.mockReturnValue(metricsResult());
  });

  it.each([
    ['month', 30],
    ['quarter', 90],
    ['year', 365],
  ] as const)('maps the %s workspace period to exactly %i days', (period, days) => {
    renderView(period);

    expect(mockedMetrics).toHaveBeenLastCalledWith(days);
  });

  it('does not mount personal extraction metrics for a group scope', () => {
    renderView('month', groupScope);

    expect(mockedMetrics).not.toHaveBeenCalled();
    expect(screen.queryByText('Data quality')).not.toBeInTheDocument();
  });

  it('prioritises a geometry-matched loading state over stale data and errors', () => {
    mockedMetrics.mockReturnValue(
      metricsResult({ loading: true, error: 'Stale extraction failure' })
    );

    renderView();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading data quality analytics'
    );
    expect(screen.getByTestId('analytics-chart-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Review quality' })).not.toBeInTheDocument();
  });

  it('wires a settled metrics failure to the hook refetch', () => {
    mockedMetrics.mockReturnValue(
      metricsResult({ data: null, error: 'Extraction metrics are unavailable' })
    );

    renderView();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Extraction metrics are unavailable'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses the exact existing import destination when no extraction exists', () => {
    mockedMetrics.mockReturnValue(
      metricsResult({ data: metricsData({ totalExtractions: 0, recentEvents: [] }) })
    );

    renderView();

    expect(
      screen.getByRole('link', { name: 'Import a receipt or statement' })
    ).toHaveAttribute('href', '/personal/expenses#smart-expense-entry');
    expect(screen.queryByRole('heading', { name: 'Review quality' })).not.toBeInTheDocument();
  });

  it('leads with correction and review outcomes while keeping latency secondary', () => {
    renderView();

    const reviewSection = screen.getByRole('region', { name: 'Review quality' });
    expect(within(reviewSection).getByText('25.0%')).toHaveClass('tabular-nums');
    expect(within(reviewSection).getByText('3')).toHaveClass('tabular-nums');
    expect(within(reviewSection).getByText('12')).toHaveClass('tabular-nums');
    expect(within(reviewSection).getByText('87.5%')).toHaveClass('tabular-nums');
    expect(within(reviewSection).queryByText(/1,250\s*ms/i)).not.toBeInTheDocument();

    const eventsSection = screen.getByRole('region', {
      name: 'Recent extraction reviews',
    });
    expect(within(eventsSection).getByText(/1,250\s*ms/i)).toHaveClass(
      'tabular-nums'
    );
  });

  it('links only stable-ID events to the import anchor without inventing query parameters', () => {
    renderView();

    const receipt = screen.getByRole('article', {
      name: 'Receipt extraction from date 2026-07-12',
    });
    const receiptLink = within(receipt).getByRole('link', {
      name: 'Review receipt extraction',
    });
    expect(receiptLink).toHaveAttribute(
      'href',
      '/personal/expenses#smart-expense-entry'
    );
    expect(receiptLink.getAttribute('href')).not.toContain('?');
    expect(receiptLink.getAttribute('href')).not.toContain('event-stable');

    const statement = screen.getByRole('article', {
      name: 'Bank statement extraction from date 2026-07-10',
    });
    expect(
      within(statement).queryByRole('link', {
        name: /review bank statement extraction/i,
      })
    ).not.toBeInTheDocument();
    expect(within(statement).getByText('Review unavailable')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('gives its disclosure control an accessible name and exposes tabular event values', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Show data table' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Recent extraction review details')).toBeInTheDocument();
    expect(
      within(table).getByRole('row', {
        name: 'Receipt date 2026-07-12 5 3 1 1 82.0% 1,250 ms',
      })
    ).toBeInTheDocument();
    expect(table).toHaveClass('tabular-nums');
  });
});
