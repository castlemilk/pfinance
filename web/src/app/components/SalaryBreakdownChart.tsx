'use client';

import { useMemo } from 'react';
import { Pie } from '@visx/shape';
import { Group } from '@visx/group';
import { Text } from '@visx/text';
import { scaleOrdinal } from '@visx/scale';
import { ParentSize } from '@visx/responsive';
import { LegendOrdinal } from '@visx/legend';
import { useTooltip, Tooltip, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { useFinance } from '../context/FinanceContext';
import { getTaxSystem } from '../constants/taxSystems';

interface SalaryBreakdownChartProps {
  grossIncome: number;
  tax: number;
  medicare: number;
  studentLoan: number;
  superannuation: number;
  voluntarySuper?: number;
  overtime?: number;
  fringeBenefits?: number;
  salarySacrifice?: number;
}

type SalaryBreakdownItem = {
  key: string;
  label: string;
  amount: number;
  color: string;
};

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: 'white',
  color: 'black',
  border: '1px solid #ddd',
  borderRadius: '4px',
  boxShadow: '0 1px 10px rgba(0,0,0,0.2)',
  padding: '8px 12px',
  fontSize: '14px',
  minWidth: '150px',
};

export default function SalaryBreakdownChart({
  grossIncome,
  tax,
  medicare,
  studentLoan,
  superannuation,
  voluntarySuper = 0,
  overtime = 0,
  fringeBenefits = 0,
  salarySacrifice = 0
}: SalaryBreakdownChartProps) {
  const { taxConfig } = useFinance();
  
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<SalaryBreakdownItem>();

  // Format currency based on amount
  const formatCurrency = (amount: number) => {
    // Get currency code from tax system
    const currencyCode = getTaxSystem(taxConfig.country).currency;
    
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Create the data structure
  const data = useMemo(() => {
    // Voluntary super reduces taxable income and tax paid (adjust the netIncome)
    // The tax benefit would be approximately the marginal tax rate minus the super contribution tax (15%)
    const marginalTaxRate = 0.325; // Simplified estimate - ideally this would be calculated from actual tax bands
    const superTaxRate = 0.15;
    const taxSaving = voluntarySuper * (marginalTaxRate - superTaxRate);
    
    // Tax paid is reduced by the tax saving
    const adjustedTax = Math.max(0, tax - taxSaving);
    
    // Net income is reduced by voluntary super and non-deductible salary sacrifice
    // We're assuming salarySacrifice passed to this component is only the non-deductible portion
    const netIncome = grossIncome - adjustedTax - medicare - studentLoan - voluntarySuper - salarySacrifice;
    
    // Total super is regular plus voluntary
    const totalSuper = superannuation + voluntarySuper;
    
    const result = [
      {
        key: 'netIncome',
        label: 'Net Income',
        amount: netIncome,
        color: '#7dd3fc' // light blue
      },
      {
        key: 'tax',
        label: 'Income Tax',
        amount: adjustedTax,
        color: '#fb923c' // orange
      },
      {
        key: 'medicare',
        label: 'Medicare Levy',
        amount: medicare,
        color: '#a78bfa' // purple
      },
      {
        key: 'studentLoan',
        label: 'Student Loan',
        amount: studentLoan,
        color: '#fcd34d' // yellow
      },
      {
        key: 'super',
        label: 'Superannuation',
        amount: totalSuper,
        color: '#4ade80' // green
      }
    ];
    
    // Add overtime if it exists
    if (overtime > 0) {
      result.push({
        key: 'overtime',
        label: 'Overtime',
        amount: overtime,
        color: '#f87171' // red
      });
    }
    
    // Add fringe benefits if they exist
    if (fringeBenefits > 0) {
      result.push({
        key: 'fringeBenefits',
        label: 'Fringe Benefits',
        amount: fringeBenefits,
        color: '#c084fc' // purple
      });
    }
    
    // Add salary sacrifice if it exists (only include non-deductible portion in the chart)
    if (salarySacrifice > 0) {
      result.push({
        key: 'salarySacrifice',
        label: 'Salary Sacrifice',
        amount: salarySacrifice,
        color: '#60a5fa' // blue
      });
    }
    
    return result.filter(item => item.amount > 0);
  }, [grossIncome, tax, medicare, studentLoan, superannuation, voluntarySuper, overtime, fringeBenefits, salarySacrifice]);

  // Create color scale
  const colorScale = useMemo(
    () => scaleOrdinal({
      domain: data.map(d => d.key),
      range: data.map(d => d.color),
    }),
    [data]
  );

  // Calculate total and percentages
  const total = useMemo(() => 
    data.reduce((acc, item) => acc + item.amount, 0),
    [data]
  );

  // Handle mouse/touch events for tooltips
  const handleMouseMove = (event: React.MouseEvent<SVGPathElement> | React.TouchEvent<SVGPathElement>, item: SalaryBreakdownItem) => {
    // Get the relative position within the SVG
    const coords = localPoint(event) || { x: 0, y: 0 };
    
    // Show the tooltip with the data from the hovered segment
    showTooltip({
      tooltipData: item,
      tooltipLeft: coords.x,
      tooltipTop: coords.y
    });
  };

  return (
    <div className="relative" style={{ minHeight: '360px' }}>
      <div className="mb-6 flex justify-center">
        <LegendOrdinal
          scale={colorScale}
          direction="row"
          labelFormat={label => {
            const item = data.find(d => d.key === label);
            return item ? item.label : label;
          }}
          labelMargin="0 15px 0 0"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2"
        />
      </div>
      
      <ParentSize>
        {({ width }) => {
          const radius = Math.min(width, 400) / 2;
          const centerY = 180;
          const centerX = width / 2;
          
          return (
            <div className="relative" style={{ width: '100%', height: '360px' }}>
              <svg width={width} height={360}>
                <Group top={centerY} left={centerX}>
                  <Pie
                    data={data}
                    pieValue={d => d.amount}
                    outerRadius={radius - 20}
                    innerRadius={radius * 0.6}
                    cornerRadius={3}
                    padAngle={0.02}
                  >
                    {pie => {
                      return pie.arcs.map((arc, index) => {
                        const { key, amount } = arc.data;
                        const [centroidX, centroidY] = pie.path.centroid(arc);
                        const hasSpaceForLabel = arc.endAngle - arc.startAngle > 0.2;
                        const arcPath = pie.path(arc) || '';
                        const arcFill = colorScale(key);
                        const percentage = (amount / total) * 100;
                        
                        return (
                          <g key={`pie-arc-${key}-${index}`}>
                            <path 
                              d={arcPath} 
                              fill={arcFill} 
                              onMouseMove={(e) => handleMouseMove(e, arc.data)}
                              onMouseLeave={() => hideTooltip()}
                              onTouchStart={(e) => handleMouseMove(e, arc.data)}
                              onTouchMove={(e) => handleMouseMove(e, arc.data)}
                              className="transition-opacity duration-200 hover:opacity-80 cursor-pointer"
                            />
                            {hasSpaceForLabel && (
                              <Text
                                x={centroidX}
                                y={centroidY}
                                dy=".33em"
                                fontSize={14}
                                textAnchor="middle"
                                fill="#ffffff"
                                fontWeight="bold"
                              >
                                {`${Math.round(percentage)}%`}
                              </Text>
                            )}
                          </g>
                        );
                      });
                    }}
                  </Pie>
                  <Text textAnchor="middle" fontSize={20} fontWeight="bold" dy={-20}>
                    {formatCurrency(grossIncome + superannuation)}
                  </Text>
                  <Text textAnchor="middle" fontSize={14} fill="#6b7280" dy={10}>
                    Total Package
                  </Text>
                </Group>
              </svg>
            </div>
          );
        }}
      </ParentSize>
      
      {tooltipOpen && tooltipData && tooltipLeft != null && tooltipTop != null && (
        <Tooltip
          key={Math.random()} // Force rerender on content change
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...tooltipStyles,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
          }}
          className="z-50"
        >
          <div 
            className="font-bold" 
            style={{ color: tooltipData.color, fontSize: '16px', marginBottom: '4px' }}
          >
            {tooltipData.label}
          </div>
          <div className="font-bold text-black">{formatCurrency(tooltipData.amount)}</div>
          <div className="text-xs text-gray-500">
            {((tooltipData.amount / total) * 100).toFixed(1)}% of total
          </div>
        </Tooltip>
      )}
      
      {/* Display the summary stats in a clean grid */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        {data.map(item => (
          <div 
            key={item.key} 
            className="p-2 rounded-md text-center"
            style={{ backgroundColor: `${item.color}20` }} // 20 for opacity
          >
            <p className="text-xs font-medium">{item.label}</p>
            <p className="text-sm font-bold">{formatCurrency(item.amount)}</p>
            <p className="text-xs text-muted-foreground">
              {((item.amount / total) * 100).toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
} 