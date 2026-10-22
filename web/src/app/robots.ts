import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pfinance.dev';

  return {
    rules: [
      {
        userAgent: '*',
        // Marketing pages need these assets to render. Other framework paths
        // and authenticated application routes remain excluded below.
        allow: ['/', '/_next/static/', '/_next/image'],
        disallow: [
          '/personal/',
          '/shared/',
          '/auth/',
          '/api/',
          '/_next/',
          '/admin/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
