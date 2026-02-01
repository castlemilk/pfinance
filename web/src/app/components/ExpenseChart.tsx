'use client';

import { useMemo, useCallback, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Pie } from '@visx/shape';
import { Group } from '@visx/group';
import { Text } from '@visx/text';
import { scaleOrdinal } from '@visx/scale';
import { ParentSize } from '@visx/responsive';
import { LegendOrdinal } from '@visx/legend';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { IncomeFrequency } from '../types';

// Import from the new metrics layer
import { usePieChartData } from '../metrics/hooks/useVisualizationData';
import { formatCurrency } from '../metrics/utils/currency';
import { getCurrencyForCountry } from '../metrics/utils/currency';

interface TooltipData {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

interface ExpenseChartProps {
  displayPeriod: IncomeFrequency;
}

export default function ExpenseChart({ displayPeriod }: ExpenseChartProps) {
  const { incomes, expenses, taxConfig } = useFinance();
  const [activeArc, setActiveArc] = useState<string | null>(null);
  
  // Use the new visualization data hook
  const { expensePieChart, hasData } = usePieChartData(
    incomes,
    expenses,
    taxConfig,
    { displayPeriod }
  );

  const currency = getCurrencyForCountry(taxConfig.country);
  
  // Setup tooltip
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip<TooltipData>();

  // Calculate total for center display
  const totalExpenses = useMemo(() => {
    return expensePieChart.reduce((sum, item) => sum + item.value, 0);
  }, [expensePieChart]);
  
  // Handle arc hover
  const handleArcMouseMove = useCallback(
    (event: React.MouseEvent<SVGPathElement>, data: TooltipData) => {
      const coords = localPoint(event);
      setActiveArc(data.label);
      showTooltip({
        tooltipData: data,
        tooltipLeft: coords?.x ?? 0,
        tooltipTop: coords?.y ?? 0,
      });
    },
    [showTooltip]
  );
  
  const handleArcMouseLeave = useCallback(() => {
    setActiveArc(null);
    hideTooltip();
  }, [hideTooltip]);
  
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
    <div className="relative h-full flex flex-col">
      <div className="mb-4 flex justify-center flex-shrink-0">
        <LegendOrdinal
          scale={colorScale}
          direction="row"
          labelMargin="0 15px 0 0"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2"
        />
      </div>
      <div className="flex-1 min-h-0">
        <ParentSize>
          {({ width, height }) => {
            const chartHeight = Math.max(height, 200);
            const radius = Math.min(width, chartHeight) / 2 - 10;
            const centerY = chartHeight / 2;
            const centerX = width / 2;
          
          return (
            <svg width={width} height={chartHeight}>
              <defs>
                <filter id="segment-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodOpacity="0.5" />
                </filter>
              </defs>
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
                    // Sort arcs to render active one last (on top)
                    const sortedArcs = [...pie.arcs].sort((a, b) => {
                      if (a.data.label === activeArc) return 1;
                      if (b.data.label === activeArc) return -1;
                      return 0;
                    });
                    
                    return sortedArcs.map((arc, index) => {
                      const { label, percentage, color, value } = arc.data;
                      const [centroidX, centroidY] = pie.path.centroid(arc);
                      const hasSpaceForLabel = arc.endAngle - arc.startAngle > 0.1;
                      const arcPath = pie.path(arc) || '';
                      const isActive = activeArc === label;
                      
                      return (
                        <g key={`pie-arc-${label}-${index}`}>
                          <path 
                            d={arcPath} 
                            fill={color}
                            style={{ 
                              cursor: 'pointer',
                              transition: 'filter 0.15s ease-out',
                              filter: isActive ? 'url(#segment-glow) brightness(1.15) saturate(1.2)' : 'none',
                            }}
                            onMouseMove={(e) => handleArcMouseMove(e, { label, value, percentage, color })}
                            onMouseLeave={handleArcMouseLeave}
                          />
                          {hasSpaceForLabel && (
                            <Text
                              x={centroidX}
                              y={centroidY}
                              dy=".33em"
                              fontSize={14}
                              textAnchor="middle"
                              fill="#ffffff"
                              style={{ pointerEvents: 'none' }}
                            >
                              {`${Math.round(percentage)}%`}
                            </Text>
                          )}
                        </g>
                      );
                    });
                  }}
                </Pie>
                <Text textAnchor="middle" fontSize={20} dy={-20} className="fill-foreground">
                  {`Total: ${formatAmount(totalExpenses)}`}
                </Text>
                <Text textAnchor="middle" fontSize={14} dy={10} className="fill-muted-foreground">
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

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            minWidth: '140px',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div 
              className="w-3 h-3 rounded-sm" 
              style={{ backgroundColor: tooltipData.color }}
            />
            <span className="font-medium">{tooltipData.label}</span>
          </div>
          <div className="text-lg font-semibold">{formatAmount(tooltipData.value)}</div>
          <div className="text-xs text-muted-foreground">
            {tooltipData.percentage.toFixed(1)}% of total
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}
