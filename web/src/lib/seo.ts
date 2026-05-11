import type { Metadata } from 'next';

const SITE_NAME = 'PFinance';
const DEFAULT_SITE_URL = 'https://pfinance.app';
const DEFAULT_OG_IMAGE = '/og-image.png';

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

interface SeoMetadataOptions {
  title: string;
  description: string;
  path: string;
  imageAlt?: string;
}

export function createSeoMetadata({
  title,
  description,
  path,
  imageAlt = 'PFinance personal finance tracker',
}: SeoMetadataOptions): Metadata {
  const siteUrl = getSiteUrl();

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: SITE_NAME,
      url: `${siteUrl}${path}`,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}
