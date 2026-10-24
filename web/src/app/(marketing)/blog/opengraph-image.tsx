import { ImageResponse } from 'next/og';
import { OgCard, OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og-card';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="Blog"
      title="Australian Personal Finance Guides"
      sub="Tax deductions, budgets, HECS, offsets & household money"
    />,
    size
  );
}
