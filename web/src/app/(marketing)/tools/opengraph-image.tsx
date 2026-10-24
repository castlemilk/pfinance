import { ImageResponse } from 'next/og';
import { OgCard, OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og-card';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="Free tools"
      title="Australian Finance Calculators"
      sub="Salary, budget, super, WFH, mortgage offset, HECS, debt payoff & insurance"
    />,
    size
  );
}
