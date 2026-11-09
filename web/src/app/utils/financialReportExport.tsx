import { FinancialReportDocument } from '@/components/pdf/blocks/report-financial/report-financial';
import { FinancialReportFooter } from '@/components/pdf/blocks/report-financial/report-footer';
import type { FinancialReportData } from '@/components/pdf/blocks/report-financial/report.types';
import { pointToCssPixel } from '@/lib/pdf-primitives';
import { pfinanceTheme } from '@/lib/pdf-themes/pfinance';

interface FinancialReportExportOptions {
  onProgress?: (progress: number, message: string) => void;
}

type TakumiRender = typeof import('takumi-pdf/no-init').render;

let takumiRenderPromise: Promise<TakumiRender> | undefined;

async function getTakumiRender(): Promise<TakumiRender> {
  if (!takumiRenderPromise) {
    takumiRenderPromise = (async () => {
      const [takumi, { default: wasmUrl }] = await Promise.all([
        import('takumi-pdf/no-init'),
        import('takumi-pdf/wasm-url'),
      ]);
      await takumi.default({ module_or_path: wasmUrl });
      return takumi.render;
    })().catch((error: unknown) => {
      takumiRenderPromise = undefined;
      throw error;
    });
  }

  return takumiRenderPromise;
}

function reportFilename(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'financial-report';
  return `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const buffer = bytes.slice().buffer;
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    // Revoking in the same tick can cancel the download in Firefox and Safari.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Render a structured PFinance document with pdfcn and Takumi, without capturing the DOM. */
export async function exportFinancialReportToPdf(
  data: FinancialReportData,
  { onProgress }: FinancialReportExportOptions = {}
): Promise<void> {
  onProgress?.(10, 'Loading PDF renderer...');
  const render = await getTakumiRender();

  onProgress?.(40, 'Rendering financial report...');
  const bytes = await render(<FinancialReportDocument data={data} />, {
    size: 'a4',
    margin: {
      top: pointToCssPixel(pfinanceTheme.spacing.page.marginTop),
      right: pointToCssPixel(pfinanceTheme.spacing.page.marginRight),
      bottom: 'auto',
      left: pointToCssPixel(pfinanceTheme.spacing.page.marginLeft),
    },
    footer: <FinancialReportFooter />,
    backgroundColor: '#ffffff',
    fontFamilies: ['Geist'],
    lang: 'en',
    metadata: {
      title: data.title,
      description: data.subtitle,
      authors: [data.author],
      creator: 'PFinance',
    },
  });

  onProgress?.(90, 'Preparing download...');
  downloadPdf(bytes, reportFilename(data.title));
  onProgress?.(100, 'Export complete!');
}
