import { ImageResponse } from 'next/og';
import { OgCard, OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og-card';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="Compare"
      title="PFinance vs the Alternatives"
      sub="Spreadsheets, apps, and bank feeds compared for Australian households"
    />,
    size
  );
}
