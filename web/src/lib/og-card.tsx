import React from 'react';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';
export const OG_ALT = 'PFinance — Australian personal and household finance';

interface OgCardProps {
  eyebrow: string;
  title: string;
  sub?: string;
}

/** Shared 1200x630 social card layout for opengraph-image routes. */
export function OgCard({ eyebrow, title, sub }: OgCardProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0f1115',
        color: '#f7f4eb',
        padding: '64px',
        fontFamily: 'monospace',
        border: '2px solid #2b261d',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: '#251e12',
            border: '1px solid #f59e0b',
            color: '#f59e0b',
            padding: '8px 18px',
            borderRadius: '999px',
            fontSize: '22px',
            fontWeight: 700,
          }}
        >
          {eyebrow}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            fontSize: title.length > 55 ? '50px' : '58px',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: '#ffffff',
          }}
        >
          {title}
        </div>
        {sub ? (
          <div style={{ fontSize: '26px', color: '#9ca3af', lineHeight: 1.4 }}>{sub}</div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #27272a',
          paddingTop: '28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '28px', fontWeight: 700 }}>
          <span style={{ color: '#ffffff' }}>P</span>
          <span style={{ color: '#f59e0b' }}>Finance</span>
          <span style={{ color: '#9ca3af', fontSize: '22px', fontWeight: 400 }}>
            · Australian Personal &amp; Household Finance
          </span>
        </div>
        <div style={{ fontSize: '22px', color: '#f59e0b' }}>pfinance.dev</div>
      </div>
    </div>
  );
}
