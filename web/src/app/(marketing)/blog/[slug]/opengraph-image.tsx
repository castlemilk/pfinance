import { ImageResponse } from 'next/og';
import { getAllPosts, getPostBySlug } from '@/lib/blog';

export const alt = 'PFinance Article Guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function BlogOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  const title = post?.title ?? 'Australian Personal & Household Finance Guide';
  const category = post?.category ?? 'PFinance Guide';
  const readingTime = post?.readingTime ?? '5 min read';

  return new ImageResponse(
    (
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
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
            {category}
          </div>
          <div style={{ fontSize: '22px', color: '#9ca3af' }}>{readingTime}</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
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
    ),
    size
  );
}
