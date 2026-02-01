/**
 * Dashboard Export Utility
 * 
 * Provides functions to export dashboard visualizations as PDF documents
 * using html2canvas for capturing DOM elements and jsPDF for PDF generation.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Export options for PDF generation
 */
export interface ExportOptions {
  /** Title to display on the PDF */
  title?: string;
  /** Subtitle for additional context */
  subtitle?: string;
  /** Include timestamp in the filename */
  includeTimestamp?: boolean;
  /** Scale factor for image quality (default: 2 for high quality) */
  scale?: number;
  /** PDF orientation */
  orientation?: 'portrait' | 'landscape';
  /** PDF page size */
  pageSize?: 'a4' | 'letter' | 'legal';
  /** Background color for the capture */
  backgroundColor?: string;
  /** Add page numbers */
  includePageNumbers?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: number, message: string) => void;
}

/**
 * Default export options
 */
const defaultOptions: Required<Omit<ExportOptions, 'onProgress'>> = {
  title: 'Financial Report',
  subtitle: '',
  includeTimestamp: true,
  scale: 2,
  orientation: 'portrait',
  pageSize: 'a4',
  backgroundColor: '#ffffff',
  includePageNumbers: true,
};

/**
 * Page dimensions in mm for different page sizes
 */
const pageDimensions = {
  a4: { width: 210, height: 297 },
  letter: { width: 216, height: 279 },
  legal: { width: 216, height: 356 },
};

/**
 * Captures a DOM element as a canvas image
 */
async function captureElement(
  element: HTMLElement,
  options: Pick<ExportOptions, 'scale' | 'backgroundColor'>
): Promise<HTMLCanvasElement> {
  const { scale = 2, backgroundColor = '#ffffff' } = options;

  // Temporarily apply export-friendly styles
  const originalBackground = element.style.backgroundColor;
  element.style.backgroundColor = backgroundColor;

  // Add a class to handle any print-specific styles
  element.classList.add('export-mode');

  try {
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor,
      logging: false,
      // Ensure SVGs are captured properly
      foreignObjectRendering: true,
      // Remove any scrolling issues
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    return canvas;
  } finally {
    // Restore original styles
    element.style.backgroundColor = originalBackground;
    element.classList.remove('export-mode');
  }
}

/**
 * Generates a filename for the export
 */
function generateFilename(title: string, includeTimestamp: boolean): string {
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (includeTimestamp) {
    const timestamp = new Date().toISOString().slice(0, 10);
    return `${sanitizedTitle}-${timestamp}.pdf`;
  }

  return `${sanitizedTitle}.pdf`;
}

/**
 * Adds a cover page to the PDF
 */
function addCoverPage(
  pdf: jsPDF,
  title: string,
  subtitle: string,
  pageWidth: number,
  pageHeight: number
): void {
  // Title
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, pageWidth / 2, pageHeight / 3, { align: 'center' });

  // Subtitle
  if (subtitle) {
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'normal');
    pdf.text(subtitle, pageWidth / 2, pageHeight / 3 + 15, { align: 'center' });
  }

  // Date
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  pdf.text(`Generated on ${dateStr}`, pageWidth / 2, pageHeight / 3 + 35, { align: 'center' });

  // Branding
  pdf.setFontSize(10);
  pdf.setTextColor(128, 128, 128);
  pdf.text('PFinance', pageWidth / 2, pageHeight - 20, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
}

/**
 * Adds page numbers to the PDF
 */
function addPageNumbers(pdf: jsPDF, pageWidth: number, pageHeight: number): void {
  const totalPages = pdf.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.setTextColor(128, 128, 128);
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }
}

/**
 * Main export function - captures a DOM element and exports it as a PDF
 */
export async function exportDashboardToPdf(
  element: HTMLElement,
  options: ExportOptions = {}
): Promise<void> {
  const mergedOptions = { ...defaultOptions, ...options };
  const {
    title,
    subtitle,
    includeTimestamp,
    scale,
    orientation,
    pageSize,
    backgroundColor,
    includePageNumbers,
    onProgress,
  } = mergedOptions;

  try {
    // Report progress
    onProgress?.(10, 'Preparing export...');

    // Get page dimensions
    const dimensions = pageDimensions[pageSize];
    const pageWidth = orientation === 'portrait' ? dimensions.width : dimensions.height;
    const pageHeight = orientation === 'portrait' ? dimensions.height : dimensions.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation: orientation === 'portrait' ? 'p' : 'l',
      unit: 'mm',
      format: pageSize,
    });

    onProgress?.(20, 'Capturing dashboard...');

    // Capture the element as canvas
    const canvas = await captureElement(element, { scale, backgroundColor });

    onProgress?.(60, 'Generating PDF...');

    // Calculate image dimensions to fit the page
    const imgData = canvas.toDataURL('image/png', 1.0);
    const imgWidth = pageWidth - 20; // 10mm margin on each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add cover page
    addCoverPage(pdf, title, subtitle || '', pageWidth, pageHeight);

    // Calculate how many pages we need for the content
    const contentAreaHeight = pageHeight - 30; // Leave margin for header/footer
    const pagesNeeded = Math.ceil(imgHeight / contentAreaHeight);

    // Add content pages
    for (let page = 0; page < pagesNeeded; page++) {
      pdf.addPage();

      // Calculate the portion of the image to show on this page
      const sourceY = page * contentAreaHeight * (canvas.height / imgHeight);
      const sourceHeight = Math.min(
        contentAreaHeight * (canvas.height / imgHeight),
        canvas.height - sourceY
      );

      // Create a temporary canvas for this page's portion
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const ctx = pageCanvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          sourceHeight
        );

        const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
        const pageImgHeight = (sourceHeight * imgWidth) / canvas.width;

        pdf.addImage(pageImgData, 'PNG', 10, 15, imgWidth, pageImgHeight);
      }

      onProgress?.(60 + (30 * (page + 1)) / pagesNeeded, `Processing page ${page + 2}...`);
    }

    // Add page numbers if requested
    if (includePageNumbers) {
      addPageNumbers(pdf, pageWidth, pageHeight);
    }

    onProgress?.(95, 'Saving PDF...');

    // Generate filename and save
    const filename = generateFilename(title, includeTimestamp);
    pdf.save(filename);

    onProgress?.(100, 'Export complete!');
  } catch (error) {
    console.error('Failed to export dashboard:', error);
    throw new Error(
      `Failed to export dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Quick export function with minimal options
 */
export async function quickExportToPdf(
  element: HTMLElement,
  title: string = 'Financial Report'
): Promise<void> {
  return exportDashboardToPdf(element, { title });
}

/**
 * Export a single chart or visualization to PDF
 */
export async function exportChartToPdf(
  element: HTMLElement,
  chartName: string
): Promise<void> {
  return exportDashboardToPdf(element, {
    title: chartName,
    subtitle: 'Chart Export',
    orientation: 'landscape',
    scale: 3, // Higher quality for single charts
  });
}

/**
 * Capture a DOM element as a PNG data URL
 * Useful for embedding in other documents or previews
 */
export async function captureAsImage(
  element: HTMLElement,
  options: Pick<ExportOptions, 'scale' | 'backgroundColor'> = {}
): Promise<string> {
  const canvas = await captureElement(element, options);
  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Download a captured image directly
 */
export async function downloadAsImage(
  element: HTMLElement,
  filename: string = 'chart.png',
  options: Pick<ExportOptions, 'scale' | 'backgroundColor'> = {}
): Promise<void> {
  const dataUrl = await captureAsImage(element, options);
  
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
