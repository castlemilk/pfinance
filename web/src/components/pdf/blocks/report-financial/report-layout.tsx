import { Badge } from '@/components/pdf/badge/badge';
import { DataTable } from '@/components/pdf/data-table/data-table';
import { PdfGraph } from '@/components/pdf/graph/graph';
import { PageHeader } from '@/components/pdf/page-header/page-header';
import { Section } from '@/components/pdf/section/section';
import { Text } from '@/components/pdf/text/text';
import {
  PdfcnThemeProvider,
  usePdfcnTheme,
} from '@/components/pdf/theme-provider';
import { Document, Page, StyleSheet, View } from '@/lib/pdf-primitives';
import type { PdfcnTheme } from '@/types/pdf-themes';

import type {
  FinancialReportData,
  ReportTemplateProps,
  ReportTone,
} from './report.types';

const toneColor = (theme: PdfcnTheme, tone: ReportTone) => {
  if (tone === 'success') return theme.colors.success;
  if (tone === 'warning') return theme.colors.warning;
  if (tone === 'destructive') return theme.colors.destructive;
  return theme.colors.info;
};

export const ReportLayout = ({ data }: { data: FinancialReportData }) => {
  const theme = usePdfcnTheme();
  const chartCategories = data.expenseCategories.slice(0, 5);
  const styles = StyleSheet.create({
    graphShell: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
      borderRadius: theme.primitives.borderRadius.md,
      borderStyle: 'solid',
      borderWidth: 1,
      padding: 12,
    },
    metricCard: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
      borderRadius: theme.primitives.borderRadius.md,
      borderStyle: 'solid',
      borderWidth: 1,
      padding: 8,
      width: '48.6%',
    },
    metricLabel: {
      color: theme.colors.mutedForeground,
      fontSize: 8,
      letterSpacing: 0.5,
      marginBottom: 2,
      textTransform: 'uppercase',
    },
    metricValue: {
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: theme.primitives.fontWeights.bold,
      marginBottom: 4,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    meta: {
      alignItems: 'flex-end',
      gap: 2,
      maxWidth: '65%',
    },
    page: {
      backgroundColor: theme.colors.background,
      boxSizing: 'border-box',
      paddingBottom: theme.spacing.page.marginBottom,
    },
    pageBreak: {
      breakAfter: 'page',
    },
    toolbar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
  });

  return (
    <Document title={data.title}>
      <Page size="A4" style={[styles.page, styles.pageBreak]}>
        <PageHeader
          variant="two-column"
          title={data.title}
          subtitle={data.subtitle}
          marginBottom={14}
        />

        <View style={styles.toolbar}>
          <Badge label={`Summary ${data.period}`} variant="info" size="sm" />
          <View style={styles.meta}>
            <Text align="right" variant="xs" color="mutedForeground" noMargin>
              Prepared for {data.author}
            </Text>
            <Text align="right" variant="xs" color="mutedForeground" noMargin>
              Generated {data.generatedAt}
            </Text>
          </View>
        </View>

        <Section variant="card" padding="md" spacing="sm">
          <Text variant="sm" transform="uppercase" color="mutedForeground">
            Financial summary ({data.currency})
          </Text>
          <View style={styles.metricsGrid}>
            {data.summary.map((metric) => (
              <View
                key={metric.label}
                style={[
                  styles.metricCard,
                  {
                    borderLeftColor: toneColor(theme, metric.tone ?? 'info'),
                    borderLeftWidth: 3,
                  },
                ]}
              >
                <Text style={styles.metricLabel} noMargin>
                  {metric.label}
                </Text>
                <Text style={styles.metricValue} noMargin>
                  {metric.value}
                </Text>
                {metric.detail ? (
                  <Badge
                    label={metric.detail}
                    size="sm"
                    variant={metric.tone ?? 'info'}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </Section>

        <Section padding="md" spacing="sm" style={{ marginBottom: 0 }}>
          <Text variant="sm" transform="uppercase" color="mutedForeground">
            Expense overview
          </Text>
          {chartCategories.length > 1 ? (
            <View style={styles.graphShell}>
              <PdfGraph
                variant="horizontal-bar"
                data={chartCategories.map((category) => ({
                  label: category.category,
                  value: category.amount,
                }))}
                title="Largest expense categories"
                subtitle={`Amounts in ${data.currency} ${data.period}`}
                showGrid={false}
                showValues={false}
                legend="none"
                height={Math.max(150, chartCategories.length * 34)}
                colors={[theme.colors.primary]}
                fullWidth
                containerPadding={12}
                wrapperPadding={12}
                style={{ marginBottom: 0 }}
              />
            </View>
          ) : chartCategories.length === 1 ? (
            <View style={[styles.metricCard, { width: '100%' }]}>
              <Text style={styles.metricLabel} noMargin>
                {chartCategories[0].category}
              </Text>
              <Text style={styles.metricValue} noMargin>
                {chartCategories[0].formattedAmount}
              </Text>
              <Text variant="xs" color="mutedForeground" noMargin>
                100% of recorded expenses
              </Text>
            </View>
          ) : (
            <Text variant="sm" color="mutedForeground">
              No expense data is available for this report.
            </Text>
          )}
        </Section>
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader
          variant="two-column"
          title="Report details"
          subtitle={`${data.title} ${data.period}`}
          marginBottom={14}
        />

        <Section padding="md" spacing="sm">
          <Text variant="sm" transform="uppercase" color="mutedForeground">
            Expense categories
          </Text>
          {data.expenseCategories.length > 0 ? (
            <DataTable
              variant="compact"
              size="compact"
              columns={[
                { header: 'Category', key: 'category' },
                { align: 'right', header: 'Amount', key: 'formattedAmount' },
                {
                  align: 'right',
                  header: 'Share',
                  key: 'percentage',
                  render: (value) => `${Number(value).toFixed(1)}%`,
                },
              ]}
              data={data.expenseCategories}
              footer={{
                category: 'Total expenses',
                formattedAmount: data.totals.expenses,
                percentage: '100.0%',
              }}
            />
          ) : (
            <Text variant="sm" color="mutedForeground">
              No expense categories are available.
            </Text>
          )}
        </Section>

        <Section padding="md" spacing="sm">
          <Text variant="sm" transform="uppercase" color="mutedForeground">
            Income sources
          </Text>
          {data.incomeSources.length > 0 ? (
            <DataTable
              variant="compact"
              size="compact"
              columns={[
                { header: 'Source', key: 'source' },
                { align: 'right', header: 'Gross amount', key: 'formattedAmount' },
                {
                  align: 'right',
                  header: 'Share',
                  key: 'percentage',
                  render: (value) => `${Number(value).toFixed(1)}%`,
                },
              ]}
              data={data.incomeSources}
              footer={{
                source: 'Total gross income',
                formattedAmount: data.totals.income,
                percentage: '100.0%',
              }}
            />
          ) : (
            <Text variant="sm" color="mutedForeground">
              No income sources are available.
            </Text>
          )}
        </Section>

        <Section
          variant="card"
          padding="sm"
          spacing="sm"
          style={{ marginBottom: 0 }}
        >
          <Text variant="xs" color="mutedForeground" noMargin>
            Recurring entries are normalized to the selected period. One-time
            expenses are treated as annual amounts before conversion.
          </Text>
        </Section>
      </Page>
    </Document>
  );
};

export const ReportTemplateFrame = ({ theme, data }: ReportTemplateProps) => (
  <PdfcnThemeProvider theme={theme}>
    <ReportLayout data={data} />
  </PdfcnThemeProvider>
);
