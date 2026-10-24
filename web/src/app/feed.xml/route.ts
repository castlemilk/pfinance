import { buildRssFeedXml } from '@/lib/rss';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildRssFeedXml(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
