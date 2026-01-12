'use client';

import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Pie } from '@visx/shape';
import { Group } from '@visx/group';
import { Text } from '@visx/text';
import { scaleOrdinal } from '@visx/scale';
import { ParentSize } from '@visx/responsive';
import { LegendOrdinal } from '@visx/legend';
import { IncomeFrequency } from '../types';

// Import from the new metrics layer
import { usePieChartData } from '../metrics/hooks/useVisualizationData';
import { formatCurrency } from '../metrics/utils/currency';
import { getCurrencyForCountry } from '../metrics/utils/currency';

interface ExpenseChartProps {
  displayPeriod: IncomeFrequency;
}

export default function ExpenseChart({ displayPeriod }: ExpenseChartProps) {
  const { incomes, expenses, taxConfig } = useFinance();
  
  // Use the new visualization data hook
  const { expensePieChart, hasData } = usePieChartData(
    incomes,
    expenses,
    taxConfig,
    { displayPeriod }
  );

  const currency = getCurrencyForCountry(taxConfig.country);

  // Calculate total for center display
  const totalExpenses = useMemo(() => {
    return expensePieChart.reduce((sum, item) => sum + item.value, 0);
  }, [expensePieChart]);
  
  // Create color scale from the pre-computed data
  const colorScale = useMemo(
    () => scaleOrdinal({
      domain: expensePieChart.map(d => d.label),
      range: expensePieChart.map(d => d.color),
    }),
    [expensePieChart]
  );

  // Format currency based on amount
  const formatAmount = (amount: number) => {
    return formatCurrency(amount, currency, {
      maximumFractionDigits: amount < 10 ? 2 : 0
    });
  };

  if (!hasData || expensePieChart.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-center text-muted-foreground">
          No expense data to visualize yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex justify-center">
        <LegendOrdinal
          scale={colorScale}
          direction="row"
          labelMargin="0 15px 0 0"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2"
        />
      </div>
      <ParentSize>
        {({ width }) => {
          const radius = Math.min(width, 400) / 2;
          const centerY = 200;
          const centerX = width / 2;
          
          return (
            <svg width={width} height={400}>
              <Group top={centerY} left={centerX}>
                <Pie
                  data={expensePieChart}
                  pieValue={d => d.value}
                  outerRadius={radius - 20}
                  innerRadius={radius * 0.5}
                  cornerRadius={3}
                  padAngle={0.01}
                >
                  {pie => {
                    return pie.arcs.map((arc, index) => {
                      const { label, percentage, color } = arc.data;
                      const [centroidX, centroidY] = pie.path.centroid(arc);
                      const hasSpaceForLabel = arc.endAngle - arc.startAngle > 0.1;
                      const arcPath = pie.path(arc) || '';
                      
                      return (
                        <g key={`pie-arc-${label}-${index}`}>
                          <path d={arcPath} fill={color} />
                          {hasSpaceForLabel && (
                            <Text
                              x={centroidX}
                              y={centroidY}
                              dy=".33em"
                              fontSize={14}
                              textAnchor="middle"
                              fill="#ffffff"
                            >
                              {`${Math.round(percentage)}%`}
                            </Text>
                          )}
                        </g>
                      );
                    });
                  }}
                </Pie>
                <Text textAnchor="middle" fontSize={20} dy={-20}>
                  {`Total: ${formatAmount(totalExpenses)}`}
                </Text>
                <Text textAnchor="middle" fontSize={14} dy={10}>
                  {displayPeriod === 'annually' ? 'per year' : 
                   displayPeriod === 'monthly' ? 'per month' : 
                   displayPeriod === 'fortnightly' ? 'per fortnight' : 
                   'per week'}
                </Text>
              </Group>
            </svg>
          );
        }}
      </ParentSize>
    </div>
  );
}
