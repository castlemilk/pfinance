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
import { categoryColors } from '../constants/theme';

interface ExpenseChartProps {
  displayPeriod: IncomeFrequency;
}

export default function ExpenseChart({ displayPeriod }: ExpenseChartProps) {
  const { getExpenseSummary, getTotalExpenses } = useFinance();
  const expenseSummary = getExpenseSummary();
  const totalExpenses = getTotalExpenses();
  
  // Convert expenses to the selected frequency
  const convertedExpenses = useMemo(() => {
    return expenseSummary.map(expense => {
      const annualAmount = expense.totalAmount;
      const convertedAmount = 
        displayPeriod === 'weekly' ? annualAmount / 52 :
        displayPeriod === 'fortnightly' ? annualAmount / 26 :
        displayPeriod === 'monthly' ? annualAmount / 12 :
        annualAmount;
      
      return {
        ...expense,
        totalAmount: convertedAmount
      };
    });
  }, [expenseSummary, displayPeriod]);
  
  // Convert total expenses to the selected frequency
  const convertedTotalExpenses = useMemo(() => {
    return displayPeriod === 'weekly' ? totalExpenses / 52 :
           displayPeriod === 'fortnightly' ? totalExpenses / 26 :
           displayPeriod === 'monthly' ? totalExpenses / 12 :
           totalExpenses;
  }, [totalExpenses, displayPeriod]);
  
  // Create color scale
  const colorScale = useMemo(
    () => scaleOrdinal({
      domain: convertedExpenses.map(d => d.category),
      range: categoryColors,
    }),
    [convertedExpenses]
  );

  // Format currency based on amount
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: amount < 10 ? 2 : 0
    }).format(amount);
  };

  if (convertedExpenses.length === 0) {
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
                  data={convertedExpenses}
                  pieValue={d => d.totalAmount}
                  outerRadius={radius - 20}
                  innerRadius={radius * 0.5}
                  cornerRadius={3}
                  padAngle={0.01}
                >
                  {pie => {
                    return pie.arcs.map((arc, index) => {
                      const { category } = arc.data;
                      const [centroidX, centroidY] = pie.path.centroid(arc);
                      const hasSpaceForLabel = arc.endAngle - arc.startAngle > 0.1;
                      const arcPath = pie.path(arc) || '';
                      const arcFill = colorScale(category);
                      
                      return (
                        <g key={`pie-arc-${category}-${index}`}>
                          <path d={arcPath} fill={arcFill} />
                          {hasSpaceForLabel && (
                            <Text
                              x={centroidX}
                              y={centroidY}
                              dy=".33em"
                              fontSize={14}
                              textAnchor="middle"
                              fill="#ffffff"
                            >
                              {`${Math.round(arc.data.percentage)}%`}
                            </Text>
                          )}
                        </g>
                      );
                    });
                  }}
                </Pie>
                <Text textAnchor="middle" fontSize={20} dy={-20}>
                  {`Total: ${formatCurrency(convertedTotalExpenses)}`}
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