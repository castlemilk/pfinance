import { pfinanceTheme } from '@/lib/pdf-themes/pfinance';

import { ReportTemplateFrame } from './report-layout';
import type { ReportTemplateProps } from './report.types';

export const FinancialReportDocument = ({
  theme = pfinanceTheme,
  data,
}: ReportTemplateProps) => <ReportTemplateFrame theme={theme} data={data} />;
