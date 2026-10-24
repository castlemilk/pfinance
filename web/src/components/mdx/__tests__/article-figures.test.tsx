import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import {
  Callout,
  Quote,
  Steps,
  GraphStat,
  GraphKpi,
  GraphSlope,
  GraphRank,
  GraphTimeline,
  GraphTable,
  GraphSpark,
  GraphMeter,
  GraphWaterfall,
  GraphCompare,
  GraphFlow,
} from '../article-figures';
import { parseRankItems, parseStatItems } from '../article-figure-data';

describe('MDX article figure components', () => {
  it('renders Callout as an aside with role="note" and preserves title/corner', () => {
    render(
      <Callout type="tip" title="ATO rule" corner="D1–D15">
        <p>Keep receipts for five years.</p>
      </Callout>
    );
    const aside = screen.getByRole('note');
    expect(aside).toHaveAttribute('data-article-callout');
    expect(aside.textContent).toContain('ATO rule');
    expect(aside.textContent).toContain('D1–D15');
    expect(aside.textContent).toContain('Keep receipts for five years.');
  });

  it('renders GraphStat, GraphRank, GraphWaterfall, GraphFlow, GraphTimeline, GraphCompare, GraphSlope, Steps, Quote, GraphKpi, GraphSpark, GraphMeter, and GraphTable from JSON string attributes', () => {
    const html = renderToStaticMarkup(
      <div>
        <Quote by="ATO Guide" source="Substantiation">
          Keep written evidence for five years.
        </Quote>
        <Steps
          title="Pipeline"
          items='[{"title":"Capture","description":"Scan receipt","state":"done"},{"title":"Export","state":"next"}]'
        />
        <GraphStat
          title="Thresholds"
          items='[{"value":"$300","label":"receipt threshold","accent":true},{"value":"5 yrs","label":"retention","hint":"from lodgement"}]'
        />
        <GraphRank
          title="Deduction comparison"
          max="1200"
          items='[{"label":"Actual cost","value":1152,"display":"$1,152","accent":true},{"label":"Fixed rate","value":515,"display":"$515"}]'
        />
        <GraphWaterfall
          title="Salary flow"
          items='[{"label":"Gross","value":110000,"kind":"start"},{"label":"Sacrifice","value":-10000,"kind":"out"},{"label":"Taxable","value":100000,"kind":"end"}]'
        />
        <GraphFlow
          title="Import flow"
          rows='[{"nodes":[{"label":"Upload PDF"},{"label":"Review Draft","tone":"accent"}]}]'
        />
        <GraphTimeline
          title="EOFY timeline"
          events='[{"date":"1 July","label":"Start FY","state":"done"},{"date":"30 June","label":"End FY","state":"now"}]'
        />
        <GraphCompare
          title="Method comparison"
          columns='["Fixed","Actual"]'
          rows='[{"label":"Separate phone claim","values":[false,true]}]'
          accent="Actual"
        />
        <GraphSlope
          title="Bill audit"
          fromLabel="Before"
          toLabel="After"
          items='[{"label":"Insurance","from":3450,"to":2790}]'
        />
        <GraphKpi
          title="Savings rate"
          value="20%"
          label="Target rate"
          hint="Monthly"
          data="12 15 18 20"
        />
        <GraphSpark title="Trend" data="[10, 20, 15, 30]" caption="Four quarters" />
        <GraphMeter title="Budget used" value="65%" caption="Groceries" />
        <GraphTable
          title="Schedule"
          headers='["Category","Amount"]'
          rows='[["D5 Home Office","$1,152"]]'
        />
      </div>
    );

    expect(html).toContain('ATO Guide');
    expect(html).toContain('Scan receipt');
    expect(html).toContain('$300');
    expect(html).toContain('$1,152');
    expect(html).toContain('110,000');
    expect(html).toContain('Review Draft');
    expect(html).toContain('30 June');
    expect(html).toContain('Separate phone claim');
    expect(html).toContain('Insurance');
    expect(html).toContain('65%');
    expect(html).toContain('D5 Home Office');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('rejects malformed figure JSON visibly', () => {
    expect(() => parseStatItems('not-json')).toThrow(/valid JSON array/);
    expect(() => parseRankItems('[{"label":"Bad","value":"n/a"}]')).toThrow(/invalid data/);
  });
});
