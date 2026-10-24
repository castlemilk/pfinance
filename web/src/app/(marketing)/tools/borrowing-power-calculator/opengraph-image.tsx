import { ImageResponse } from 'next/og';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { OgCard, OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og-card';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const page = getDiscoveryPage('/tools/borrowing-power-calculator');

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard eyebrow={page.eyebrow ?? 'Free calculator'} title={page.title} sub="Free in-browser tool" />,
    size
  );
}
